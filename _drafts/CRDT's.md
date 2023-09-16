---
layout: post
title: "CRDT's"
category: databases
---

## An Overview

CRDT's stand for Conflict-free Replicated Data Types. They are a class of data structures that can be replicated across multiple nodes in a network and can be updated independently and concurrently without coordination between the replicas, and yet converge to a consistent state across the replicas. They are used in distributed systems to achieve eventual consistency.

## Types of CRDT's

There are broadly two types of CRDT's:

1. State-based (convergent) CRDT's:

   Each replica maintains a copy of the entire state of the data structure. Updates are propagated to other replicas by sending the entire state. The replicas then merge the received state with their own state to get the new state. The merge operation is commutative, associative and idempotent.

2. Operation-based (commutative) CRDT's:

   Each replica maintains a log of operations. Updates are propagated to other replicas by sending the operations. The replicas then apply the operations in the same order to get the new state.

## Example Application

Let's run through a sample application, like Google Docs. Imagine a document that is initially represented by the state "hat". The way this is stored on two separate nodes is as `[(h, A1), (a, A2), (t, A3)]`. A1, A2 and A3 are identifiers for each of the characters.

### Character Addition

Now, imagine there are two users - Alice and Bob where their writes are going to two separate nodes.

Alice inserts the character "c" at the beginning, result in `[(c, A4), (h, A1), (a, A2), (t, A3)]`. Bob inserts the character "s" at the end, resulting in `[(h, A1), (a, A2), (t, A3), (s, B1)]`.

Node A broadcasts its operations to node B where a merge occurs. The result of the merge on node B would be `[(c, A4), (h, A1), (a, A2), (t, A3), (s, B1)]`. Similarly, node B broadcasts its operations to node A where a merge occurs. The result of the merge on node A would be `[(c, A4), (h, A1), (a, A2), (t, A3), (s, B1)]`.

### Character Removal

Now, this was fairly simple because the only operations here were additions to a list. Instead, if Alice's operation stayed the same but Bob's operation was to remove the character h resulting in `[(a, A2), (t, A3)]`, how then would the merge occur?

How do you merge `[(c, A4), (h, A1), (a, A2), (t, A3)]` and `[(a, A2), (t, A3)]` to result in the word "cat"? Because if you just did the merge as is, it would result in the word "chat" again.

This is where operation based CRDT's are more useful. Instead of broadcasting the actual state itself, node A would broadcast that the word "c" needs to be inserted before the index A1. And node B would broadcast that the word "h" needs to be removed from the position A1.

Now, an interesting question here is if the h at position A1 is removed, and then the c comes in to node B saying that it wants to be inserted before the character at position A1, how would that work? Because node B removed the h at A1, there is nothing there anymore.

When an h is removed from node B at position A1, it means that the value is simply tombstoned and the identiifer A1 is immutable, which is to say that it won't be reused again. So, when the broadcast comes in from node A asking for "c" to be inserted before the character at position A1, it still has meaning.

### Character Replacement And Tie Breakers

Now, what happens when the word is `[(h, A1), (a, A2), (t, A3)]` and node A receives a write operation to replace the "h" with a "c" and node B receives a write operation to replace the "h" with a "b"

`Node A -> [(c, A4), (a, A2), (t, A3)]`

`Node B -> [(b, B1), (a, A2), (t, A3)]`

When node A broadcasts it's write operation to node B, node B will receive the update saying that the tuple `(c, A4)` should be placed before the tuple `(a, A2)`. Node B will notice that it already has another character at that spot and will perform a tie-breaker to see which write wins.

The tie-breaker rules can vary between implementations, but we can keep it really simple and say that all writes from node A will win a tie breaker and `A4` > `B1`, therefore the word will now be "cat".

## The Indexes

Each character is accompanied by an index, called either `A1`, `A2` or `B1` etc. What this represents is a combination of the node on which the write operation occurred and the logical timetamp accompanying the write.

The document's initial state was `[(h, A1), (a, A2), (t, A3)]`. Each write operation came into node A in the order of the letters in the word. With each write operation on node a, the logical timestamp was updated.

When a new write operation comes into node B, it would be marked with the position `B1`, indicating this is the first write operation on node B.

Now, along with the node and the logical timestamp, there might even be a fractional index which is used to determine the position of a character. I'm not sure exactly how fractional indexes work with CRDT's yet, but you can read more about them [here](https://madebyevan.com/algos/crdt-fractional-indexing/).

_Note: Incidentally, the blog post above is from Evan Wallace, the cofounder of Figma_
