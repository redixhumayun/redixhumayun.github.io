---
layout: post
title: "Race Conditions & Data Races"
category: concurrency
---

I've been using Rust at work for the last few months and keep hearing about "fearless concurrency" in Rust. I'm still not entirely sure what that means but I mistakenly assumed that it meant that race conditions were impossible in Rust. This is obviously wrong, but it took me a while to understand why.

##  Race Conditions In Rust

Here's some code written in Rust that has a race condition in it because of application logic. It uses the classic example of tranferring money from one account to another but does it in an extremely silly way

```rust
struct Account {
    balance: Mutex<i32>,
}

fn transfer2(amount: i32, account_from: Arc<Account>, account_to: Arc<Account>) -> &'static str {
    // First atomic block
    let bal;
    {
        let from_balance = account_from.balance.lock().unwrap();
        bal = *from_balance;
    }

    // Check balance
    if bal < amount {
        return "NOPE";
    }

    // Second atomic block
    {
        let mut to_balance = account_to.balance.lock().unwrap();
        *to_balance += amount;
    }

    // Third atomic block
    {
        let mut from_balance = account_from.balance.lock().unwrap();
        *from_balance -= amount;
    }

    "YEP"
}

fn main() {
    let account_from = Arc::new(Account {
        balance: Mutex::new(100),
    });
    let account_to = Arc::new(Account {
        balance: Mutex::new(50),
    });

    let account_from_clone = Arc::clone(&account_from);
    let account_to_clone = Arc::clone(&account_to);

    let handle = thread::spawn(move || {
        let result = transfer2(30, account_from_clone, account_to_clone);
        println!("Transfer result: {}", result);
    });

    // Simulate another transfer in the main thread
    let result = transfer2(80, Arc::clone(&account_from), Arc::clone(&account_to));
    println!("Transfer result: {}", result);

    handle.join().unwrap();
}
```

Here's a simple execution trace that triggers the race condition in the code

```
T1 -> amount = 30, from_balance = 100, to_balance = 50
T2 -> amount = 80, from_balance = 100, to_balance = 50
Both T1 and T2 pass the check of bal >= amount
T1 -> amount = 30, from_balance = 100, to_balance = 80
T2 -> amount = 80, from_balance = 100, to_balance = 160
T1 -> amount = 30, from_balance = 70, to_balance = 160
T2 -> amount = 80, from_balance = -10, to_balance = 160
```

The execution results in the bank account being overdrawn. However, the Rust compiler allows this code to be compiled because there is no verifiable way to prevent every possible logical race condition.

