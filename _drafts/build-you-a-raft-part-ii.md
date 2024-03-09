---
layout: post
title: "Build You A Raft - Part II"
category: databases
---

This post is a follow up to my [previous post](https://redixhumayun.github.io/databases/2024/02/26/build-you-a-raft-part-i.html) about how to implement the Raft consensus protocol in Rust. In the previous post I went through the basics of what how to set up the Raft cluster and implement the logic required for the RPC's.

In this post, I'm going to focus more on how to go about testing the cluster. While building the Raft implementation, I realised that [half the battle with distributed systems](https://x.com/redixhumayun/status/1754745602049774077?s=20) is in building a useful test harness. This has become such a problem in the distributed systems space that companies like [FoundationDB](https://apple.github.io/foundationdb/testing.html) and [TigerBeetle](https://github.com/tigerbeetle/tigerbeetle/blob/main/src/simulator.zig) have written something called a deterministic simulation testing (DST) engine. It's a fancy term for a more advanced form of fuzz testing. 

The founder of FoundationDB [gave a talk](https://www.youtube.com/watch?v=4fFDFbi3toc) about why they went about building a DST engine and he later went on to found [Antithesis](https://antithesis.com/) whose entire business is around trying to provide a generalizable DST engine to other companies to test their products!

Anyway, back to writing a *much* simpler test cluster in Raft!

##  Mocking

While I was trying to write my Raft implementation, there was a very helpful [Twitter reply to me](https://x.com/cfcosta_/status/1755967315747725574?s=20) about mocking away the network and the clock so that you're essentially testing a deterministic state machine (Raft itself isn't deterministic).

In my previous post, I defined two structs on each node - `RPCManager` to faciliate communication over network and a `tick` method to logically advance the time in the cluster.

This `tick` function which I've reproduced below calls an `advance_time_by` method, which in turn calls `clock.advance` on a node. Each node has a `clock` which is injected into it.

```rust
struct RaftNode<T: RaftTypeTrait, S: StateMachine<T>, F: RaftFileOps<T>> {
    id: ServerId,
    state: Mutex<RaftNodeState<T>>,
    state_machine: S,
    config: ServerConfig,
    peers: Vec<ServerId>,
    to_node_sender: mpsc::Sender<MessageWrapper<T>>,
    from_rpc_receiver: mpsc::Receiver<MessageWrapper<T>>,
    rpc_manager: CommunicationLayer<T>,
    persistence_manager: F,
    clock: RaftNodeClock,
}

impl RaftNodeClock {
    fn advance(&mut self, duration: Duration) {
        match self {
            RaftNodeClock::RealClock(_) => (), //  this method should do nothing for a real clock
            RaftNodeClock::MockClock(clock) => clock.advance(duration),
        }
    }
}

fn advance_time_by(&mut self, duration: Duration) {
    self.clock.advance(duration);
}

fn tick(&mut self) {
    let mut state_guard = self.state.lock().unwrap();
    match state_guard.status {
        RaftNodeStatus::Leader => {
            //  the leader should send heartbeats to all followers
            self.send_heartbeat(&state_guard);
        }
        RaftNodeStatus::Candidate | RaftNodeStatus::Follower => {
            //  the candidate or follower should check if the election timeout has elapsed
            self.check_election_timeout(&mut state_guard);
        }
    }
    drop(state_guard);

    //  listen to incoming messages from the RPC manager
    self.listen_for_messages();
    self.advance_time_by(Duration::from_millis(1));
}
```

### Clock

I defined two variants of a clock - a mock and a real implementation to use for my cluster (another area I found Rust's enum pattern matching really shines).

```rust
use std::time::{Duration, Instant};

pub trait Clock {
    fn now(&self) -> Instant;
}

pub struct RealClock;
impl Clock for RealClock {
    fn now(&self) -> Instant {
        Instant::now()
    }
}

pub struct MockClock {
    pub current_time: Instant,
}

impl MockClock {
    pub fn advance(&mut self, duration: Duration) {
        self.current_time += duration;
    }
}

impl Clock for MockClock {
    fn now(&self) -> Instant {
        self.current_time
    }
}
```

So any time I was creating a cluster for testing, I would create nodes with a `MockClock` and for actual implementations (I never created those) I would use the `RealClock`. You'll notice that the `RealClock` cannot have its time advanced.

### Network

Similar to the clocks, for the network layer I created a `MockRPCManager` which contained a message queue indicating what messages were sent by the node for every logical tick of the cluster. And when a node wanted to send a message, it would simply get pushed into the `sent_messages` queue.

```rust
#[derive(Debug, Clone)]
struct MessageWrapper<T: RaftTypeTrait> {
    from_node_id: ServerId,
    to_node_id: ServerId,
    message: RPCMessage<T>,
}

struct MockRPCManager<T: RaftTypeTrait> {
    server_id: ServerId,
    to_node_sender: mpsc::Sender<MessageWrapper<T>>,
    sent_messages: RefCell<Vec<MessageWrapper<T>>>,
}

impl<T: RaftTypeTrait> MockRPCManager<T> {
    fn new(server_id: ServerId, to_node_sender: mpsc::Sender<MessageWrapper<T>>) -> Self {
        MockRPCManager {
            server_id,
            to_node_sender,
            sent_messages: RefCell::new(vec![]),
        }
    }
}

impl<T: RaftTypeTrait> MockRPCManager<T> {
    fn start(&self) {}

    fn stop(&self) {}

    fn send_message(&self, _to_address: String, message: MessageWrapper<T>) {
        self.sent_messages.borrow_mut().push(message);
    }

    fn get_messages_in_queue(&mut self) -> Vec<MessageWrapper<T>> {
        let mut mock_messages_vector: Vec<MessageWrapper<T>> = Vec::new();
        for message in self.sent_messages.borrow_mut().drain(..) {
            mock_messages_vector.push(message.clone());
        }
        mock_messages_vector
    }

    fn replay_messages_in_queue(&self) -> Ref<Vec<MessageWrapper<T>>> {
        self.sent_messages.borrow()
    }
}
```

The `CommunicationLayer` trait defines what methods are available to a node to consume via its network layer.

```rust
trait Communication<T: RaftTypeTrait> {
    fn start(&self);

    fn stop(&self);

    fn send_message(&self, to_address: String, message: MessageWrapper<T>);
}

enum CommunicationLayer<T: RaftTypeTrait> {
    MockRPCManager(MockRPCManager<T>),
    RPCManager(RPCManager<T>),
}

impl<T: RaftTypeTrait> Communication<T> for CommunicationLayer<T> {
    fn start(&self) {
        match self {
            CommunicationLayer::MockRPCManager(manager) => manager.start(),
            CommunicationLayer::RPCManager(manager) => manager.start(),
        }
    }

    fn stop(&self) {
        match self {
            CommunicationLayer::MockRPCManager(manager) => manager.stop(),
            CommunicationLayer::RPCManager(manager) => manager.stop(),
        }
    }

    fn send_message(&self, to_address: String, message: MessageWrapper<T>) {
        match self {
            CommunicationLayer::MockRPCManager(manager) => {
                manager.send_message(to_address, message)
            }
            CommunicationLayer::RPCManager(manager) => manager.send_message(to_address, message),
        }
    }
}

impl<T: RaftTypeTrait> CommunicationLayer<T> {
    fn get_messages(&mut self) -> Vec<MessageWrapper<T>> {
        match self {
            CommunicationLayer::MockRPCManager(manager) => {
                return manager.get_messages_in_queue();
            }
            CommunicationLayer::RPCManager(_) => {
                panic!("This method is not supported for the RPCManager");
            }
        }
    }

    fn replay_messages(&self) -> Ref<Vec<MessageWrapper<T>>> {
        match self {
            CommunicationLayer::MockRPCManager(manager) => {
                return manager.replay_messages_in_queue();
            }
            CommunicationLayer::RPCManager(_) => {
                panic!("This method is not supported for the RPCManager");
            }
        }
    }
}
```

The last two methods above, `get_messages` and `replay_messages` are what I use in my test cluster to be able to inspect the network at any given point of time. The `get_messages` method drains the messages from a node's queue and sends them across the network and `replay_messages` keeps the messages as they are but allows for inspection.

*Note: I picked up these ideas from an implementation on GitHub which you can find [here](https://github.com/jackyzha0/miniraft)*

##  Test Cluster

Okay, now that we've got the mocking out of the way, let's jump into defining the test cluster itself.

Here's some basic definitions for my `TestCluster`. 

```rust
#[derive(Clone)]
pub struct ClusterConfig {
    pub election_timeout: Duration,
    pub heartbeat_interval: Duration,
    pub ports: Vec<u64>,
}

pub struct TestCluster {
    pub nodes: Vec<RaftNode<i32, KeyValueStore<i32>, DirectFileOpsWriter>>,
    pub nodes_map:
        BTreeMap<ServerId, RaftNode<i32, KeyValueStore<i32>, DirectFileOpsWriter>>,
    pub message_queue: Vec<MessageWrapper<i32>>,
    pub connectivity: HashMap<ServerId, HashSet<ServerId>>,
    pub config: ClusterConfig,
}
```

I have a bunch of helper methods on this `TestCluster` but it would be too much to go into all of them so I'll just go over the `tick` method and the time based methods here. If you want to see all the methods, check out the repo [here](https://github.com/redixhumayun/raft).

```rust
impl TestCluster {
pub fn tick(&mut self) {
    //  Collect all messages from nodes and store them in the central queue
    self.nodes.iter_mut().for_each(|node| {
        let mut messages_from_node = node.rpc_manager.get_messages();
        self.message_queue.append(&mut messages_from_node);
    });

    //  allow each node to tick
    self.nodes.iter_mut().for_each(|node| {
        node.tick();
    });

    //  deliver all messages from the central queue
    self.message_queue
        .drain(..)
        .into_iter()
        .for_each(|message| {
            let node = self
                .nodes
                .iter()
                .find(|node| node.id == message.to_node_id)
                .unwrap();
            //  check if these pair of nodes are partitioned
            if self
                .connectivity
                .get_mut(&message.from_node_id)
                .unwrap()
                .contains(&message.to_node_id)
            {
                match node.to_node_sender.send(message) {
                    Ok(_) => (),
                    Err(e) => {
                        panic!(
                            "There was an error while sending the message to the node: {}",
                            e
                        )
                    }
                };
            }
        });
}
```

The tick method on the cluster calls the `get_messages` method we saw earlier for each node. It collects all these messages in a central queue and then dispatches them in the same logical tick. But, it dispatches the messages only after each node has gone through its own `tick` function. There's no special reason for the ordering of events here, it's just how I decided to do it.

```rust
pub fn tick_by(&mut self, tick_interval: u64) {
    for _ in 0..tick_interval {
        self.tick();
    }
}

pub fn advance_time_by_for_node(&mut self, node_id: ServerId, duration: Duration) {
    let node = self
        .nodes
        .iter_mut()
        .find(|node| node.id == node_id)
        .expect(&format!("Could not find node with id: {}", node_id));
    node.advance_time_by(duration);
}

pub fn advance_time_by_variably(&mut self, duration: Duration) {
    //  for each node in the cluster, advance it's mock clock by the duration + some random variation
    for node in &mut self.nodes {
        let jitter = rand::thread_rng().gen_range(0..50);
        let new_duration = duration + Duration::from_millis(jitter);
        node.advance_time_by(new_duration);
    }
}

pub fn advance_time_by(&mut self, duration: Duration) {
    //  for each node in the cluster, advance it's mock clock by the duration
    for node in &mut self.nodes {
        node.advance_time_by(duration);
    }
}
```

These methods are helper methods which allow my tests to move the cluster into specific states. There are two more methods I found super helpful while doing the testing which are below

```rust
/// Separates the cluster into two smaller clusters where only the nodes within
/// each cluster can communicate between themselves
pub fn partition(&mut self, group1: &[ServerId], group2: &[ServerId]) {
    for &node_id in group1 {
        self.connectivity
            .get_mut(&node_id)
            .unwrap()
            .retain(|&id| group1.contains(&id));
    }
    for &node_id in group2 {
        self.connectivity
            .get_mut(&node_id)
            .unwrap()
            .retain(|&id| group2.contains(&id));
    }
}

/// Removes any partition in the cluster and restores full connectivity among all nodes
pub fn heal_partition(&mut self) {
    let all_node_ids = self
        .nodes
        .iter()
        .map(|node| node.id)
        .collect::<HashSet<ServerId>>();
    for node_id in all_node_ids.iter() {
        self.connectivity.insert(*node_id, all_node_ids.clone());
    }
}
```