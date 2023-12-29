---
layout: post
title: "Parallel Merge Sort"
catagory: systems
---

## Introduction

I've been trying to learn Rust and C++ side by side as a way to dive deeper into systems programming. Specifically, I'm trying to understand more about their concurrency and parallelism models.

As a way of doing this I'm trying to implement a bunch of algorithms that are "embarrassingly parallel". That is, algorithms that are inherently parallelizable because they use a divide and conquer methodology.

For a full list of these kinds of algorithms, look [here](https://www.cs.cmu.edu/~scandal/nesl/algorithms.html) at the CMU library.

## Merge Sort

For this, I decided to implement the easiest one - merge sort. 

Merge sort is inherently easy to parallelize because it involves dividing the task of merging an array into a set of smaller contiguous subarrays and we do this recursively, before combining the array in a separate step.

This is a standard algorithm so I'm not going to spend too much time on it.

Here's the Rust & C++ code for the implementation

```rust
fn merge_sort(arr: &mut [i32]) {
    let mid = arr.len() / 2;
    if mid == 0 {
        return;
    }

    merge_sort(&mut arr[0..mid]);
    merge_sort(&mut arr[mid..]);

    let mut res = arr.to_vec();
    merge(&arr[0..mid], &arr[mid..], &mut res[..]);
    arr.copy_from_slice(&res[..]);
}

fn merge(left: &[i32], right: &[i32], ret: &mut [i32]) {
    let mut left_index = 0;
    let mut right_index = 0;
    let mut ret_index = 0;
    while left_index < left.len() && right_index < right.len() {
        if left[left_index] <= right[right_index] {
            ret[ret_index] = left[left_index];
            left_index += 1;
        } else {
            ret[ret_index] = right[right_index];
            right_index += 1;
        }
        ret_index += 1;
    }

    if left_index < left.len() {
        ret[ret_index..].copy_from_slice(&left[left_index..]);
    } else if right_index < right.len() {
        ret[ret_index..].copy_from_slice(&right[right_index..]);
    }
}
```

```cpp
void merge(vector<int>& left, vector<int>& right, vector<int>& ret) {
  int left_index = 0;
  int right_index = 0;
  int ret_index = 0;

  while (left_index < left.size() && right_index < right.size()) {
    if (left[left_index] <= right[right_index]) {
      ret[ret_index] = left[left_index];
      left_index++;
    } else {
      ret[ret_index] = right[right_index];
      right_index++;
    }
    ret_index++;
  }

  while (left_index < left.size()) {
    ret[ret_index] = left[left_index];
    left_index++;
    ret_index++;
  }

  while (right_index < right.size()) {
    ret[ret_index] = right[right_index];
    right_index++;
    ret_index++;
  }
}

void merge_sort(std::vector<int>& arr) {
  int mid = arr.size() / 2;
  if (mid == 0) {
    return;
    ;
  }

  vector<int> left(arr.begin(), arr.begin() + mid);
  vector<int> right(arr.begin() + mid, arr.end());

  merge_sort(left);
  merge_sort(right);

  vector<int> ret(arr.size());

  merge(left, right, ret);

  arr = std::move(ret);
}
```

##  Merge Sort Parallel

Of all the parallel algorithms to implement, this is typically the easiest because the only thing you can parallelize here is the division of the arrays at the mid point.

For each division on the left hand side, I fire off a new thread and expect that to give me back the sorted left hand side. The merge function cannot be parallelized because that doesn't operate on data that is independent of threads.

The implementation in Rust and then C++

```rust
fn merge_sort_parallel(arr: &mut [i32]) {
    let mid = arr.len() / 2;
    if mid == 0 {
        return;
    }

    if arr.len() < THRESHOLD.try_into().unwrap() {
        merge_sort(arr);
        return;
    }

    let (left, right) = arr.split_at_mut(mid);

    let mut left_clone = left.to_vec();
    let mut right_clone = right.to_vec();

    let left_handle = thread::spawn(move || {
        merge_sort_parallel(&mut left_clone);
        return left_clone;
    });

    merge_sort_parallel(&mut right_clone);

    let left_sorted = left_handle.join().unwrap();

    let mut res = arr.to_vec();
    merge(&left_sorted, &right_clone, &mut res[..]);
    arr.copy_from_slice(&res[..]);
}
```

```cpp
void merge_sort_parallel(vector<int>& arr) {
  int mid = arr.size() / 2;
  if (mid == 0) {
    return;
  }

  if (arr.size() < THRESHOLD) {
    merge_sort(arr);
    return;
  }

  vector<int> left(arr.begin(), arr.begin() + mid);
  vector<int> right(arr.begin() + mid, arr.end());

  std::thread left_thread([&left]() { merge_sort_parallel(left); });
  merge_sort_parallel(right);
  left_thread.join();

  vector<int> ret(arr.size());

  merge(left, right, ret);
  arr = std::move(ret);
}
```

The benchmarks for each are below

```
Rust
Time elapsed for sequential sorting is: 8.233871417s
Time elapsed for concurrent sorting is: 2.890036125s

C++
Time elapsed for sequential sorting: 1.17858 seconds
Time elapsed for concurrent sorting: 0.444358 seconds
```

Both C++ and Rust were compiled for release. Nothing strange about the fact that there is a significant difference between the two runs, especially given that my tests were running for 100,000,000 elements in the array. 

You can find the full repo [here](https://github.com/redixhumayun/concurrency)