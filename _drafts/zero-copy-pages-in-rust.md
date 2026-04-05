---
layout: post
title: "Zero-Copy Pages in Rust: Or How I Learned To Stop Worrying And Love Lifetimes"
category: databases
---

Zero-copy is a way to elide CPU copies between the kernel and user space buffers that is particularly useful in high throughput applications like database engines. It makes a huge difference in performance under high load, particularly when your working set is no longer cache resident.

## What Is Zero-Copy

Here is what a typical database engine looks like. For the purpose of this article, assume that every layer creates copies between them.

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
  └──────────┬─────────────┴─────────────────┬──────────────┘
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
{: .ascii-art}

Trying to build a high performance engine requires eliding any non-useful work as far as possible and copying data falls squarely in this category.

Think of each copy operation as an equivalent of `memcpy()`{% include sidenote.html id="sn-memcpy" text="memcpy can actually cause <a href='https://www.intel.com/content/www/us/en/developer/articles/technical/performance-optimization-of-memcpy-in-dpdk.html'>pipeline stalls</a> which is something you want to avoid in high perf applications." %} which requires the CPU to copy data from a source and put it into a destination. You're spending cycles on non-essential work and this can cause eviction of hot data from CPU caches.

[Here's](https://www.linuxjournal.com/article/6345) a great example of the lifecycle that a typical read or write operation goes through. All those CPU copies are useless work that are burning cycles.

| ![](/assets/img/zero-copy/read_write_lifecycle.png) |
|:--:|
| *Image taken from https://www.linuxjournal.com/article/6345* |

Now, let's focus on eliminating copies at the layer between the buffer pool and disk first.

## The Buffer Pool And Direct IO

{% include marginnote.html id="mn-1" text="[Here's](https://lkml.org/lkml/2002/5/11/58) a famous tirade from Linus Torvalds on the direct IO interface. He doesn't like database developers." %}

The buffer pool opens and stores file descriptors with the `open()` syscall. When we call `read()` and `write()` on those file descriptors it goes through the whole cycle you saw earlier with copies between userspace, kernel and DMA.

An easy win here is to use direct IO with the [O_DIRECT](https://man7.org/linux/man-pages/man2/open.2.html) flag{% include sidenote.html id="sn-1" text="A large number of modern databases use this approach, although there are holdouts like Postgres." %}. This will force the application to bypass the OS page cache{% include footnote.html id="1" %}.

`O_DIRECT` requires that the buffers submitted are pointer aligned, along with I/O length and file offset. In Rust, we guarantee the former with `#[repr(align(4096))]` on the buffer holding our page, and 4 KiB page-sized reads and writes at page-aligned offsets satisfy the rest. Without this, `O_DIRECT` reads or writes would often fail with `EINVAL`{% include sidenote.html id="sn-einval" text="Here's a <a href='https://gist.github.com/redixhumayun/8f402d30ffc8437e043394b9c003698b'>gist</a> showing this in C — the first program uses malloc (not 4096-aligned) and the write fails, the second uses posix_memalign and succeeds." %}.

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
{: .ascii-art}

Choosing the right policy for your system depends on the characteristics of your workload, but CLOCK is a common choice because it approximates LRU at lower cost.

Choosing the right policy for your system depends on the characteristics of your workload but most systems typically go with [CLOCK](https://www.cs.cornell.edu/courses/cs4410/2018su/lectures/lec15-thrashing.html) which is an LRU approximation. [Here's](https://en.wikipedia.org/wiki/Cache_replacement_policies) a non-exhaustive list of replacement policies used in buffer pools.

## Removing Copies From Above The Buffer Pool

So far, zero-copy has meant removing copies between the kernel and the buffer pool. From here on, I'm going to broaden it slightly to mean removing redundant copies inside the engine too.

Rust has a great and terrible way to avoid dealing with copies of data - references. It's great because it's a single character(&), it's terrible because now we have to learn to deal with [lifetimes](https://doc.rust-lang.org/rust-by-example/scope/lifetime.html).

The simplest way to think about lifetimes is that you are proving to the compiler that any reference held by type A will not outlive the data it points to.

Let's start with defining the raw bytes for a single page like below

```rust
pub struct PageBytes {
    bytes: [u8; PAGE_SIZE_BYTES as usize],
}
```

Now, we'll define the data that is held within a single buffer pool frame. The `RwLock<T>` type here is our page latch.

```rust
#[derive(Debug)]
pub struct BufferFrame {
    page: RwLock<PageBytes>,
}
```

Now, we're going to store this frame inside a `PageReadGuard`.

```rust
// To keep the example small, the next type is schematic rather than literal.
// I'm using it to show the ownership tradeoff, not the exact implementation
// details of `RwLockReadGuard`.
/// Read guard providing shared access to a pinned page.
pub struct PageReadGuard {
    page: PageBytes,
}
```

This version is simple to model, but it bakes copying into the design. If every higher-level page object owns its own `PageBytes`, then constructing those objects from buffer-pool storage means materializing fresh owned values.

What we actually want is not ownership, but a borrowed view into bytes that already live somewhere else. We can model that by introducing a lifetime.

```rust
pub struct PageReadGuard<'a> {
    page: &'a PageBytes,
}
```

With this lifetime annotation, we are proving to the compiler that `PageReadGuard` will not outlive `PageBytes`, which means higher-level page objects can become views into existing bytes rather than owned copies.

In the real implementation, the field is `RwLockReadGuard<'a, PageBytes>` rather than `&'a PageBytes`, but the ownership story is the same: the guard borrows the page bytes instead of owning them, and our wrapper carries that borrow forward.

Typical database engines have two core page types - heap and btree pages. So let's introduce the former with two data structures in our engine - `HeapPage` and `HeapPageView` . The structure of the page is going to be a standard [slotted page](https://siemens.blog/posts/database-page-layout/) layout.

A slotted page is divided into the header, the line pointers and the record space, so we'll create a struct for each and store all these references in our `HeapPage`.

```rust
pub struct HeapHeaderRef<'a> {
    bytes: &'a [u8],
}

struct LinePtrBytes<'a> {
    bytes: &'a [u8],
}

struct LinePtrArray<'a> {
    bytes: LinePtrBytes<'a>,
    len: usize,
    capacity: usize,
}

struct HeapRecordSpace<'a> {
    bytes: &'a [u8],
    base_offset: usize,
}

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

All of them share the exact same lifetime of `'a`, which means that any of these references held by another type will not outlive the type.

And all of these types are references into the exact same set of bytes held by `PageBytes` in the `BufferFrame`.

```
PageBytes (owned by BufferFrame)
┌─────────────────────────────────────────────────────┐
│ Header (34 bytes)                                   │
│ page_type | slot_count | free_lower | free_upper .. │
├─────────────────────────────────────────────────────┤
│ Line Pointers (grows →)                             │
│ [ slot 0 ] [ slot 1 ] [ slot 2 ] ...                │
├─────────────────────────────────────────────────────┤
│ Free Space                                          │
├─────────────────────────────────────────────────────┤
│ Record Space (grows ←)                              │
│ ... [ tuple 2 ] [ tuple 1 ] [ tuple 0 ]             │
└─────────────────────────────────────────────────────┘
      │               │                    │
HeapHeaderRef<'a>  LinePtrArray<'a>  HeapRecordSpace<'a>
      │               │                    │
      └───────────────┴────────────────────┘
                      │
                 HeapPage<'a>  ←─────────────────────────┐
                                                         │
                                                  built from
                                                         │
                                            HeapPageView<'a>
                                          ┌──────────────────────────┐
                                          │ guard: PageReadGuard<'a> │
                                          │ layout: &'a Layout       │
                                          └──────────────────────────┘
                                                   │
                                            owns the lock on
                                                   │
                                            PageBytes in BufferFrame
```
{: .ascii-art}

I want to talk a little bit about the design here because I think it really helps to build a mental model of Rust references and lifetimes.

The structure here is odd because naturally you'd imagine that `HeapPage` would store the guard to keep the page pinned and `HeapPageView` would store the pointers into the bytes themselves since this gives you a natural stacking of abstractions. Or, even better, get rid of `HeapPageView` and store the guard and the pointers within `HeapPage`.

```rust
struct HeapPage<'a> {
    guard: PageReadGuard <'a>,
    header: HeapHeaderRef<'a>, // borrows from guard
    line_pointers: LinePtrArray<'a>, // borrows from guard
    record_space: HeapRecordSpace<'a>, // borrows from guard
}
```

This leads us to the classic [self-referential struct](https://quinedot.github.io/rust-learning/pf-meta.html) issue in Rust, which makes pointer invalidation very hard. Imagine for a moment, you have a struct and it has two fields - A and B, with B pointing to A. Now, your struct A moves. What does B point to? It's going to continue pointing to where A was but that's invalid and would lead to UB. There are ways around this in Rust with [`Pin`](https://without.boats/blog/pin/), unsafe raw pointers, `Arc` pointers and external crates like `ouroboros`. But, all of these have overhead associated with them.

A simpler resolution is to restructure the code to avoid self-references entirely. We have `HeapPage` which has pointers into `PageBytes` and we have `HeapPageView` which stores the actual bytes.

 But, where's the link between them?

```rust
impl<'a> HeapPageView<'a> {
    fn build_page(&'a self) -> HeapPage<'a> {
        HeapPage::new(self.guard.bytes()).unwrap()
    }

    pub fn row(&self, slot: SlotId) -> Option<LogicalRow<'_>> {
        let view = self.build_page();
        let mut current = slot;
        loop {
            match view.tuple_ref(current)? {
                //  code elided for simplicity
            }
        }
    }
}

impl<'a> HeapPage<'a> {
    fn new(bytes: &'a [u8]) -> SimpleDBResult<Self> {
        // Use shared parsing logic from PageKind trait
        let layout = Self::parse_layout(bytes)?;

        let header = HeapHeaderRef::new(layout.header);

        // Additional heap-specific validation
        let free_upper = header.free_upper() as usize;
        let page_size = PAGE_SIZE_BYTES as usize;
        if free_upper < header.free_lower() as usize || free_upper > page_size {
            return Err("heap page free_upper out of bounds".into());
        }

        let page = Self::from_parts(header, layout.line_ptrs, layout.records, layout.base_offset);
        assert_eq!(
            page.slot_count(),
            header.slot_count() as usize,
            "slot directory length must match header slot_count"
        );
        Ok(page)
    }
}
```

When the query layer wants to read something from the data pages, it will get a `HeapPageView` and any operation on the `HeapPageView` that requires access to some logical segment of data will construct a `HeapPage` which understands how the bytes on the page are laid out.

Now, you're probably wondering about the cost of reconstructing the `HeapPage` each time. It's actually really cheap because it's composed entirely of arithmetic operations sprinkled with a few panics in case some invariants aren't met. And arithmetic operations are *extremely* cheap for the CPU to perform, especially when compared to `memcpy()` operations.

| ![](/assets/img/zero-copy/cpu_ops_cost.png) |
|:--:|
| *Not all CPU operations are created equal. Source: [ithare.com](https://ithare.com/infographics-operation-costs-in-cpu-clock-cycles/), via Andrew Kelley's [talk on Data Oriented Design](https://youtu.be/IroPQ150F6c?t=409)* |

Another way to structure the above references would have been to store the guard on the `HeapPage` and have the `HeapPageView` construct the slices into the page bytes.

```rust
pub struct HeapPage<'a> {
    guard: PageReadGuard<'a>,
}

pub struct HeapPageView<'a> {
    header: HeapHeaderRef<'a>,
    line_pointers: LinePtrArray<'a>,
    record_space: HeapRecordSpace<'a>,
    layout: &'a Layout,
}

let page = HeapPage::new(guard);
let view = HeapPageView::new(&'a page, layout); // borrows from page and page stays alive on stack
```

This works but runs into an issue when we want to mutate the bytes. Imagine that we want to insert a record into the heap page. This requires mutating `record_space` and also mutating `line_pointers`. Now, the bounds of both might have changed which means we have stale references in our struct. We need to drop the struct and re-create it again. While it is cheap, this still leaks abstractions into the upper query layers.

A better form would be to do the following

```rust
pub struct HeapPage<'a> {
    guard: PageReadGuard<'a>,
}

pub struct HeapPageView<'a> {
    header: HeapHeaderRef<'a>,
    body_bytes: &'a [u8],
    layout: &'a Layout,
}

let page = HeapPage::new(guard);
let view = HeapPageView::new(&'a page, layout); // borrows from page and page stays alive on stack
```

In slotted pages, the header size is fixed and anytime we want to perform some operation we re-parse the body bytes using information from the header and get an accurate view into the bytes.

But, the above requires keeping the page and view alive on the stack and leaks implementation details up to the query layer. The version I went with makes those details opaque to the query layer.

## Structuring Types In Rust

In the previous section we saw `PageReadGuard`, `HeapPage` and `HeapPageView` which collectively constitute the read side path of the page. However, Rust has the principle of [aliasing XOR mutability](https://cmpt-479-982.github.io/week1/safety_features_of_rust.html#the-borrow-checker-and-the-aliasing-xor-mutability-principle) and this means that we either get multiple `&T` or a single `&mut T`. Everything we saw above is on the `&T` path and we need a `&mut T` path.

```rust
/// Write guard providing exclusive access to a pinned page.
pub struct PageWriteGuard<'a> {
    page: RwLockWriteGuard<'a, PageBytes>,
}

pub struct HeapPageMut<'a> {
    header: HeapHeaderMut<'a>,
    body_bytes: &'a mut [u8],
}

pub struct HeapPageViewMut<'a> {
    guard: PageWriteGuard<'a>,
    layout: &'a Layout,
}

impl<'a> HeapPageViewMut<'a> {
    fn build_mut_page(&mut self) -> SimpleDBResult<HeapPageMut<'_>> {
        HeapPageMut::new(self.guard.bytes_mut())
    }

    pub fn insert_tuple(&mut self, tuple: &[u8]) -> SimpleDBResult<SlotId> {
        let mut page = self.build_mut_page()?;
        page.insert(tuple)
    }
}
```

Now, we abide by Rust's aliasing rules and if we have a `BufferFrame`, we can either acquire the `read` latch multiple times and build the read path or acquire the `write` latch and build the write path.

```
                    BufferFrame
                    RwLock<PageBytes>
                         │
              ┌──────────┴──────────┐
              │                     │
         read_page()           write_page()
              │                     │
    RwLockReadGuard          RwLockWriteGuard
    (shared, N readers)      (exclusive, 1 writer)
              │                     │
       PageReadGuard           PageWriteGuard
           &'a [u8]               &'a mut [u8]
              │                     │
         HeapPage              HeapPageMut
       (borrows &'a [u8])        (borrows &'a mut [u8])
              │                     │
       HeapPageView<'a>         HeapPageViewMut<'a>
```
{: .ascii-art}

And, of course, Rust's borrow checker makes use-after-unpin a compile error, not a runtime hazard.

There's one more asymmetry worth noting. `HeapPage` splits the bytes into three fields (header, line pointers, record space) because reads are idempotent and those boundaries never shift. 

`HeapPageMut` can't do the same: a single insert moves both `free_lower` and `free_upper`, making any pre-split reference immediately stale. So `HeapPageMut` keeps a single `body_bytes: &mut [u8]` and re-derives sub-regions from the header on each operation. Rust prevents aliased mutable access, but the deeper invariant (that split points must always match the header) has to be enforced through design.

### Nested Borrows

If you've noticed, so far we've been using only a single lifetime of `'a`, which makes sense because we've been borrowing everything from the same set of underlying bytes.

But, we've actually been imprecise and let the compiler handle some of the drudgery for us. The chain of borrows so far has been `PageBytes` => `RwLock*Guard<'a, T>` => `Page*Guard<'a, T>` => `HeapPage[Mut]<'a, T>` => `HeapPageView[Mut]<'a, T>`

Each successive borrow nests wtihin the previous one but the compiler allows us to do all of this with a single lifetime because of [lifetime variance](https://doc.rust-lang.org/nomicon/subtyping.html).

The crux of lifetime variance is that shared references are covariant and exclusive references are invariant. Another way this is frequently expressed is that `&T` is covariant over `'a` and `&mut T` is invariant over `'a`.

For covariant lifetimes, Rust can shorten a longer-lived `&T` into a shorter-lived `&T` when needed, which allows us to elide the nested lifetimes and let the compiler infer the intermediate lifetimes for us.

Mutable borrows are less forgiving because mutation makes those coercions much stricter. With `&mut T`, Rust can't be as flexible about the inner lifetime without risking that a shorter-lived reference gets written into a place that promised to hold a longer-lived one.

The place where this finally becomes visible in the code is `HeapPageViewMut::row_mut()` and its construction:

```rust
pub struct LogicalRowMut<'row, 'page: 'row> {
    view: &'row mut HeapPageViewMut<'page>,
}

impl<'a> HeapPageViewMut<'a> {
    /// Decodes the live tuple at `slot` into a `LogicalRowMut` for editing.
    /// Changes are written back to the page automatically when the returned value is dropped.
    pub fn row_mut<'row>(
        &'row mut self,
        slot: SlotId,
    ) -> SimpleDBResult<Option<LogicalRowMut<'row, 'a>>> {
        //  code elided for simplicity
        Ok(Some(LogicalRowMut {
            view: self,
            slot,
            values,
            layout,
            dirty: false,
        }))
    }
}
```

`'page` is the lifetime of the underlying page view, which already borrows the pinned page bytes. `'row` is the shorter lifetime of one exclusive edit session on top of that view. The relation `'page: 'row` says exactly what we need - the page view has to stay valid for at least as long as the mutable row editor borrowing it.

```
Page bytes in BufferFrame
┌─────────────────────────────────────────────────────────────┐
│ header │ line pointers │ free space │ tuple 2 │ tuple 1 │… │
└─────────────────────────────────────────────────────────────┘
<---------------------- borrowed for 'page ---------------------->

                                 one call to row_mut()
                                            │
                                            ▼

                       LogicalRowMut<'row, 'page>
                       ┌─────────────────────────┐
                       │ edits one logical row   │
                       └─────────────────────────┘
                       <---- borrowed for 'row --->

Constraint: 'page : 'row
```
{: .ascii-art}

### The Cost Of Safe Abstractions

The split into separate read and write types has a real ergonomic cost. `HeapPageViewMut` doesn't automatically get `HeapPageView`'s read methods. In Rust's standard library, `&mut Vec<T>` coerces to `&Vec<T>` automatically via `Deref`, so mutable references get all immutable methods for free.

This only works because `Vec<T>` wraps around a single raw pointer. It then implements `Deref<Target=[T]>` and `DerefMut<Target=[T]>` to give you either a `&T` or `&mut T`.

This works because `Vec<T>` is backed by a single raw pointer internally. From one pointer, the borrow checker decides at the call site whether you get `&[T]` or `&mut [T]` based on how you borrowed it. The unsafe is inside `Vec`, audited once, invisible to callers.

```rust
pub struct Vec<T, #[unstable(feature = "allocator_api", issue = "32838")] A: Allocator = Global> {
    buf: RawVec<T, A>,
    len: usize,
}

#[stable(feature = "rust1", since = "1.0.0")]
impl<T, A: Allocator> ops::Deref for Vec<T, A> {
    type Target = [T];

    #[inline]
    fn deref(&self) -> &[T] {
        self.as_slice()
    }
}

pub const fn as_slice(&self) -> &[T] {
    unsafe { slice::from_raw_parts(self.as_ptr(), self.len) }
}
```

Our design can't do this. `PageReadGuard` and `PageWriteGuard` hold fundamentally different types — `RwLockReadGuard` and `RwLockWriteGuard` — that can't be unified into a single raw pointer. The `RwLock` enforces the read/write distinction at runtime, so it has to be reflected as two distinct types at compile time. Any read method you want on `HeapPageViewMut` has to be written explicitly.

This is the tradeoff in Rust API design. There is no `unsafe` and a clear separation of capabilities but ergonomics aren't as nice as unsafe-backed types get for free.

## Compile-Time Polymorphism

So far we've looked at `HeapPage` as a single concrete type. Now, let's look at more pages like B-tree leaf pages and B-tree internal pages. If you look at their structure, they're almost identical.

```rust
struct HeapPage<'a> {
    header: HeapHeaderRef<'a>,
    line_pointers: LinePtrArray<'a>, // duplicated
    record_space: HeapRecordSpace<'a>, // similar semantics
}

struct BTreeLeafPage<'a> {
    header: BTreeLeafHeaderRef<'a>,
    line_pointers: LinePtrArray<'a>,  // duplicated
    record_space: BTreeRecordSpace<'a>, // similar semantics
}

struct BTreeInternalPage<'a> {
    header: BTreeInternalHeaderRef<'a>,
    line_pointers: LinePtrArray<'a>,  // duplicated again
    record_space: BTreeRecordSpace<'a>, // similar semantics
}
```

The shared logic of slot allocation, compaction, free space management etc. is implemented separately for each which means bugs have to get fixed in triplicate and implementations can drift.

The natural Rust solution is compile-time polymorphism via zero-sized marker types and generics.

### Zero-Sized Markers

```rust
pub struct Heap;
pub struct BTreeLeaf;
pub struct BTreeInternal;
```

These are empty structs, `std::mem::size_of::<Heap>() == 0`. They exist only at compile time to carry type information. No runtime representation, no cost.

### The PageKind Trait

```rust
pub trait PageKind: Sized {
    const PAGE_TYPE: PageType;
    const HEADER_SIZE: usize;

    type HeaderRef<'a>: HeaderReader<'a>;
    type HeaderMut<'a>: HeaderHelpers;

    fn is_slot_live(lp: &LinePtr) -> bool;
    fn init_slot(ptrs: &mut LinePtrArrayMut, slot: SlotId, offset: u16, size: u16);
    fn delete_slot_impl<'a>(parts: &mut PageParts<'a, Self>, slot: SlotId) -> SimpleDBResult<()>;
}
```

Each marker implements `PageKind` with its concrete header type and type-specific behavior. For example, heap pages use a freelist for deleted slots while B-tree pages physically remove them — that difference lives in `delete_slot_impl`.

### One Generic Struct

```rust
pub struct Page<'a, K: PageKind> {
    header: K::HeaderRef<'a>,
    line_pointers: LinePtrArray<'a>,
    record_space: RecordSpace<'a>,
    _marker: PhantomData<K>,
}
```

Shared logic is implemented once on `impl<K: PageKind> Page<'a, K>`. Type-specific methods go on specialized impls:

```rust
// Only available on heap pages
impl<'a> Page<'a, Heap> {
    pub fn tuple_ref(&self, slot: SlotId) -> Option<TupleRef<'a>> { ... }
}

// Only available on B-tree leaf pages
impl<'a> Page<'a, BTreeLeaf> {
    pub fn find_slot(&self, key: &[u8]) -> Result<usize, usize> { ... }
}
```

Calling `tuple_ref()` on a `Page<BTreeLeaf>` is a compile error. The type system enforces page-type-specific operations at zero runtime cost, so no vtables and no dynamic dispatch. The compiler monomorphizes each instantiation into code identical to the hand-written concrete types.

Type aliases preserve the existing API:

```rust
pub type HeapPage<'a> = Page<'a, Heap>;
pub type BTreeLeafPage<'a> = Page<'a, BTreeLeaf>;
pub type BTreeInternalPage<'a> = Page<'a, BTreeInternal>;
```

### Why I Didn't Implement It

The abstraction assumes all pages use slotted layout with a header, line pointers and record space. That holds for heap and B-tree pages, but breaks for meta pages (just fixed header fields), WAL pages (boundary-pointer format), and free pages. Forcing those into the generic would require multiple parallel hierarchies, adding complexity that outweighed the benefit for this codebase.

I still think it's a great idea to explore further and compile-time polymorphism is one of those zero-cost abstractions that make Rust so great to use.

{% include footnotes.html notes="This assumes 64-bit DMA capable hardware. On systems with 32-bit DMA devices or confidential computing VMs (AMD SEV, Intel TDX), the kernel may silently introduce a SWIOTLB bounce buffer, reintroducing a CPU copy. See the Linux kernel docs on <a href='https://docs.kernel.org/core-api/swiotlb.html'>swiotlb</a>." %}