It is impossible to prevent all classes of race errors [unless you control the scheduler](https://doc.rust-lang.org/nomicon/races.html#:~:text=However%20Rust%20does%20not%20prevent,by%20frameworks%20such%20as%20RTIC.).

##  Deadlocks in Rust

Now, we've seen that Rust's concurrency patterns can't prevent application logic race conditions. Rust also cannot prevent your code from deadlocking, which is a specific case of a race condition where your program halts execution. This is also an application logic error.

Assume that you have a program that is attempting to acquire locks in a specific order. We'll have two locks - A and B  and two programs, one of which attempts to acquire A first and then B, and the other program which does the reverse. 

Here's some sample code which demonstrates that

```rust
use std::sync::{Arc, Mutex};
use std::thread;

struct Locks {
    lock_a: Mutex<u64>,
    lock_b: Mutex<u64>,
}

impl Locks {
    fn acquire(&self) {
        println!("running acquire");
        let mut a = self.lock_a.lock().unwrap();
        println!("got lock a");
        thread::sleep(std::time::Duration::from_millis(1000));
        let mut b = self.lock_b.lock().unwrap();
        println!("got lock b");
        *a += 1;
        *b += 1;
        println!("The sum is {}", *a + *b);
    }

    fn acquire_rev(&self) {
        println!("running acquire rev");
        thread::sleep(std::time::Duration::from_millis(100));
        let mut b = self.lock_b.lock().unwrap();
        println!("got lock b");
        let mut a = self.lock_a.lock().unwrap();
        println!("got lock a");
        *b += 1;
        *a += 1;
        println!("The reverse sum is {}", *b + *a);
    }
}

fn main() {
    let mut handles = vec![];

    let locks = Arc::new(Locks {
        lock_a: Mutex::new(1),
        lock_b: Mutex::new(2),
    });

    for _ in 0..100 {
        let locks = Arc::clone(&locks);
        let handle = thread::spawn(move || {
            locks.acquire();
            locks.acquire_rev();
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }
}
```

I've introduced a couple of sleeps in the code and added some logs to increase the likelihood of the code deadlocking. Also, this code is extremely silly (for illustrative purposes, obviously) but the point remains that this code compiles perfectly and deadlocks.

It's impossible for the Rust compiler to catch the issue here because this is an application logic error. As far as the compiler is concerned, everything is wrapped behind an appropriate mutex and the data behind the mutex is being read correctly.

Now, let's look at a subset of a race condition called a data race - something that the Rust compiler can definitely catch.

##  Data Races

```rust
use std::sync::{Arc, Mutex};
use std::thread;

struct Counter {
    counter: Mutex<u64>,
}

impl Counter {
    fn increment_1(&self) {
        let mut counter = self.counter.lock().unwrap();
        *counter += 1;
        println!("The new value of counter in increment_1 {}", counter);
    }

    fn increment_2(&self) {
        let mut counter = self.counter.lock().unwrap();
        *counter += 1;
        println!("The new value of counter in increment_2 {}", counter);
    }
}

fn main() {
    let mut handles = vec![];

    let counter = Arc::new(Counter { counter: 0.into() });

    for _ in 0..100 {
        let counter_1 = Arc::clone(&counter);
        let counter_2 = Arc::clone(&counter);
        let handle_1 = thread::spawn(move || {
            counter_1.increment_1();
        });
        let handle_2 = thread::spawn(move || {
            counter_2.increment_2();
        });
        handles.push(handle_1);
        handles.push(handle_2);
    }

    for handle in handles {
        handle.join().unwrap();
    }
}
```

There is no way to write this code in Rust such that the memory location represented by counter could potentially be updated by two threads at once. First, I need to wrap the `Counter` object in an `Arc` because I need to send it across threads. `Arc` gives me a thread safe read counter.

However, if I tried to remove the `Mutex` around `counter`, I would need to make the methods `increment_1` and `increment_2` use the signature `&mut self`. Now, if I were to try to call a mutable method on an object wrapped in an `Arc` like the code below, I get an error

```rust
use std::sync::{Arc, Mutex};
use std::thread;

struct Counter {
    counter: u64,
}

impl Counter {
    fn increment_1(&mut self) {
        let mut counter = self.counter;
        counter += 1;
        self.counter = counter;
        println!("The new value of counter in increment_1 {}", counter);
    }

    fn increment_2(&mut self) {
        let mut counter = self.counter;
        counter += 1;
        self.counter = counter;
        println!("The new value of counter in increment_2 {}", counter);
    }
}

fn main() {
    let mut handles = vec![];

    let counter = Arc::new(Counter { counter: 0 });

    for _ in 0..100 {
        let counter_1 = Arc::clone(&counter);
        let counter_2 = Arc::clone(&counter);
        let handle_1 = thread::spawn(move || {
            counter_1.increment_1();
        });
        let handle_2 = thread::spawn(move || {
            counter_2.increment_2();
        });
        handles.push(handle_1);
        handles.push(handle_2);
    }

    for handle in handles {
        handle.join().unwrap();
    }
}
```

The error states that

```
error[E0596]: cannot borrow data in an `Arc` as mutable
  --> src/main.rs:33:13
   |
33 |             counter_1.increment_1();
   |             ^^^^^^^^^ cannot borrow as mutable
   |
   = help: trait `DerefMut` is required to modify through a dereference, but it is not implemented for `Arc<Counter>`
```

So, if I want to share some state across threads, I am forced to wrap that data in a `Mutex`, preventing any kind of data race.

There is no way to write this code with a race condition which the Rust compiler will allow.

Let's look at a simpler case of how Rust prevents data races by ignoring threads.

##  One Mutable Reference Or Multiple Immutable References

If you've read [the Rust Book](https://doc.rust-lang.org/book/), you've probably heard about how you can have either one mutable reference to an object or multiple immutable references. This is similar to the idea of a `RWLock`, where you can have multiple readers or a single writer at any given point of time.

Here's a small example in Rust showing how the compiler prevents this class of errors

```rust
struct Data {
    var_a: u64,
    var_b: u64,
}

fn main() {
    let mut data = Data { var_a: 1, var_b: 2 };
    let a = &data.var_a;
    data.var_a += 1;
    println!("var a {}", data.var_a);
    println!("a {}", a);
}
```

If you try to compile the above code, you see the following error

```
error[E0506]: cannot assign to `data.var_a` because it is borrowed
  --> src/main.rs:61:5
   |
60 |     let a = &data.var_a;
   |             ----------- `data.var_a` is borrowed here
61 |     data.var_a += 1;
   |     ^^^^^^^^^^^^^^^ `data.var_a` is assigned to here but it was already borrowed
62 |     println!("var a {}", data.var_a);
63 |     println!("a {}", a);
   |                      - borrow later used here
```

The error is essentially saying that because the variable `a` borrows `data.var_a`, `data.var_a` cannot later be changed later since this invalidates the reference that `a` holds. This is preventing a data race because the memory location that `a` points to cannot be changed if `a` is going to be used.

Here's a different version of the above code with methods implemented on the `Data` struct but demonstrating the same principle regarding data race prevention.

```rust
struct Data {
    var_a: u64,
    var_b: u64,
}

impl Data {
    fn get_a(&self) -> &u64 {
        &self.var_a
    }

    fn increment_a(&mut self) {
        self.var_a += 1;
    }
}

fn main() {
    let mut data = Data { var_a: 1, var_b: 2 };
    let a_ref = data.get_a();
    data.increment_a();
    println!("The ref {}", a_ref);
}
```

This code gives the following error

```
error[E0502]: cannot borrow `data` as mutable because it is also borrowed as immutable
   --> src/main.rs:109:5
    |
108 |     let a_ref = data.get_a();
    |                 ---- immutable borrow occurs here
109 |     data.increment_a();
    |     ^^^^^^^^^^^^^^^^^^ mutable borrow occurs here
110 |     println!("The ref {}", a_ref);
    |                            ----- immutable borrow later used here
```

The basic underlying principle behind Rust preventing data races is quite simple: you can either have a single mutable reference to some location in memory and mutate that data in any way you wish, or you can hold multiple immutable references to some location in memory and read from it via as many threads as you'd like.

##  References

1. [Race Condition vs Data Race](https://blog.regehr.org/archives/490)
2. [Rustnomicon on data races and race conditions](https://doc.rust-lang.org/nomicon/races.html#:~:text=However%20Rust%20does%20not%20prevent,by%20frameworks%20such%20as%20RTIC.)