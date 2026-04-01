---
layout: post
title: "Zero-Copy Pages in Rust: Or How I Learned To Stop Worrying And Love Lifetimes"
category: databases
---

Zero-copy is a way to elide CPU copies between the kernel and user space buffers and in high throughput applications like database engines. It makes a huge difference in performance under high load, especially when your working set is no longer cache resident.

## What Is Zero-Copy

Here is what a typical database engine looks like. For the purpose of this article, assume that every layer has copies between them.

```
  ┌─────────────────────────────────────────────────────────┐
  │                      Query Layer                        │
  └────────────────────────┬────────────────────────────────┘
                           │
  ┌────────────────────────▼────────────────────────────────┐
  │                    Execution Engine                     │
  └────────────────────────┬────────────────────────────────┘
                           │
  ┌────────────────────────▼────────────────────────────────┐
  │                    Transaction Manager                  │
  └──────────┬─────────────┴─────────────────┬─────────────┘
             │                               │
  ┌──────────▼──────────┐       ┌────────────▼────────────┐
  │    Lock Manager     │       │      Log Manager        │
  └─────────────────────┘       └─────────────────────────┘
                           │
  ┌────────────────────────▼────────────────────────────────┐
  │                    Buffer Pool                          │
  └────────────────────────┬────────────────────────────────┘
                           │
  ┌────────────────────────▼────────────────────────────────┐
  │                    Disk                                 │
  └─────────────────────────────────────────────────────────┘
```

Trying to build a high performance engine requires eliding any non-useful work as far as possible and copying data falls squarely in this category.

Think of each copy operation as an equivalent of `memcpy()` which requires the CPU to copy data from a source and put it into a destination. You're spending cycles on non-essential work and this can cause cache eviction of hot data from CPU caches.

