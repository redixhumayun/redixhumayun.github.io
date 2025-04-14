---
layout: post
title: "The Problem With Concurrency"
category: concurrency
---

[Conviva](https://www.conviva.com/) provides a realtime streaming platform which makes use of *time-state analytics* to provide stateful computations over continuous events. For those curious, the company has published [a CIDR paper](https://www.conviva.com/wp-content/uploads/2023/01/Raising-the-Level-of-Abstraction-for-Time-State-Analytics.pdf) which goes into significantly more detail.

Conviva operates at a very large scale, handling [insert number of events / sec handled] and slightly differentiated logic per customer. This requires encoding each customer's logic into a [directed acyclic graph](https://en.wikipedia.org/wiki/Directed_acyclic_graph) (DAG). Internally, we represent this DAG in YAML and it forms the basis for all customer computations. Maintaining stateful metrics across so many different versions of a compute graph is a super challenging problem which sometimes causes issues like this one.

## Setting The Stage

We recently faced an interesting production issue related to the time taken by our DAG engine to process customer events.

On Feb 2nd, we noticed a recurring issue related to a specific customer where their P99 for processing time would absolutely shoot up. It was strange because we could only see it for a single customer which pointed to the issue most likely having to do with the customer's specific DAG.

![](/assets/img/conviva/rtve/traffic-from-gateway_blur.png)

We initially tried debugging the issue by eliminating the obvious causes - watermarking, inaccurate metrics etc.

There was some spirited discussion around whether the way [the Tokio runtime](https://github.com/tokio-rs/tokio) was scheduling its tasks across physical threads was causing issues but that seemed improbable given that we use an actor system and each DAG processing task runs independently on a specific actor, and it was unlikely that multiple actors were being scheduled onto the same underlying physical thread.

There were additional lines of inquiry around whether HDFS writes were what was causing the lag to build up and eventually causing a backpressure throughout the system. More analysis of more graphs showed increased context switching during the incident but with still no clear evidence of the cause.

## Analyzing The Evidence

One of our engineers was able to reproduce the issue by saving the event data to GCS buckets and replaying this in an environment enabled with `perf`. This was a relief because at least the issue wasn't tied to the prod environment, which would have been a nightmare to debug.

We track active sessions across our state actors, so we have a reasonable measure of how much load our system is under. However, further analysis in the perf environment revealed that while there was a spike in the number of active sessions, those gradually dropped off while the DAG processing time continued to stay high.

![](/assets/img/conviva/rtve/blurred_usecase_active_session.png)

While this was still puzzling, at least we had a clear indication of where to look - inside our DAG compiler/engine. All the clues pointed to this as being the source of the issue for the P99 latency spike and the backpressure we were seeing throughout the system.

While we knew where to look, this investigation had already taken weeks and things took a turn for the worse when we hit the issue again on February 23rd. However, there was more evidence coming our way about where to look. All Grafana metrics pointed to DAG processing actually being the cause of slowdown.  Another interesting graph that came up was this one displaying the jump in context switches during the incident. While it didn't lead us directly to the root cause at that point, it became important later on as we identified the issue and resolved it because it tied in neatly with our analysis.

![](/assets/img/conviva/rtve/context-switches.png)

## Recreating The Crime Scene

Thanks to the earlier work in recreating the issue in a perf environment, we were able to generate these flamegraphs that highlighted hot paths in the code. The first one displays the flamegraph during normal traffic and the second one displays the flamegraph during the incident.

![](/assets/img/conviva/rtve/perf_normal_traffic.svg)
![](/assets/img/conviva/rtve/perf_incident_traffic.svg)

In the incident flamegraph, you can clearly see the dreaded wide bars which indicate longer processing time.

Looking carefully at the flamegraph generated during the incident, you can see a very high load for call paths involving `AtomicUsize::fetch_sub` which was being called from creating and dropping a `ReadGuard` in [`flashmap`](https://github.com/Cassy343/flashmap) which we were using as a concurrent hash map. This concurrent hash map was being used as a type registry which was globally shared amongst all DAG's on all state actors.

In the context of this, the earlier graph about the context switches spiking during the incident makes some sense. The `ReadGuard` in the hot path of the flamegraph was responsible for handling reads from various threads and each thread would increment and decrement the counter.

Now, one important thing about the hashmap in the type registry is that it is *almost* read-only. That is, it is initialized with some types on start-up and then only updated when a new type is seen but that rarely ever happened. However, on a critical path, it would keep checking to see if the type was already registered which is where the atomic increments and decrements were occurring.

Now, the question was what to do about this. In the [flashmap documentation](https://crates.io/crates/flashmap), the performance comparison shows that in the read-heavy scenario [`dashmap`](https://github.com/xacrimon/dashmap) performed better in terms of both latency & throughput. Unfortunately, replacing `flashmap` with `dashmap` did nothing to fix the performance problems. In fact, the flamegraphs turned out to be worse in the same situation with `dashmap`.

![](/assets/img/conviva/rtve/perf_incident_traffic_dashmapv2.svg)

Finally, we implemented an [ArcSwap](https://github.com/vorner/arc-swap) based solution and the flamegraph for that was significantly better and the CPU load dropped to 40% in the perf environment.

## Post Mortem

So, ArcSwap finally fixed the problem but it is worthwhile to understand why exactly that worked where concurrent hash maps had failed. It's worth repeating here again that our type registry, which is where the hash map was being used was an *almost* read-only scenario.

First, let's look a little more closely at how concurrent hash maps typically operate (with a little hand-waving for simplicity's sake) - they use a *single, shared* counter which tracks how many readers are currently operating and allow a single writer to operate, not unlike a typical `RWLock`. 

```text
  [Core 1]             [Core 2]             [Core 3]
     |                   |                   |
     | read()            | read()            | read()
     |                   |                   |
     v                   v                   v
|-------------------Shared Read Counter-------------------|
                    (on one cache line)

                           CPU Caches
   ┌────────────┐     ┌────────────┐     ┌────────────┐
   │  Core 1    │     │  Core 2    │     │  Core 3    │
   │  Cache     │<==> │  Cache     │<==> │  Cache     │
   └────────────┘     └────────────┘     └────────────┘

       ↑ Cache line invalidated each time counter is written
       ↑ "Ping-pong" as cache line bounces across cores

⚠️ Every reader updates the same atomic/shared counter
⚠️ Constant inter-core cache line transfers = degraded perf
```

The fact that this is a single, shared counter causes significant grief under contention because every CPU has a cache, and every cache requires loading data in from RAM. Each core is going to attempt to increment/decrement the same counter, and each modification causes cache invalidation because [cache coherence](https://en.wikipedia.org/wiki/Cache_coherence) dictates that any change to a cache line requires re-fetching from main memory. To understand this better, look at this section below from a great PDF titled [What every systems programmer should know about concurrency](https://assets.bitbashing.io/papers/concurrency-primer.pdf) by [Matt Kline](https://github.com/mrkline).

![](/assets/img/conviva/rtve/cache_line_ping_pong.png)

This also ties in with the context switching graph we saw earlier, which showed a spike in context switches during the incident.

*Note: If you're interested in understanding more about hardware caches and their implications, look at [this post](https://redixhumayun.github.io/performance/2025/01/27/cache-conscious-hash-maps.html)*

Now, let's contrast this with the approach that `ArcSwap` uses. `ArcSwap` follows the [read-copy-update (RCU)](https://docs.kernel.org/RCU/whatisRCU.html) methodology where:
* readers access the data without locking
* writers create a new copy of the data
* writers atomically swap in the new data
* old data is reclaimed later during a reclamation phase

<div class="aside">This is not unlike how [snapshot isolation](https://jepsen.io/consistency/models/snapshot-isolation) works in databases with multi-version concurrency control. The purpose is, of course, different but there are overlaps in the mechanism<br/><br/></div>

`ArcSwap` accomplishes this with a [thread-local epoch counter to track "debt"](https://github.com/vorner/arc-swap/blob/master/src/debt/list.rs#L335) which avoids cache contention issues that crop up when updating a shared read counter.

A new version of the data is swapped in using the [standard `cmp_xchg`](https://github.com/vorner/arc-swap/blob/master/src/strategy/hybrid.rs#L207) operation. This marks the beginning of a new epoch, but the data associated with the old epoch isn't cleaned up until all "debt" is paid off, that is until all readers of the previous epoch have finished. Once the readers from the previous epoch have finished, the previous epoch is "reclaimed".

```text
  [Core 1]             [Core 2]             [Core 3]
     |                   |                   |
     | load()            | load()            | load()
     |                   |                   |
     v                   v                   v

[Thread-Local Epoch 1] [Thread-Local Epoch 2] [Thread-Local Epoch 3]
      (read guard)           (read guard)         (read guard)

      ┌─────────────────────────────┐
      │        ArcSwap<T>          │
      │ ┌────────────────────────┐ │
      │ │ Arc<T>: Current value  │ │ <── atomic ptr (no cache bouncing)
      │ └────────────────────────┘ │
      └─────────────────────────────┘

     Writer swaps in new Arc<T> using atomic store()
     └── Old Arc<T> placed into deferred queue
         └── Only dropped when all read guards released

✅ No shared counters for read
✅ No cache line bouncing
✅ Readers are wait-free and isolated
```

The big difference between a concurrent hash map and `ArcSwap` is that `ArcSwap` requires swapping out the entirety of the underlying data with every write but trades this off with very cheap reads. Writes don't even have to wait for all readers to finish since a new epoch is created with the new version of data.

Hash maps on the other hand allow updating invidual portions of data in the hash map but this is where it becomes important that we have an *almost* read-only scenario because the additional overhead of writes with `ArcSwap` is worth paying here since reads are faster.


## Conclusion
Concurrent hash maps aren't a blanket solution when dealing with high concurrency scenarios. `ArcSwap` is a specialized `AtomicRef` that is designed for occasional swaps where the entire ref is updated. However, if you have an almost read-only scenario this is a great fit.