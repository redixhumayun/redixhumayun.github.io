---
layout: post
title: "Atomics And Concurrency"
category: systems
---

##  Introduction

I've been exploring the MariaDB source code as part of a hack week started by Phil Eaton. These are my findings.

I started with client code which can be found in `mysql.cc`. The first function to look at is `read_and_execute()` which seems to be a loop that reads input from the user and shows the user prompts etc.

This then calls `com_go()` function.