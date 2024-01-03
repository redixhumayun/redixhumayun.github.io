---
layout: post
title: "Atomics And Concurrency"
catagory: systems
---

##  Introduction

This post is going to be long and complicated and will most probably have mistakes in it. I'm going to try and keep the examples as simple as possible so that there's less room for error.

Hopefully, you leave with a decent understanding of how memory ordering works and how to use atomics in conjunction with memory ordering to build a lock-free queue in C++.

*Note: If you want to actually compile the code and run it, make sure to do so with the TSan flag enabled for the CLang compiler. TSan is a reliable way of detecting data races in your code, instead of trying to repeatedly run the code in a loop hoping for a data race to occur.*

Imagine you have either some concurrent code operating on some shared data in memory. You have two threads or processes, one writing and one reading on some shared piece of state.

![](/assets/img/atomics/processes-shared-memory.jpeg)

The "safe" way of dealing with this is mutexes. However, mutexes tend to add overhead. Atomics are a more performant but much more complicated way of dealing with concurrent operations.

##  Atomics

This section is very simple. Atomics are simply operations or instructions that cannot be split by the compiler or the CPU or re-ordered in any way. 

The simplest possible example of an atomic in C++ is an atomic flag

```cpp
#include <atomic>

std::atomic<bool> flag(false);

int main() {
  flag.store(true);
  assert(flag.load() == true);
}
```

We define an atomic boolean, initialise it and then call `store` on it. This method sets the value on the flag. You can then `load` the flag from memory and assert its value.

### Operations With Atomics

The operations you can perform with atomics are straightforward:

1. You can store some value into them with a `store()` method
2. You can load some value from them with a `load()` method
3. You can do a Compare-and-Set(CAS) with them using a `compare_exchange_weak()` or `compare_exchange_strong()` method

The important thing to remember is that each of these cannot be split into separate instructions.

*Note: There are more methods available, but this is all we need for now*

There are various atomics available in C++ and you can use them in combination with memory orderings. 

##  Memory Ordering

This section is a lot more complicated and is the meat of the matter. There are some great references for understanding this I've linked at the bottom.

### Why It Matters

