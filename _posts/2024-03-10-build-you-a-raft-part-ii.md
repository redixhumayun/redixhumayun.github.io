---
layout: post
title: "Build You A Raft - Part II"
category: databases
---

This post is a follow up to my [previous post]({% post_url 2024-02-26-build-you-a-raft-part-i %}) about how to implement the Raft consensus protocol in Rust. In the previous post I went through the basics of how to set up the Raft cluster and implement the logic required for the RPC's.

In this post, I'm going to focus more on how to go about testing the cluster. While building the Raft implementation, I realised that [half the battle with distributed systems](https://x.com/redixhumayun/status/1754745602049774077?s=20) is in building a useful test harness. This has become such a problem in the distributed systems space that companies like [FoundationDB](https://apple.github.io/foundationdb/testing.html) and [TigerBeetle](https://github.com/tigerbeetle/tigerbeetle/blob/main/src/simulator.zig) have written something called a deterministic simulation testing (DST) engine. It's a fancy term for a more advanced form of fuzz testing (atleast from what I understand).

The founder of FoundationDB [gave a talk](https://www.youtube.com/watch?v=4fFDFbi3toc) about why they went about building a DST simulator and he later went on to found [Antithesis](https://antithesis.com/) whose entire business is around trying to provide a generalizable DST engine to other companies to test their products!

Anyway, back to writing a *much* simpler test cluster in Raft!

##  Mocking

While I was trying to write my Raft implementation, there was a very helpful [Twitter reply](https://x.com/cfcosta_/status/1755967315747725574?s=20) about mocking away the network and the clock so that you're essentially testing a deterministic state machine (Raft itself, however, isn't deterministic).

In the previous post we saw an `RPCManager` to facilitate communication and a `tick` method to logically advance the time in the cluster. These methods are defined for each node.

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

### Clocks

I defined two variants of a clock - a mock and a real implementation to use for my cluster (another area I found where Rust's enum pattern matching really shines).

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

There are also two additional helper methods called `get_messages_in_queue` and `replay_messages_in_queue` which allow me to either drain the messages or inspect them without mutating them. The `get_messages` method drains the messages from a node's queue and sends them across the network and `replay_messages` keeps the messages as they are but allows for inspection.

*Note: I picked up these ideas from an implementation on GitHub which you can find [here](https://github.com/jackyzha0/miniraft)*

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

The tick method on the cluster calls the `get_messages` method we saw earlier for each node. It collects all these messages in a central queue and then dispatches them in the same logical tick. But, it dispatches the messages only after each node has gone through its own `tick` function. There's no special reason for the ordering of events here, it's just how I decided to do it.

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

The methods below allow me to advance logical time in my cluster for a bunch of different configurations. Either all nodes can advance by the same amount, a single node can advance by some amount, or all nodes can advance by some variable amount.

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

There are two more methods I found super helpful while doing the testing which are below - the `partition` and `heal_partition` methods. These allow me to simulate a network partition by stopping the flow of messages from one subset of nodes to another and later fixing that.

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

And here's what the code for creating, starting & stopping a cluster looks like.

```rust
pub fn new(number_of_nodes: u64, config: ClusterConfig) -> Self {
    let mut nodes: Vec<RaftNode<i32, KeyValueStore<i32>, DirectFileOpsWriter>> =
        Vec::new();
    let nodes_map: BTreeMap<
        ServerId,
        RaftNode<i32, KeyValueStore<i32>, DirectFileOpsWriter>,
    > = BTreeMap::new();

    let node_ids: Vec<ServerId> = (0..number_of_nodes).collect();
    let addresses: Vec<String> = config
        .ports
        .iter()
        .map(|port| format!("127.0.0.1:{}", port))
        .collect();
    let mut id_to_address_mapping: HashMap<ServerId, String> = HashMap::new();
    for (node_id, address) in node_ids.iter().zip(addresses.iter()) {
        id_to_address_mapping.insert(*node_id, address.clone());
    }

    let mut counter = 0;
    for (node_id, address) in node_ids.iter().zip(addresses.iter()) {
        let server_config = ServerConfig {
            election_timeout: config.election_timeout,
            heartbeat_interval: config.heartbeat_interval,
            address: address.clone(),
            port: config.ports[counter],
            cluster_nodes: node_ids.clone(),
            id_to_address_mapping: id_to_address_mapping.clone(),
        };

        let state_machine = KeyValueStore::<i32>::new();
        let persistence_manager = DirectFileOpsWriter::new("data", *node_id).unwrap();
        let (to_node_sender, from_rpc_receiver) =
            mpsc::channel::<MessageWrapper<i32>>();
        let rpc_manager = CommunicationLayer::MockRPCManager(MockRPCManager::new(
            *node_id,
            to_node_sender.clone(),
        ));
        let mock_clock = RaftNodeClock::MockClock(MockClock {
            current_time: Instant::now(),
        });

        let node = RaftNode::new(
            *node_id,
            state_machine,
            server_config,
            node_ids.clone(),
            persistence_manager,
            rpc_manager,
            to_node_sender,
            from_rpc_receiver,
            mock_clock,
        );
        nodes.push(node);
        counter += 1;
    }
    let message_queue = Vec::new();

    let mut connectivity_hm: HashMap<ServerId, HashSet<ServerId>> = HashMap::new();
    for node_id in &node_ids {
        connectivity_hm.insert(*node_id, node_ids.clone().into_iter().collect());
    }

    TestCluster {
        nodes,
        nodes_map,
        message_queue,
        connectivity: connectivity_hm,
        config,
    }
}

pub fn start(&mut self) {
    for node in &mut self.nodes {
        node.start();
    }
}

pub fn stop(&self) {
    for node in &self.nodes {
        node.stop();
    }
}
```

##  Actual Tests

Now that we have a reasonable test harness set up, I'm going to dive into some specific test scenarios to explain how I use the test harness to move the cluster into a specific configuration and then test out certain scenarios.

*Note: After spending time doing this, I understand why people prefer property based testing or fuzz testing as a methodology. Creating scenario based tests is a very time consuming process and doesn't give you enough coverage to justify the time spent on it.*

My tests aren't exhaustive (and might even be buggy) and I genuinely don't think scenario based testing is the way to get exhaustive coverage anyway. I have more tests in [the repo](https://github.com/redixhumayun/raft) if you want to look at those.

We'll start with some simple tests for a single node cluster. 

```rust
const ELECTION_TIMEOUT: Duration = Duration::from_millis(150);
const HEARTBEAT_INTERVAL: Duration = Duration::from_millis(50);
const MAX_TICKS: u64 = 100;

/// This test checks whether a node in a single cluster will become leader as soon as the election timeout is reached
#[test]
fn leader_election() {
    let _ = env_logger::builder().is_test(true).try_init();
    //  create a cluster with a single node first
    let cluster_config = ClusterConfig {
        election_timeout: ELECTION_TIMEOUT,
        heartbeat_interval: HEARTBEAT_INTERVAL,
        ports: vec![8000],
    };
    let mut cluster = TestCluster::new(1, cluster_config);
    cluster.start();
    cluster.advance_time_by(ELECTION_TIMEOUT + Duration::from_millis(100 + 5)); //  picking 255 here because 150 + a max jitter of 100 guarantees that election has timed out
    cluster.wait_for_stable_leader(MAX_TICKS);
    cluster.stop();
    assert_eq!(cluster.has_leader(), true);
}
```

You can see that setting up the cluster earlier makes testing significantly easier here. I just call my helper methods on the cluster to move the cluster into a specific state and then assert whatever conditions I want against the cluster.

*As an aside, you could convert this to a property based test using the [proptest crate](https://altsysrq.github.io/proptest-book/). You could change the number of nodes in the cluster to determine that a leader gets elected regardless of the number of nodes in the cluster. Something like the below code*

```rust
extern crate proptest;
use proptest::prelude::*;
use std::time::Duration;

proptest! {
    #![proptest_config(ProptestConfig::with_cases(10))]

    fn leader_election_property_based_test(node_count in 1usize..5) {
        let _ = env_logger::builder().is_test(true).try_init();
        
        let cluster_config = ClusterConfig {
            election_timeout: ELECTION_TIMEOUT,
            heartbeat_interval: HEARTBEAT_INTERVAL,
            ports: (8000..8000 + node_count as u16).collect(),
        };
        let mut cluster = TestCluster::new(node_count, cluster_config);
        cluster.start();
        
        cluster.advance_time_by(ELECTION_TIMEOUT + Duration::from_millis(100 + 5));
        cluster.wait_for_stable_leader(MAX_TICKS * node_count as u64); // Adjusted wait time
        cluster.stop();
        
        assert_eq!(cluster.has_leader(), true);
    }
}
```

Here's a slightly more complicated test with 3 nodes that simulates a network partition in the cluster and asserts that a leader still gets elected in the majority partitioned cluster.

```rust
/// This test models the scenario where the leader in a cluster is network partitioned from the
/// rest of the cluster and a new leader is elected
#[test]
fn network_partition_new_leader() {
    let _ = env_logger::builder().is_test(true).try_init();
    let cluster_config = ClusterConfig {
        election_timeout: ELECTION_TIMEOUT,
        heartbeat_interval: HEARTBEAT_INTERVAL,
        ports: vec![8000, 8001, 8002],
    };
    let mut cluster = TestCluster::new(3, cluster_config);
    cluster.start();
    cluster.advance_time_by_for_node(0, ELECTION_TIMEOUT + Duration::from_millis(50));
    cluster.wait_for_stable_leader(MAX_TICKS);

    //  partition the leader from the rest of the group
    let group1 = &[cluster.get_leader().unwrap().id];
    let group2 = &cluster
        .get_all_followers()
        .iter()
        .map(|node| node.id)
        .collect::<Vec<ServerId>>();
    cluster.partition(group1, group2);
    cluster.advance_time_by_for_node(1, ELECTION_TIMEOUT + Duration::from_millis(100));
    cluster.wait_for_stable_leader_partition(MAX_TICKS, group2);
    cluster.stop();
    assert_eq!(cluster.has_leader_in_partition(group2), true);
}
```

Again, you can see how useful the helper methods turn out to be because it's much easier to separate one node from the rest by simulating a network partition and then checking certain properties on the individual partitions.

Now, here's a much more complicated scenario-based test which models a network partition occurring between the leader and the rest of the cluster, the network partition healing and the old leader rejoining the rest of the cluster and having to catch up.

```rust
/// The test models the following scenario
/// 1. A leader is elected
/// 2. Client requests are received and replicated
/// 3. A partition occurs and a new leader is elected
/// 4. Clients requests are processed by the new leader
/// 5. The partition heals and the old leader rejoins the cluster
/// 6. The old leader must recognize its a follower and get caught up with the new leader
#[test]
fn network_partition_log_healing() {
    let _ = env_logger::builder().is_test(true).try_init();
    let cluster_config = ClusterConfig {
        election_timeout: ELECTION_TIMEOUT,
        heartbeat_interval: HEARTBEAT_INTERVAL,
        ports: vec![8000, 8001, 8002],
    };
    let mut cluster = TestCluster::new(3, cluster_config);

    //  cluster starts and a leader is elected
    cluster.start();
    cluster.advance_time_by_for_node(0, ELECTION_TIMEOUT + Duration::from_millis(50));
    cluster.wait_for_stable_leader(MAX_TICKS);
    assert_eq!(cluster.has_leader(), true);

    //  client requests are received and replicated across cluster
    let current_leader_term = cluster
        .get_leader()
        .unwrap()
        .state
        .lock()
        .unwrap()
        .current_term;
    let mut last_log_index = cluster
        .get_leader()
        .unwrap()
        .state
        .lock()
        .unwrap()
        .log
        .last()
        .map_or(0, |entry| entry.index);
    last_log_index += 1;
    let log_entry_1 = LogEntry {
        term: current_leader_term,
        index: last_log_index,
        command: LogEntryCommand::Set,
        key: "a".to_string(),
        value: 1,
    };
    last_log_index += 1;
    let log_entry_2 = LogEntry {
        term: current_leader_term,
        index: last_log_index,
        command: LogEntryCommand::Set,
        key: "b".to_string(),
        value: 2,
    };
    cluster.apply_entries_across_cluster(vec![&log_entry_1, &log_entry_2], MAX_TICKS);
    cluster.verify_logs_across_cluster_for(vec![&log_entry_1, &log_entry_2], MAX_TICKS);

    //  partition and new leader election here
    let group1 = &[cluster.get_leader().unwrap().id];
    let group2 = &cluster
        .get_all_followers()
        .iter()
        .map(|node| node.id)
        .collect::<Vec<ServerId>>();
    cluster.partition(group1, group2);
    cluster.advance_time_by_for_node(1, ELECTION_TIMEOUT + Duration::from_millis(100));
    cluster.wait_for_stable_leader_partition(MAX_TICKS, group2);
    assert_eq!(cluster.has_leader_in_partition(group2), true);

    //  send requests to group2 leader
    let log_entry_3 = {
        let current_leader_term = cluster
            .get_leader_in_cluster(group2)
            .unwrap()
            .state
            .lock()
            .unwrap()
            .current_term;
        let mut last_log_index = cluster
            .get_leader()
            .unwrap()
            .state
            .lock()
            .unwrap()
            .log
            .last()
            .map_or(0, |entry| entry.index);
        last_log_index += 1;
        let log_entry_3 = LogEntry {
            term: current_leader_term,
            index: last_log_index,
            command: LogEntryCommand::Set,
            key: "c".to_string(),
            value: 3,
        };
        cluster.apply_entries_across_cluster_partition(
            vec![&log_entry_3],
            group2,
            MAX_TICKS,
        );
        log_entry_3
    };

    //  partition heals and old leader rejoins the cluster
    //  cluster needs to be verified to ensure all logs are up to date
    let leader_id = cluster.get_leader_in_cluster(group2).unwrap().id;
    cluster.heal_partition();
    cluster.tick_by(MAX_TICKS);
    cluster.wait_for_stable_leader(MAX_TICKS);
    assert_eq!(cluster.get_leader().unwrap().id, leader_id);
    cluster.verify_logs_across_cluster_for(
        vec![&log_entry_1, &log_entry_2, &log_entry_3],
        MAX_TICKS,
    );
}
```

I think this is one of those situations where property-based testing would really shine not because it would make setting up the test simpler but because it would allow me to use the same test case and test the cluster under different scenarios. 

For instance, I could use `proptest` to generate clusters of different sizes, generate different variations of partitions and add a different number of log entries based on some generated value. This would give me more coverage.

So, in a sense, you could almost think of a single property test combining multiple scenario based tests.

### A Little Bit About DST

I mentioned earlier that I've been digging into DST a little bit and with the help of some folks online, I've come to understand that DST is essentially about using a random seed value to generate property based tests while maintaining the ability to re-create a specific scenario using nothing but the seed value.

If we take the last test case we were discussing about generating clusters of different sizes, different variations of partitions and adding a different number of log entries, imagine if we did that with a randomly generated number which we can call a seed value.

This seed value would then be used to generate all the other values in a deterministic way. For instance, the number of nodes in the cluster could be the seed value itself, the number of log entries written could be `seed_value * 2` and the the partition configuration could be defined by `(seed_value % num_of_nodes) - 1`. This way, if the test case fails and the seed value is logged, I can re-create the test scenario using nothing but the seed value itself.

Since the seed value changes on every test run, I can test the system under a variety of different scenarios using property based testing. And in the case of a failure in a specific scenario, I am able to immediately re-create the scenario to debug the error.

I was under the impression that DST was a magic pill in the sense that if you wrote code that passed the simulator, you have bug free code. This is obviously incorrect. You've only reduced the probability of bugs in production by a significant factor (hopefully). In the video I linked above, Will Wilson explains how they considered writing a second DST simulator at FoundationDB because the engineers were getting really good at writing code that passed the simulator but still had bugs in it.

##  Conclusion

So there you have it. Writing a test harness for a distributed system is significantly more challenging than writing the system itself I think. I can see now why FoundationDB spent years building their simulator before writing their engine, although I don't know if that's a realistic approach for most people.

Still, it's fun to dig into this stuff.