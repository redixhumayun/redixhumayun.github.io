---
layout: post
title: "Make Use Of Reduce"
date: 2019-03-02 1:29:25 +0530
category: functional
---

## Why Reduce At All?

Let's start with the most important question, the why? Why use reduce at all? Simple, it allows transformations from one data type to another. What do I mean by this? 

Here's the standard example everyone uses for reduce all the time

{% highlight javascript %}
[1, 2, 3, 4, 5].reduce((acc, curr) => acc + curr)
// result is 15
{% endhighlight %}

Let's think about this for a second. We had an array of integers and upon reducing it, we ended up with a single integer. We went from an array to an integer, two different data types. 

{% highlight typescript %}
Array<int> -> <int>
{% endhighlight %}

Let's try to expand on the example above. What if we had an array of objects, where each object has a number property on it. The goal is to sum up the value of all the different objects using the number property

{% highlight javascript %}
const arr = [{ number: 1 }, { number: 2 }, { number: 3 }, { number: 4 }, { number: 5 }]
arr.reduce((acc, curr) => {
  return acc + curr.number
}, 0)
{% endhighlight %}

{% highlight typescript %}
Array<object> -> <int>
{% endhighlight %}

Before we proceed any further, let's think about a more procedural way of doing the first example.

{% highlight javascript %}
const arr = [1,2,3,4,5]
let total = 0
for(let i = 0; i < arr.length; i++) {
  total += arr[i]
}
//  total = 15
{% endhighlight %}

The example above works absolutely fine. However, we've had to introduce a new variable called total. This may not be a big deal on a small example, however it makes it easier to avoid bugs when you avoid intermediate variables. 

For instance, if you initialize a variable to null, you also need to include checks for that further down in your codebase. 

## More Uses Of Reduce

Typically, people only see the example for reduce where numbers are summed up. Truth is, there's a lot more reduce can do.

### Converting Object To Array

This is probably one of my favorite uses of reduce. 
{% highlight TypeScript %}
 Object -> Array<T>
{% endhighlight %}

Let's say we have the following object and we want to the subsequent array:

{% highlight javascript %}
let obj = {
  a: { key: 'val' },
  b: { key: 'val' },
  c: { key: 'val' }
}

let arr = [{ key: 'val' }, { key: 'val' }, { key: 'val' }]
{% endhighlight %}

Essentially, we don't care about the keys of the object and we want an array because they are slightly easier to deal with.
This just follows from the prior example.

{% highlight javascript %}
const result = Object.entries(obj).reduce((acc, [key, value]) => {
  acc.push(value)
  return acc
}, [])

//  result = [{ key: 'val' }, { key: 'val' }, { key: 'val' }]
{% endhighlight %}

The trick here is to recognize that you can specify the new data structure that reduce should return. In the case of the example above, it was an array we wanted. 

You could similarly do the reverse and convert the array to an object. The following follows from the previous code sample.

{% highlight javascript %}
const result = arr.reduce((acc, curr, index) => {
  acc[index] = curr
  return acc
}, {})
{% endhighlight %}

The downside is that we have lost some data from the original object, namely the key. However, you could easily maintain that within the object itself when pushing it onto the array.

### Reducing To A Boolean

Let's say we have two data structures: an object and a single variable. The goal is to check whether the value of the variable matches any of the values listed within the object

If it matches any of the values, we want to return true. If it doesn't, we want to return false

{% highlight javascript %}
let obj = { a: 1, b: 2, c: 3, d: 4, e: 5 }
let value = 3

return Object.entries(obj).reduce((acc, [key, val]) => {
  return acc || (val === value)
}, false)
{% endhighlight %}

The trick here is in the line using the OR logical operator. The seed value we gave the reducer was a boolean value of false. This means that the acc value will stay false until the second half of the logical operator statement evaluates to true. 

Once the second half evaluates to true, the acc will always stay true. Once this happens, it can never change back to false, since 

{% highlight javascript %}
 (true || false) will always return true
{% endhighlight %}

## Conclusion

The seed value is the secret to reduce. Remember that since JavaScript is a dynamically typed language, you have the freedom to transform between data structures at will. The data structure you want to transform to is indicated by the seed value you provide to your reducer. 

If the seed value is an object, you are trying to transform to an object

If the see value is an array, you are trying to transform to an array

If the seed value is a number, you are trying to transform to a number