The compiler and CPU are capable of re-ordering your program instructions, often independently of one another. That is, your compiler can re-order instructions and your CPU can re-order instructions again. See [here](https://www.reddit.com/r/cpp/comments/dh3hle/why_is_compiler_allowed_to_reorder_instructions/).

However, this is only allowed if the compiler can definitely *not* establish a relationship between the two sets of instructions. 

For instance, this can be re-ordered because there is no relationship between the assignment to x and the assignment to y. That is, the compiler or CPU might assign y first and then x. But, this doesn't change the semantic meaning of your program.

```cpp
int x = 10;
int y = 5;
```

However, the code below cannot be re-ordered because the compiler cannot establish the absence of a relationship between x and y. It's obvious to see here because y depends on the value of x.

```cpp
int x = 10;
int y = x + 1;
```

It doesn't seem like a big problem until there's multi-threaded code.

### Intuition For Ordering

```cpp
#include <cassert>
#include <thread>

int data = 0;

void producer() {
  data = 100;  // Write data
}

void consumer() {
  assert(data == 100);
}

int main() {
  std::thread t1(producer);
  std::thread t2(consumer);
  t1.join();
  t2.join();
  return 0;
}
```

The multi-threaded example above will fail to compile with TSan because there is a clear data race when thread 1 is trying to set the value of data and thread 2 is trying to read the value of data. The easy answer here is a mutex to protect the write & read of data but there's a way to do this with an atomic boolean. 

We loop on the atomic boolean until we find that it is set to the value we are looking for and then check the the value of `data`.

```cpp
#include <atomic>
#include <cassert>
#include <thread>

int data = 0;
std::atomic<bool> ready(false);

void producer() {
  data = 100;
  ready.store(true);  // Set flag
}

void consumer() {
  while (!ready.load())
    ;
  assert(data == 100);
}

int main() {
  std::thread t1(producer);
  std::thread t2(consumer);
  t1.join();
  t2.join();
  return 0;
}
```

When you compile this with TSan, it doesn't complain about any race conditions. *Note: I'm going to refer back to why TSan doesn't complain here.*

Now, I'm going to break it by adding a memory ordering guarantee to it. Just replace `ready.store(true);` with `ready.store(true, std::memory_order_relaxed);` and replace `while (!ready.load())` with `while (!ready.load(std::memory_order_relaxed))`.

The issue here is that we have no order among the operations of the two threads anymore. The compiler or CPU is free to re-order instructions in the two threads. If we go back to our abstract visualisation from earlier, this is what it looks like now.

![](/assets/img/atomics/memory-relaxed.jpeg)

The visualisation above shows us that our two processes (threads) have no way of agreeing upon the current state or the order in which that state has changed.

Once process 2 determines that the flag has been set to true, it tries to read the value of data. But, thread 2 believes that the value of data has not yet changed even though it believes the value of flag has been set to true. 

In a `memory_order_relaxed` mode, two threads have no way of agreeing upon the order of operations on shared variables. From thread 1's point of view, the operations it executed were 

```
write(data, 100)
store(ready, true)
```

However, from thread 2's point of view, the order of operations *it saw* thread 1 execute were

```
store(ready, true)
write(data, 100)
```

Without agreeing upon the order in which operations occurred on *shared variables*, it isn't safe to make changes to those variables across threads. 

This is confusing because the classic model of interleaving concurrent operations doesn't apply here. In the classic model of concurrent operations, there is always some order that can be established. For instance, we can say that this is one possible scenario of operations.

```
Thread 1                  Memory                  Thread 2
---------                 -------                 ---------
  |                          |                          |
  |   write(data, 100)       |                          |
  | -----------------------> |                          |
  |                          |     load(ready) == true  |
  |                          | <----------------------  |
  |                          |                          |
  |   store(ready, true)     |                          |
  | -----------------------> |                          |
  |                          |                          |
  |                          |       read(data)         |
  |                          | <----------------------  |
  |                          |                          |
```

But, the above graphic *assumes* that both threads have agreed upon some global order of events, which isn't true at all anymore! This is still confusing for me to wrap my head around.

Okay, let's fix the code by replacing `std::memory_order_relax` with `std::memory_order_seq_cst`. 

So, `ready.store(true, std::memory_order_relaxed);` becomes `ready.store(true, std::memory_order_seq_cst);` and `while (!ready.load(std::memory_order_relaxed))` becomes `while (!ready.load(std::memory_order_seq_cst))`.

If you run this again with TSan, there are no more data races. But why did that fix it? 

### Memory Barrier

So, we saw our problem earlier was about two threads being unable to agree upon a single view of events and we wanted to prevent that. So, we introduced a *barrier* using sequential consistency.

```
Thread 1                  Memory                  Thread 2
---------                 -------                 ---------
  |                          |                          |
  |   write(data, 100)       |                          |
  | -----------------------> |                          |
  |                          |                          |
  |  ================Memory Barrier===================  |
  |   store(ready, true)     |                          |
  | -----------------------> |                          |
  |                          |   load(ready) == true    |                   
  |                          | <----------------------  |
  |  ================Memory Barrier===================  |
  |                          |                          |
  |                          |       read(data)         |
  |                          | <----------------------  |
  |                          |                          |

```

The memory barrier here says that nothing before the store operation and nothing after the load operation can be re-ordered. That is, thread 2 now has a guarantee that the compiler or the CPU will not place the write to data after the write to the flag in thread 1.

The region inside the memory barrier is akin to a critical section that a thread needs to a mutex to enter. We now have a way to synchronise the two threads on the order of events across them.

This brings us back to our classic model of interleaving in concurrency because we now have an order of events both threads agree upon.

### Types Of Memory Order

There are 3 main types of memory order we need to worry about

1. Relaxed memory model
2. Release-acquire memory model
3. Sequentially consistent memory order

We already covered 1 & 3 in the examples above. The second memory model literally lies between the other two in terms of consistency.

```cpp
#include <atomic>
#include <cassert>
#include <iostream>
#include <thread>

int data = 0;
std::atomic<bool> ready(false);

void producer() {
  data = 100;
  ready.store(true, std::memory_order_release);  // Set flag
}

void consumer() {
  while (!ready.load(std::memory_order_acquire))
    ;
  assert(data == 100);
}

int main() {
  std::thread t1(producer);
  std::thread t2(consumer);
  t1.join();
  t2.join();
  return 0;
}
```

The above is the same example from earlier, expect with `std::memory_order_release` used for `ready.store()` and `memory_order_acquire` used for `read.load()`. The intuition here for ordering is similar to the pervious memory barrier example. Except, this time the memory barrier is formed on the pair of `ready.store()` and `ready.load()` operations and will only work when used on the *same* atomic variable across threads.

The difference between the sequentially consistent model and the release-acquire model is that the former enforces a global order of operations across all threads.

The latter enforces an order only among pairs of release and acquire operations.