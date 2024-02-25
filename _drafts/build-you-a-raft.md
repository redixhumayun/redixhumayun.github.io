---
layout: post
title: "Build You A Raft - Part I"
category: databases
---

##  What Is Raft?

Raft is a famous distributed consensus algorithm which is implemented in various database engines now. The most famous is probably [Yugabyte DB](https://www.yugabyte.com/) a distributed SQL database.

First, we need to discuss what a distributed SQL database is and why we need distributed consensus on it. There are two classic concepts that come to mind when thinking of a distributed database - replication and sharding. Typically when you think of distributed consensus, its for a replicated database. That is, each copy of the database is identical. 

Now, imagine that we have a distributed SQL database with 3 nodes. Now there's two ways to accept a write - any node can accept a write the way Amazon's Dynamo does from its famous 2007 paper or a single node is elected a leader and accepts a write and replicates it to the followers. It's the second case a protocol like Raft was designed for.

##  The Raft Paper

The Raft paper was published in 2014, and you can read it [here](https://web.stanford.edu/~ouster/cgi-bin/papers/raft-atc14.pdf). It's probably one of the more understandeable papers out there and can be grokked pretty easily. Accompanying the paper are two resources - the great [Raft website](https://raft.github.io/) and the even better [Raft visualisation](https://thesecretlivesofdata.com/raft/). That visualisation is seriously incredible!

The most important part of the paper is in a single page where the RPC's are described in detail. This page is dense with information and I spent weeks poring over it, trying to understand what was going on.

![](/assets/img/databases/raft/raft_rpc.png)

Another super valuable resource is [the TLA+ spec for Raft](https://github.com/ongardie/raft.tla). This makes a world of difference if you're trying to implement Raft.

If you've heard of [Paxos](https://www.scylladb.com/glossary/paxos-consensus-algorithm/), Raft is a simpler form of that. Let's dive into the code!

##  Defining The Basic Structure

*Note: Before diving into the code, I want to emphasize that I do not have a formally correct specification because I haven't run it against a formal test suite. I only have my own tests that I've run it against. Also, this was my first time writing anything significant in Rust, so excuse any poor code habits.*

*If you want to look at the full code, go [here](https://github.com/redixhumayun/raft)*

First, we define the basic structure for our node

```rust
struct RaftNodeState<T: Serialize + DeserializeOwned + Clone> {
    //  persistent state on all servers
    current_term: Term,
    voted_for: Option<ServerId>,
    log: Vec<LogEntry<T>>,

    //  volatile state on all servers
    commit_index: u64,
    last_applied: u64,
    status: RaftNodeStatus,

    //  volatile state for leaders
    next_index: Vec<u64>,
    match_index: Vec<u64>,

    //  election variables
    votes_received: HashMap<ServerId, bool>,
    election_timeout: Duration,
    last_heartbeat: Instant,
}

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
```

Each raft node has its own state that it needs to maintain. I've segregated this state based on whether its volatile, non-volatile (must be persisted) or is required only for a specific node state. The state is behind a mutex to allow access to it from multiple threads. Typically, you have a node listening for messages on a separate thread and invoking whatever RPC is required and you have the main thread of the node that is doing whatever operations it needs to do.

Now, nodes communicate with each other via JSON-over-TCP in my implementation. So, we need to set up the communication channel for them. I did this by defining an RPC manager which is then provided to each node. 

```rust
struct RPCManager<T: RaftTypeTrait> {
    server_id: ServerId,
    server_address: String,
    port: u64,
    to_node_sender: mpsc::Sender<RPCMessage<T>>,
    is_running: Arc<AtomicBool>,
}
```

The RPC manager has a few different methods defined on it - the constructor, a method to start, a method to stop and a function to allow a node to indicate to the manager that it wants to send a message to another node called `send_message`.

All messages between nodes are serialized to JSON using the [`serde` crate](https://crates.io/crates/serde) and then de-serialized back using the same crate. (*Note: This obviously isn't a practical implementation because typically you'd use your own protocol to avoid overhead*). 

Here's an implementation of what the `send_message` function looks like

```rust
/**
  * This method is called from the raft node to allow it to communicate with other nodes
  * via the RPC manager.
  */
  fn send_message(&self, to_address: String, message: MessageWrapper<T>) {
      info!(
          "Sending a message from server {} to server {} and the message is {:?}",
          message.from_node_id, message.to_node_id, message.message
      );
      let mut stream = match TcpStream::connect(to_address) {
          Ok(stream) => stream,
          Err(e) => {
              panic!(
                  "There was an error while connecting to the server {} {}",
                  message.to_node_id, e
              );
          }
      };

      let serialized_request = match serde_json::to_string(&message.message) {
          Ok(serialized_message) => serialized_message,
          Err(e) => {
              panic!("There was an error while serializing the message {}", e);
          }
      };

      if let Err(e) = stream.write_all(serialized_request.as_bytes()) {
          panic!("There was an error while sending the message {}", e);
      }
  }
```

Communication between the node and the RPC manager is handled via a MPSC channel in Rust. The receiver stays with the node and the transmitter is with the RPC manager.

Next, let's dive into the functionality of a Raft cluster. Rather than focusing on each individual RPC function, I'll go through RPC's from the perspective of leader election and appending entries to the cluster.

##  Log Entry

A quick aside before jumping into the RPC's themselves. We first need to discuss what a log entry itself looks like. Each log entry has the following strucutre. The most important fields here are `term` (explained below) and `index` (a 1-based index).

```rust

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
enum LogEntryCommand {
    Set = 0,
    Delete = 1,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
struct LogEntry<T: Clone> {
    term: Term,
    index: u64,
    command: LogEntryCommand,
    key: String,
    value: T,
}
```

##  Leader Election

This is a core part of the Raft protocol. This allows a leader to be elected in each term or epoch of a Raft cluster. A term is a time period during which one leader reigns. When a new node wants to be elected leader, it needs to increment the term and ask for a vote. I believe this is essentially a logical clock.

![](/assets/img/databases/raft/raft_terms.png)

There are 3 possible states every node can be in - a follower, a candidate or a leader. A candidate is just an intermediate state between a follower and a leader. Typically, nodes don't stay in this state for very long.

There is also the concept of 2 timeouts in Raft - the election timeout and the heartbeat timeout. When these timeouts occur, there are certain state transitions that must occur. The image below is a good representation of that.

*As an aside, if you're curious why timeouts are required, look the FLP section of [this page](https://dinhtta.github.io/flpcap/). The FLP impossibility theorem is based on a famous paper from 1985. There is a generalisation of this theorem called the [two generals problem](https://mwhittaker.github.io/blog/two_generals_and_time_machines/#:~:text=The%20Two%20Generals'%20Problem%20is%20the%20problem%20of%20designing%20an,an%20algorithm%20that%20achieves%20consensus.)*

![](/assets/img/databases/raft/state_transitions.png)

Next, we need something to represent what a node is supposed to do as time passes. We'll call this a `tick` function.

This `tick` function is something that the Raft cluster does every logical second. I say logical second because in a test cluster you typically want to control the passage of time to be able to create certain test scenarios. 

```rust
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

Here, if a node a is a candidate or a follower, it checks if the current election timeout has elapsed. If it has, it starts an election or restarts an election (if candidate).

If the node is a leader, however, it sends out something called a heartbeat. This is to ensure that the follower nodes don't believe the leader has died and try to start a new election.

Let's look at the RPC's associated with leader election

```
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
struct VoteRequest {
    request_id: u16,
    term: Term,
    candidate_id: ServerId,
    last_log_index: u64,
    last_log_term: Term,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
struct VoteResponse {
    request_id: u16,
    term: Term,
    vote_granted: bool,
    candidate_id: ServerId
}
```

For now, focus on the fields `term`, `last_log_index` and `last_log_term`. These are the fields that a node will use to determine whether its vote can be granted or not. The node that is starting an election will send out messages from itself to other nodes and will send the term and the index of its last log entry.

Imagine 2 nodes A and B where A is requesting a vote from B. If B has a higher term, this means that B is further ahead in the cluster's time period and therefore it cannot accept A as a leader.

Furthermore, if B has a log entry with an index or term greater than the one sent by A in the request, the vote is rejected. Here's the relevant part of the code

```
//  this node has already voted for someone else in this term and it is not the requesting node
        if state_guard.voted_for != None && state_guard.voted_for != Some(request.candidate_id) {
            debug!("EXIT: handle_vote_request on node {}. Not granting the vote because the node has already voted for someone else", self.id);
            return VoteResponse {
                request_id: request.request_id,
                term: state_guard.current_term,
                vote_granted: false,
                candidate_id: self.id,
            };
        }

        let last_log_term = state_guard.log.last().map_or(0, |entry| entry.term);
        let last_log_index = state_guard.log.last().map_or(0, |entry| entry.index);

        let log_check = request.last_log_term > last_log_term
            || (request.last_log_term == last_log_term && request.last_log_index >= last_log_index);

        if !log_check {
            return VoteResponse {
                request_id: request.request_id,
                term: state_guard.current_term,
                vote_granted: false,
                candidate_id: self.id,
            };
        }
```