[Here's](https://www.linuxjournal.com/article/6345) a great example of the lifecycle that a typical read or write operation goes through. All those CPU copies are useless work that are burning cycles.

![](/assets/img/zero-copy/read_write_lifecycle.png)

Now, let's focus on eliminating copies at the layer between the buffer pool and disk first.

## The Buffer Pool And Direct IO

The buffer pool opens and stores file descriptors with the `open()` syscall. When we call `read()` and `write()` on those file descriptors it goes through the whole cycle you saw earlier with copies between userspace, kernel and DMA.

{% include marginnote.html id="mn-1" text="[Here's](https://lkml.org/lkml/2002/5/11/58) a famous tirade from Linus Torvalds on the direct IO interface. He doesn't like database developers." %}

An easy win here is to use direct IO with the [O_DIRECT](https://man7.org/linux/man-pages/man2/open.2.html) flag. This will force the application to bypass the OS page cache, however this means we lost readahead and write coalescing.

<div class="aside">
A large number of modern databases use this approach, although there are hold outs like Postgres.
</div>

Since we're bypassing the kernel page cache we don't get useful boosts like [readahead](https://lwn.net/Articles/888715/) or [write coalescing](https://www.thomas-krenn.com/en/wiki/Linux_Page_Cache_Basics) but this is exactly why a buffer pool is so important in a database.

The buffer pool is a replacement for the OS page cache designed with specific workloads in mind. It's always helpful to think of this in terms of mechanism + policy. 

Mechanism: A fixed size page table which serves page requests for the layers above and evicts some pages to make room for others.
Policy: A way to decide which page to evict (eviction policy)

```
  ┌─────────────────────────────────────────────────────────┐
  │                      Query Layer                        │
  │                                                         │
  │   TableScan / IndexScan / BTreeScan                     │
  │   (iterates rows, calls next(), get_value())            │
  └────────────────────────┬────────────────────────────────┘
                           │ uses
  ┌────────────────────────▼────────────────────────────────┐
  │                    Transaction                          │
  │                                                         │
  │   tx_id | ConcurrencyManager | RecoveryManager          │
  │   BufferList (tracks pinned frames for this txn)        │
  └────────────────────────┬────────────────────────────────┘
                           │ pin() / unpin()
  ┌────────────────────────▼────────────────────────────────┐
  │                    Buffer Pool                          │
  │                                                         │
  │  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
  │  │ Frame 0  │  │ Frame 1  │  │ Frame 2  │  ...          │
  │  │          │  │          │  │          │               │
  │  │ file:3   │  │ file:7   │  │  empty   │               │
  │  │ pins: 1  │  │ pins: 0  │  │  pins: 0 │               │
  │  │          │  │          │  │          │               │
  │  │ 4KB data │  │ 4KB data │  │          │               │
  │  └──────────┘  └──────────┘  └──────────┘               │
  │                                                         │
  │  resident_shards: { file:3 → Frame 0, file:7 → Frame 1} │
  │  policy: LRU | CLOCK | SIEVE                            │
  └────────────────────────┬────────────────────────────────┘
                           │ 
                           │ 
  ┌────────────────────────▼────────────────────────────────┐
  │                       Disk                              │
  │                                                         │
  │    [ file:1 ]  [ file:3 ]  [ file:7 ]  [ file:9 ]       │
  └─────────────────────────────────────────────────────────┘
```

Making a performant buffer pool is a significant challenge.

Choosing the right policy for your system depends on the characteristics of your workload but most systems typically go with [CLOCK](https://www.geeksforgeeks.org/operating-systems/second-chance-or-clock-page-replacement-policy/) which is an LRU approximation. [Here's](https://en.wikipedia.org/wiki/Cache_replacement_policies) a non-exhaustive list of replacement policies used in buffer pools.

## Removing Copies From Above The Buffer Pool

Rust has a great and terrible way to avoid dealing with copies of data - references. It's great because it's a single character (&), it's terrible because now we have to learn to deal with [lifetimes](https://doc.rust-lang.org/rust-by-example/scope/lifetime.html).

Let's start with defining the raw bytes for a single page like below

```rust
pub struct PageBytes {
    bytes: [u8; PAGE_SIZE_BYTES as usize],
}
```

Now, we'll define the data that is held within a single buffer pool frame

```rust
#[derive(Debug)]
pub struct BufferFrame {
    page: RwLock<PageBytes>,
}
```

Now, we're going to store this frame inside a `PageWriteGuard`

```rust
/// Read guard providing shared access to a pinned page.
pub struct PageReadGuard<'a> {
    page: RwLockReadGuard<'a, PageBytes>,
}
```

A problem here is that we're going to keep copying PageBytes anytime we construct a `PageReadGuard` which happens anytime a transaction wants to read a page during its operations. We want to avoid these copies, so let's introduce a lifetime.

```rust
pub struct PageReadGuard<'a> {
    page: Option<RwLockReadGuard<'a, PageBytes>>,
}
```

With this lifetime annotation, we are proving to the compiler that `PageReadGuard` will not outlive `PageBytes` which allows us to guarantee that we won't be left with a dangling pointer.

Typical database engines have two core page types - heap and btree pages. So let's introduce the former with two data structures in our engine - `HeapPage` and `HeapPageView` and the structure of the page is going to be a standard [slotted page](https://siemens.blog/posts/database-page-layout/) layout.

```rust
struct HeapPage<'a> {
    header: HeapHeaderRef<'a>,
    line_pointers: LinePtrArray<'a>,
    record_space: HeapRecordSpace<'a>,
}

pub struct HeapPageView<'a> {
    guard: PageReadGuard<'a>,
    layout: &'a Layout,
}
```

I want to talk a little bit about the design here because I think it really helps to build a mental model of Rust lifetimes.

The structure here is odd because naturally you'd imagine that `HeapPage` would store the guard to keep the page pinned and `HeapPageView` would store the pointers into the bytes themselves. Or, even better, get rid of `HeapPageView` and store the guard and the pointers within `HeapPage`.

This leads us into the classic [self-referential struct](https://quinedot.github.io/rust-learning/pf-meta.html) in Rust, which is a terrible thing because it makes pointer invalidation very hard. Imagine for a moment you have a struct and it has two fields - A and B, with B pointing to A. Now, your struct is moved 

## 3. Zero-copy from disk: O_DIRECT + io_uring

## 4. Zero-copy from buffer pool to caller: the guard and view types

## 5. How Rust makes this structurally correct

## 6. What's not zero-copy (honest caveats)
