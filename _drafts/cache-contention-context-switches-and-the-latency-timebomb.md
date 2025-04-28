---
layout: post
title: "Cache Contention, Context Switches, and the Latency Timebomb"
category: concurrency
---

[Conviva](https://www.conviva.com/) provides a realtime streaming platform which makes use of *time-state analytics* to provide stateful computations over continuous events. For those curious, the company has published [a CIDR paper](https://www.conviva.com/wp-content/uploads/2023/01/Raising-the-Level-of-Abstraction-for-Time-State-Analytics.pdf) which goes into significantly more detail.

Conviva operates at a very large scale, handling around [5 trillion events per day](https://www.slideshare.net/slideshow/time-state-analytics-minneanalytics-2024-talk/270175638), and has slightly differentiated logic per customer. This requires encoding each customer's logic into a [directed acyclic graph](https://en.wikipedia.org/wiki/Directed_acyclic_graph) (DAG). Internally, we represent this DAG in YAML and it forms the basis for all customer computations. Maintaining stateful metrics across so many different versions of a compute graph is a super challenging problem and we sometimes run into issues like the one below.

## Setting The Stage

In February, we faced an interesting production issue related to the time taken by our DAG engine to process customer events.

On Feb 2nd, we noticed a recurring issue related to a specific customer where their P99 for processing time would absolutely shoot up. It was strange because we could only see it for a single customer which pointed to the issue most likely having to do with the customer's specific DAG.

![](/assets/img/conviva/rtve/traffic-from-gateway_blur.png)
<p align="center"><em>Traffic from gateway showing the P99 latency spike</em></p>

We initially tried debugging the issue by eliminating the obvious causes - watermarking, inaccurate metrics etc.

There was some spirited discussion around whether the way [the Tokio runtime](https://github.com/tokio-rs/tokio) was scheduling its tasks across physical threads was causing issues but that seemed improbable given that we use an actor system and each DAG processing task runs independently on a specific actor, and it was unlikely that multiple actors were being scheduled onto the same underlying physical thread.

There were additional lines of inquiry around whether HDFS writes were what was causing the lag to build up and eventually causing a backpressure throughout the system. More analysis of more graphs showed increased context switching during the incident but still with no clear evidence of the cause.

## Analyzing The Evidence

One of our engineers was able to reproduce the issue by saving the event data to GCS buckets and replaying this in an environment enabled with `perf`. This was a relief because at least the issue wasn't tied to the prod environment, which would have been a nightmare to debug.

We track active sessions across our system, so we have a reasonable measure of how much load our system is under. However, further analysis in the perf environment revealed that while there was a spike in the number of active sessions, those gradually dropped off while the DAG processing time continued to stay high.

![](/assets/img/conviva/rtve/blurred_usecase_active_session.png)
<p align="center"><em>Session count tracker and processing time</em></p>

While this was still puzzling, at least we had a clear indication of where to look - inside our DAG compiler/engine. All the clues pointed to this as being the source of the issue for the P99 latency spike and the backpressure we were seeing throughout the system.

While we knew where to look, this investigation had already taken weeks and things took a turn for the worse when we hit the issue again on February 23rd. However, there was more evidence coming our way about where to look. All Grafana metrics pointed to DAG processing actually being the cause of slowdown.  Another interesting graph that came up was this one displaying the jump in context switches during the incident. While it didn't lead us directly to the root cause at that point, it became important later on as we identified the issue and resolved it because it tied in neatly with our analysis.

![](/assets/img/conviva/rtve/context-switches.png)
<p align="center"><em>Context switches</em></p>

## Recreating The Crime Scene

Thanks to the earlier work in recreating the issue in a perf environment, we were able to generate these flamegraphs that highlighted hot paths in the code. The first one displays the flamegraph during normal traffic and the second one displays the flamegraph during the incident.

![](/assets/img/conviva/rtve/perf_normal_traffic.svg)
<p align="center"><em>Normal traffic flamegraph</em></p>
![](/assets/img/conviva/rtve/perf_incident_traffic.svg)
<p align="center"><em>Incident traffic flamegraph</em></p>

In the incident flamegraph, you can clearly see the dreaded wide bars which indicate longer processing time.

Looking carefully at the flamegraph generated during the incident, you can see a very high load for call paths involving `AtomicUsize::fetch_sub` which was being called from creating and dropping a `ReadGuard` in [`flashmap`](https://github.com/Cassy343/flashmap), which we were using as a concurrent hash map. This concurrent hash map was being used as a type registry which was globally shared amongst all DAG's across our system.

```rust
use flashmap::{ReadHandle, WriteHandle};

pub struct TypeRegistry<C: Clone, const N: usize = DEFAULT_N> {
    writer: Mutex<WriteHandle<ShortTypeId, TypeMetadata<C, N>, BuildNoHashHasher<ShortTypeId>>>,
    pub(crate) reader: ReadHandle<ShortTypeId, TypeMetadata<C, N>, BuildNoHashHasher<ShortTypeId>>
}
```

In the context of this, the earlier graph about the context switches spiking during the incident makes some sense. The `ReadGuard` in the hot path of the flamegraph was responsible for handling reads from various threads and each thread would increment and decrement the counter.

Now, one important thing about the hashmap in the type registry is that it is *almost* read-only. That is, it is initialized with some types on start-up and then only updated when a new type is seen but that rarely ever happened. However, on a critical path, it would keep checking to see if the type was already registered which is where the atomic increments and decrements were occurring.

Now, the question was what to do about this. In the [flashmap documentation](https://crates.io/crates/flashmap), the performance comparison shows that in the read-heavy scenario [`dashmap`](https://github.com/xacrimon/dashmap) performed better in terms of both latency & throughput. Unfortunately, replacing `flashmap` with `dashmap` did nothing to fix the performance problems. In fact, the flamegraphs turned out to be worse in the same situation with `dashmap`.

![](/assets/img/conviva/rtve/perf_incident_traffic_dashmapv2.svg)
<p align="center"><em>Dashmap flamegraph</em></p>

Finally, we implemented an [ArcSwap](https://github.com/vorner/arc-swap) based solution and the flamegraph for that was significantly better and the CPU load dropped to 40% in the perf environment.

```rust
use arc_swap::ArcSwap;

pub struct TypeRegistry<C: Clone, const N: usize = DEFAULT_N> {
    pub(crate) types:
        ArcSwap<HashMap<ShortTypeId, TypeMetadata<C, N>, BuildNoHashHasher<ShortTypeId>>>,
}
```

## Post Mortem

So, `ArcSwap` fixed the problem but let's look at why it fixed the problem.

First, let's look a little more closely at how some concurrent hash maps typically operate. Many designs involve mechanisms like counters to track readers and writers, though the specifics can vary. For example, some implementations use a single, shared counter (like a `RWLock`), while others employ sharded designs or multiple counters to reduce contention.

For instance, [Dashmap uses a sharded design](https://github.com/xacrimon/dashmap/blob/master/src/lib.rs#L85-L89) where each shard is a separate `HashMap` guarded by a `RWLock`

```rust
pub struct DashMap<K, V, S = RandomState> {
    shift: usize,
    shards: Box<[CachePadded<RwLock<HashMap<K, V>>>]>,
    hasher: S,
}
```

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

In cases where the data is guarded by a single, shared counter or resides on the same shard, contention can arise under high loads. This is because every CPU core attempting to increment or decrement the counter causes cache invalidation due to [cache coherence](https://en.wikipedia.org/wiki/Cache_coherence). Each modification forces the cache line containing the counter to "ping-pong" between cores, leading to degraded performance. To understand this better, look at this section below from a great PDF titled [What every systems programmer should know about concurrency](https://assets.bitbashing.io/papers/concurrency-primer.pdf) by [Matt Kline](https://github.com/mrkline).

![](/assets/img/conviva/rtve/cache_line_ping_pong.png)

This also ties in with the context switching graph we saw earlier, which showed a spike in context switches during the incident.

*Note: If you're interested in understanding more about hardware caches and their implications, look at [this post](https://redixhumayun.github.io/performance/2025/01/27/cache-conscious-hash-maps.html)*

Now, let's contrast this with the approach that `ArcSwap` uses. `ArcSwap` follows the [read-copy-update (RCU)](https://docs.kernel.org/RCU/whatisRCU.html) methodology where:
* readers access the data without locking
* writers create a new copy of the data
* writers atomically swap in the new data
* old data is reclaimed later during a reclamation phase

The `ArcSwap` repo even has a [method called `rcu`](https://github.com/vorner/arc-swap/blob/b12da9d783d27111d31afc77e70b07ce6acdf9f6/src/lib.rs#L603).

<div class="aside">This is analogous to how <a href="https://jepsen.io/consistency/models/snapshot-isolation">snapshot isolation</a> works in databases with multi-version concurrency control. The purpose is, of course, different but there are overlaps in the mechanism.<br/></div>

`ArcSwap` avoids cache contention issues for readers that typically crop up when updating a shared read counter with a [thread-local epoch counter to track "debt"](https://github.com/vorner/arc-swap/blob/master/src/debt/list.rs#L335).

A new version of the data is swapped in using the [standard `cmp_xchg`](https://github.com/vorner/arc-swap/blob/master/src/strategy/hybrid.rs#L207) operation. This marks the beginning of a new epoch, but the data associated with the old epoch isn't cleaned up until all "debt" is paid off, that is until all readers of the previous epoch have finished.

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

Hash maps on the other hand allow updating invidual portions of data in the hash map but this is where it becomes important that we have an *almost* read-only scenario with a small dataset because the additional overhead of writes with `ArcSwap` is worth paying here since reads are faster.


## Conclusion
Given that we had a situation which was almost read-only with a small dataset, the overhead of a concurrent hash map was not suitable since we had no use case for frequent, granular updates. Trading that for `ArcSwap`, which is a specialized `AtomicRef`, something that is designed for occasional swaps where the entire ref is updated, turned out to be a much better fit.