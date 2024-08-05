---
layout: post
title: "Async Runtimes"
category: async
---

*[Here's a link](https://github.com/redixhumayun/async-rust) to the code on a GitHub repo*

I'm trying to understand `async` runtimes better, specifically in Rust. This post is a short attempt to build the most basic example of a future and execute it.

A better and more detailed version of this can be found in [this book](https://rust-lang.github.io/async-book/01_getting_started/01_chapter.html).

##  Futures
Creating a future in Rust is very straightforward. You just need to implement the `Future` trait, which requires one method, `poll`, to be implemented.

Let's build a simple future.

```rust
use std::{
    future::Future,
    sync::{
        mpsc::{sync_channel, Receiver, SyncSender},
        Arc, Mutex,
    },
    task::{Context, Poll, Waker},
    thread,
    time::Duration,
};

use futures::{
    future::{BoxFuture, FutureExt},
    task::{waker_ref, ArcWake},
};

struct SharedState {
    completed: bool,
    waker: Option<Waker>,
}

pub struct TimerFuture {
    shared_state: Arc<Mutex<SharedState>>,
}
```

The `Waker` referenced above is a way for the task to inform it's executor that it should be polled again. You can read more from the docs [here](https://doc.rust-lang.org/std/task/struct.Waker.html).

Now, let's make it a future and construct an instance of it.

*Note: If you want to understand more about what `Pin` is and why it's required, [look here](https://blog.cloudflare.com/pin-and-unpin-in-rust). Long story short - it's a way for Rust to ensure that the data being pointed at isn't moved around in memory*

```rust
impl Future for TimerFuture {
    type Output = ();
    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        let mut shared_state = self.shared_state.lock().unwrap();
        if shared_state.completed {
            return Poll::Ready(());
        }
        shared_state.waker = Some(cx.waker().clone());
        return Poll::Pending;
    }
}

impl TimerFuture {
    fn new(duration: Duration) -> Self {
        let shared_state = Arc::new(Mutex::new(SharedState {
            completed: false,
            waker: None,
        }));
        let thread_shared_state = Arc::clone(&shared_state);
        thread::spawn(move || {
            thread::sleep(duration);
            let mut shared_state = thread_shared_state.lock().unwrap();
            shared_state.completed = true;
            if let Some(waker) = shared_state.waker.take() {
                waker.wake();
            }
        });
        TimerFuture { shared_state }
    }
}
```

There we go, we now have a future. Now, we need to run this future to completion.

##  Executing A Future
Let's get some conceptual modeling out of the way first. We have the following terms - `Spawner`, `Executor`, `Task`, `Future` & `Waker`. Let's build the mental model bottom up.

A `Future` is something that will complete at some point in time.

A `Waker` is a way for the future to ensure that it is polled again (typically by placing the future back onto the executor queue)

A `Task` is a wrapper around a `Future` and a `Waker`.

A `Spawner` is a component that constructs a `Task` and provides it to the `Executor`.

An `Executor` constantly checks it's list of `Tasks` and polls their futures for completion

A picture is worth a thousand words, so here's one

![](/assets/img/async/executor_runtime.png)

Let's write some code to represent this.


### Overall Structure
Here's the basic structs for `Task`, `Spawner` & `Executor`.

```rust
struct Task {
    future: Mutex<BoxFuture<'static, ()>>,
    task_sender: SyncSender<Arc<Task>>,
}

struct Spawner {
    task_sender: SyncSender<Arc<Task>>,
}

struct Executor {
    task_queue: Receiver<Arc<Task>>,
}
```

`Task` and `Spawner` keep putting tasks onto the channel and the `Executor` has the receiving end of the channel and keeps polling the futures within these tasks.

### Task
```rust
struct Task {
    future: Mutex<BoxFuture<'static, ()>>,
    task_sender: SyncSender<Arc<Task>>,
}
```

The `BoxFuture` is an aliased type for `pub type BoxFuture<'a, T> = Pin<alloc::boxed::Box<dyn Future<Output = T> + Send + 'a>>`. 

It's a complicated type but it essentially means that I have a `Box` container around a dynamic `Future` and I do not want the data within the `Box` container to be moved around in memory so I wrap it in a `Pin`.

>The easiest way to understand `Pin` is to work through a simple example. Let's create a simple `Pin` wrapper and try to move it. The example below compiles with an error because `String` does not have `Copy` semantics, so when it tries to move the value, it cannot because the container has been pinned in place.
```rust
#[derive(Debug)]
struct MyData {
    value: String,
}
let my_data = Pin::new(Box::new(MyData {
    value: String::from("hello"),
}));
let moved_data = Box::new(MyData {
    value: my_data.value,
});
error[E0507]: cannot move out of dereference of `Pin<Box<MyData>>`
  --> src/main.rs:40:16
   |
40 |         value: my_data.value,
   |                ^^^^^^^^^^^^^ move occurs because value has type `String`, which does not implement the `Copy` trait
   |
help: consider cloning the value if the performance cost is acceptable
   |
40 |         value: my_data.value.clone(),
   |                             ++++++++
```

Now, we said earlier that `Task` is a wrapper for a `Future` and a `Wake` object. By implementing the trait below, we allow a `Waker` object to be constructed from a `Task`. More on that below.
```rust
impl ArcWake for Task {
    fn wake_by_ref(arc_self: &Arc<Self>) {
        let arc_clone = Arc::clone(&arc_self);
        arc_self.task_sender.send(arc_clone).unwrap();
    }
}
```

### Spawner
```rust
struct Spawner {
    task_sender: SyncSender<Arc<Task>>,
}
```

This component pushes new tasks onto the channel.

```rust
impl Spawner {
    fn spawn(&self, future: impl Future<Output = ()> + Send + 'static) {
        let box_future = future.boxed();
        let task = Arc::new(Task {
            future: Mutex::new(box_future),
            task_sender: self.task_sender.clone(),
        });
        self.task_sender.send(task).unwrap();
    }
}
```

### Executor
```rust
struct Executor {
    task_queue: Receiver<Arc<Task>>,
}
```

This component blocks on the receiver until it receives new tasks. Once it gets these tasks, it polls them to determine if they are complete.

There is also a convenience method for constructing an `Executor` and `Spawner`.

```rust
impl Executor {
    fn run(&self) {
        while let Ok(task) = self.task_queue.recv() {
            let mut fut = task.future.lock().unwrap();
            let waker = waker_ref(&task);
            let context = &mut Context::from_waker(&waker);
            if fut.as_mut().poll(context).is_ready() {
                println!("The future is done running");
            }
        }
    }

    fn executor_and_spawner() -> (Executor, Spawner) {
        let (sync_sender, receiver) = sync_channel(10000);
        let executor = Executor {
            task_queue: receiver,
        };
        let spawner = Spawner {
            task_sender: sync_sender,
        };
        (executor, spawner)
    }
}
```

In the `run` method, you can see the `Waker` object being constructed from the `Task`. This is possible because we implemented the `ArcWake` trait for the `Task` above, and we are providing it in the `Context` object to the `poll` method. 

Now, when the future is ready and it calls the `wake` method on the `Wake` object, the method in the `ArcWake` trait is executed.

### Putting It Together

Here's a simple test to demonstrate how this works together

```rust
#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn spawn_tasks() {
    let (executor, spawner) = Executor::executor_and_spawner();
    spawner.spawn(async {
        println!("Hello");
        TimerFuture::new(Duration::from_secs(2)).await;
        println!("World");
    });
    drop(spawner);
    executor.run();
  }
}
```

The output should be `Hello`, followed by a 2 second pause and then a `World`.

Here's a flow diagram for what is going on

```
-> Spawner creates task 
-> Spawner puts task into execution queue 
-> Executor polls the future in the task and finds it pending 
-> The future will keep track of the Waker object 
-> Duration elapses 
-> The future calls the `.wake` method 
-> The `ArcWake` implementation on Task is triggered 
-> The task is again placed on the queue 
-> Executor polls the future and finds it completed
```

### Conclusion

So, there you have it - a very, very simple implementation of a single threaded executor.

### References

* [Cloudflare Blog On Pin And Unpin](https://blog.cloudflare.com/pin-and-unpin-in-rust)
* [Asynchronous Programming In Rust](https://rust-lang.github.io/async-book/01_getting_started/01_chapter.html)
* [GitHub Repo](https://github.com/redixhumayun/async-rust)
* [A Guided Tour Of Streams In Rust](https://www.qovery.com/blog/a-guided-tour-of-streams-in-rust/)
* [Pin And Suffering](https://fasterthanli.me/articles/pin-and-suffering)
* [Scheduling Internals](https://tontinton.com/posts/scheduling-internals/)