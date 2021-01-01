---
layout: post
title: "Noob Thoughts On The Future"
date:   2020-12-31 21:03:25 +0530
category: robotics
---

This is going to be a bit of a ramble and most of it is probably going to be absolute nonsense given how little I know of robotics, but here goes.

Midway through the coronavirus quarantine, I began playing around with the idea of doing something with a Raspberry Pi. The idea I had has led me down a rabbit hole of trying to understand how to interface the hardware side of things with software.

## A Rant

First, a rant. It frustrates me that we don't see more happening with hardware in the world. Economically, it's completely understandable. The marginal cost of producing an additional unit of hardware is so much higher than simply scaling up a server to handle a few thousand more requests, it makes sense that the entire world is still running behind creating and funding software products.

But there are only so many variations of a startup "unbundling" ${BIG_TECH_COMPANY}'s offering I can see before fatigue starts to set in.

To be fair, it isn't just the marginal cost of production an additional unit of hardware that might be stopping more people getting into robotics. The moment you try to create something physical, you are entering the world of mass manufacturing. Something that we did for decades before shunning and looking down upon in favor of software. It is strange that there is such a disdain for physical manufacturing and labour among the upper and middle class of the world today, given that regardless of how much software we create, we still live in a physical world.

This brings me to my biggest pain point with our obsession for software products today. Build every kind of software imagineable, build the greatest mobile app ever, build the smoothest scroll of all time, it still doesn't compare to *bringing software into the physical world*.

## What I Imagine

"Bringing software into the physical world". That's a weighty statement to me, so let me explain.

I want to approach this topic from the perspective of writing code. Writing code is essentially telling the computer what to do. Okay, if all we need is to tell the computer what to do, why do we have to sit down in in front of a screen and use our fingers to bang away at a keyboard? Well, because that's the interface we have available to us. We have a keyboard and we have a screen. When we type on the screen, the characters we're typing appear on the screen. This way we can check everything we've typed in. The limiting factor is the interface.

However, I hate sitting at a desk for long hours, it makes my back hurt. I would love to be able to continue "writing code" while walking around, for example. Sure, one way to do this might be to carry around a phone and type into that. However, there you are limited by the size of the screen and keyboard and the syntax of programming languages. 

If you look at the syntax of programming languages, it is filled with special characters like `[, <, @, #, {, }, ]` etc. This is not a good fit for our current keyboard layout. What are possible solutions to this? 

1. Design a programming language that can be easily typed out on a mobile keyboard. This seems like a reasonable solution and in fact, Amjad Masad, the founder of Repl.it has previously tweeted about doing just such a thing. (He deleted all his previous tweets, so I can't find the correct one but I'm sure you can find the tweet using the right search terms and a way back machine). This approach, however, involves overcoming decades worth of investment into programming languages that have made heavy use of special characters. This move would involve breaking away from all of that and starting from a lower level. Still, not impossible.

2. Have a generator that can be used to "write code". The reason I keep quoting write code is because I don't necessarily think of writing code as writing an if construct for example. To me, writing code is writing a spec. It should simply involve an understanding of what the software needs to do and explaining that in as much granularity as possible. Let's take an example of this:

Say, we want to write a piece of software that can take an input of two numbers and return the result of the two numbers. This is dead simple, obviously. However, all I want to provide for the spec is the line above. Well, [Gwern's blog post about GPT-3](https://www.gwern.net/GPT-3#) gpes into detail about something similar. You can also look at [this tweet](https://twitter.com/sharifshameem/status/1284095222939451393) to see his experiments trying to recreate exactly what we're talking about. Maybe the ML models aren't quite there yet, but it does get more promising everyday.

So, if we have a model that can convert our text into a functioning code, all that is left for us to be able to walk around and "write code" is to have a decent speech to text converter, which seems to be much further along than the ML models to write functioning code. With this we have a pipeline of being able to do exactly what we set out to do. We have a speech to text converter than can set out in text what we say. The output of this converter will be fed to an ML model like GPT-3 which can convert our text specification into functioning code.

![Speech To Code Pipeline](/assets/img/speech_to_code.jpg)

With this sort of innovation, we remove an "interface barrier". We no longer need to know how to write code. Instead, all we need to be able to do is to organize our thoughts clearly into a specific format, which is the real skill of an engineer anyway.

## Interface Barrier

This is another topic I want to touch on. I like to think of this as all the layers that are between you and what you want.

For instance, let's say you want to play a team sport, like football (not the american version). So, you need a ball, at least 11 players on each side and a wide open field. The interface for this game is your entire body. You run, you move and you kick with varying degrees of power.

Now, as a poor substitute for playing football, you have FIFA on the PS4 instead. It truly is a poor substitute because the interface for this version of the game is a joystick you hold in your hands. It involves you sitting in a hunched over posture where the only part of your body moving are your fingers.

Now, how do we get rid of the interface barriers between FIFA and football? Let's start with basic movement, which we should hopefully be able to replicate with [omni directional treadmills](https://fulldivegamer.com/hardware/vr-omnidirectional-treadmill-roundup/). So, now we have the ability to move around with the same freedom we'd expect on a football pitch. Next, we need to replicate the visual feel of seeing your team mates and the opposition team around you, which we should be able to do with a VR headset.

The unsolved part of this problem, to me atleast, is the feedback from the ball. How do you recreate the feel of kicking a ball, of feeling it's weight on your foot which gives you enough feedback to decide how much power to put into your kicks. A potential solution to this could maybe be electrical impulses (although, that sounds unsafe as hell).

I think I've made my point with regards to interface barriers, though.

## VR Is A False God

I don't get the hype surrounding virtual reality when contrasted with the lack of hype surrounding augmented reality. To me, AR seems like the much more integratable(?) solution which fits with the way our bodies are designed.

Of course I want a system which encourages me to move around, which incentivizes me to use my body. The computer interface should be designed for *my* body, not the other way around. Technology is supposed to be a slave, not a master.

AR brings technology into the real world, VR transports us out of the real world into another one.

## Building For The Real World

How do we build for the real world? I'll give you a simple example of what I was trying to create with a Raspberry Pi. I frequently record my workouts, either to check form or to send to a trainer to have my form critiqued.

A major frustration with this is that I need to set the camera up, make sure the angle & lighting are correct and finally walk over to the phone and hit the record button. Oh, and you also have to use the front camera, which has a much lower resolution, if you want to make sure that you're visible in front of the camera.

Imagine a Raspberry Pi set up on wheels with a camera attached to the top of it, which will constantly follow you around everywhere you go. Once given a command like, "Front" or "Side" it will give move around your body and pan/tilt the camera to ensure that it gets either a front view or a side view of you. Then you say "Record" and it starts recording.

Now, let's take it one step further and try to build a platform upon which 3rd party developers can use the hardware to program additional commands in. For instance, a developer could set up a voice command "Rotate", which will cause this robot to drive in a circle around you and keep the camera on you at all times, recording a 360 degree view.

This opens up a whole new ecosystem very similar to what Apple did with their App Store for the iPhone. Something like this might probably exist but the very fact that you have to search for it means that there is still major room for improvement & innovation here.

## Conclusion

I think there's a lot of work to be done in the field of hardware integration with Augmented Reality and consumer robotics. I'm pretty excited to see what comes out of it.