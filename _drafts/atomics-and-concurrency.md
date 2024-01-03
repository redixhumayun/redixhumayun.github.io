---
layout: post
title: "Atomics And Concurrency"
catagory: systems
---

##  Introduction

This post is going to be long and complicated and will most probably have mistakes in it. I'm going to try and keep the examples as simple as possible so that there's less room for error.

Hopefully, you leave with a decent understanding of how memory ordering works. 

##  Atomics

This section is very simple. Atomics are simply operations or instructions that cannot be split by the compiler or the CPU or re-ordered in any way. 

The simplest possible example of an atomic in C++ is an atomic flag

```cpp
#include <atomic>

std::atomic_flag flag = ATOMIC_FLAG_INIT;

int main() {
  bool x = flag.test_and_set();
  std::cout << x << std::endl;  //  0
  bool y = flag.test_and_set();
  std::cout << y << std::endl;  //  1
}
```

We define an atomic flag, initialise it and then call `test_and_set` on it. This method flips the value on the flag and returns the *old value*. And you are guaranteed that the program will never return the old value without setting the new value and vice-versa.

Using this, its fairly straightforward to define a spin lock type of mutex. Essentially, something that keeps trying to lock a mutex in an infinite loop.

There are various atomics available in C++ and you can use them in conjunction with memory orderings. 

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

However, this cannot be re-ordered because the compiler cannot establish the absence of a relationship between x and y. It's obvious to see here because y depends on the value of x.

```cpp
int x = 10;
int y = x + 1;
```

It doesn't seem like a big problem until there's multi-threaded code.