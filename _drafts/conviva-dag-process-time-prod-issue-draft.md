---
layout: post
title: "The Problem With Concurrent Hashmaps"
category: concurrency
---

## Setting The Stage

We recently faced an interesting production issue at [Conviva](https://www.conviva.com/), related to the time taken by our compute engine to process customer events.

On Feb 2nd, we noticed a recurring issue related to a specific customer where their P99 for processing time would absolutely shoot up. It was strange because we could only see it for a single customer which pointed to the issue most likely having to do with the customer's specific DAG.

![](/assets/img/conviva/rtve/traffic-from-gateway.png)

Our principal engineer, [Anil Gursel](https://www.linkedin.com/in/anilgursel/), led the initial charge of trying to debug the source of this issue. He eliminated the obvious issues - watermarking, inaccurate metrics etc.

There was some spirited discussion around whether the way [the Tokio runtime](https://github.com/tokio-rs/tokio) was scheduling its tasks across physical threads was causing issues but that seemed improbable given that we use an actor system and each DAG processing task runs independently on a specific actor, and it was unlikely that multiple actors were being scheduled onto the same underlying physical thread.

There were additional lines of inquiry around whether HDFS writes were what was causing the lag to build up and eventually causing a backpressure throughout the system. More analysis of more graphs showed increased context switching during the incident but with still no evidence of the cause.

## Analyzing The Evidence

Derek Dai, a Senior Engineer at Conviva, was able to reproduce the issue by saving the event data to GCS buckets and replaying this in a perf environment. This was a relief because at least the issue wasn't tied to production. That would have been a nightmare to debug.

We track active sessions across our state actors, so we have a reasonable measure of how much load our system is under. However, further analysis in the perf environment revealed that while there was a spike in the number of active sessions, those gradually dropped off while the DAG processing time continued to stay high.

![](/assets/img/conviva/rtve/active-session-count.png)

While this was still puzzling, at least we had a clear indication of where to look - inside our DAG compiler/engine. All the clues pointed to this as being the source of the issue for the P99 latency spike and the backpressure we were seeing throughout the system.

While we knew where to look, this investigation had already taken weeks and things took a turn for the worse when we hit the issue again on February 23rd. However, there was more evidence coming our way about where to look, all Grafana metrics pointed to DAG processing actually being the cause of slowdown.  Another interesting graph that came up was this one displaying the jump in context switches during the incident. While it didn't lead us directly to the root cause at that point, it became important later on as we identified the issue and resolved it because it tied in neatly with our analysis.

![](/assets/img/conviva/rtve/context-switches.png)

## Recreating The Crime Scene

Thanks to Derek's work in recreating the issue in a perf environment, we were able to generate these flamegraphs that highlighted hot paths in the code. The first one displays the flamegraph during normal traffic and the second one displays the flamegraph during the incident.

![](/assets/img/conviva/rtve/perf_normal_traffic.svg)
![](/assets/img/conviva/rtve/perf_incident_traffic.svg)

In the incident flamegraph, you can clearly see the dreaded wide bars which indicate longer processing time.

[Debasish Ghosh](https://www.linkedin.com/in/debasishgh/), a Principal Engineer at Conviva, pointed out that the flamegraph during the incident displayed a very high load for call paths involving `AtomicUsize::fetch_sub` which was being called from creating and dropping `ReadGuard` in [`flashmap`](https://github.com/Cassy343/flashmap) which we were using as a concurrent hash map. This concurrent hash map was being used as a type registry which was globally shared amongst all DAG's on all state actors.

In the context of this, the earlier graph about the context switches spiking during the incident time makes some sense. The `ReadGuard` in the hot path of the flamegraph was responsible for handling reads from various threads and each thread would increment and decrement the counter.

Now, one important thing about the hashmap in the type registry is that it is *almost* read-only. That is, it is initialized with some types on start-up and then only updated when a new type is seen but that rarely ever happened. However, on a critical path, it would keep checking to see if the type was already registered which is where the atomic increments and decrements were occurring.

Now, the question was what to do about this. In the [flashmap documentation](https://crates.io/crates/flashmap), the performance comparison shows that in the read-heavy scenario [`dashmap`](https://github.com/xacrimon/dashmap) performed better in terms of both latency & throughput. Unfortunately, replacing `flashmap` with `dashmap` did nothing to fix the performance problems. In fact, the flamegraphs turned out to be worse in the same situation with `dashmap`.

![](/assets/img/conviva/rtve/perf_incident_traffic_dashmapv2.svg)

Finally, [Evan Chan](https://www.linkedin.com/in/evanfchan/), a Principal Engineer at Conviva, implemented an [ArcSwap](https://github.com/vorner/arc-swap) based solution and the flamegraph for that was significantly better and the CPU load dropped to 40% in the perf environment.

## Post Mortem

So, ArcSwap finally fixed it but it is worthwhile to understand why exactly that worked where the concurrent hash maps had failed. To understand this better, look at this section below from a great PDF titled [What every systems programmer should know about concurrency](https://assets.bitbashing.io/papers/concurrency-primer.pdf) by [Matt Kline](https://github.com/mrkline).

![](/assets/img/conviva/rtve/cache_line_ping_pong.png)

Every CPU has a cache, and every cache requires loading data in from RAM. However, when you have a shared variable like a read counter that is being used by all the cores there is a critical problem under high contention. Each core is going to attempt to increment/decrement the same read counter (its a shared counter), and each modification causes cache invalidation because [cache coherence](https://en.wikipedia.org/wiki/Cache_coherence) dictates that any change to a cache line requires re-fetching from main memory. This also ties in with the context switching graph we saw earlier, which showed a spike in context switches during the incident.

*Note: If you're interested in understanding more about hardware caches and their implications, look at [this post]({% post_url 2025-01-27-cache-conscious-hash-maps %})*

Well, its great that we understand the root cause but why does ArcSwap fix the problem?

ArcSwap also uses the concept of readers and writes like any concurrent hash map, however it uses a [thread local variable to track "debt"](https://github.com/vorner/arc-swap/blob/master/src/debt/list.rs#L335), and this avoids cache contention like when updating a shared read counter. Each thread is expected to pay off its "debt" at some point in the future. The write operation continues to use the [standard `cmp_xchg`](https://github.com/vorner/arc-swap/blob/master/src/strategy/hybrid.rs#L207) you would find in any concurrent hash map.

