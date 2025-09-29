## Relevant Dimensions To Compare Optimizer Models

- How do OLTP vs OLAP differ in terms of optimizers? Which do they prefer? Why?
- Runtime cost. What is the tradeoff?
- What is the cost of stale statistics for each? Is there more of a performance hit on CBO? [Perhaps relevant](https://medium.com/nazar-io/sql-performance-killers-stale-statistics-f735411facc8)
- Do SQL vs NoSQL systems differ in how they do optimization?
- What about cloud-native vs traditional databases? What about shared-storage vs shared-nothing databases?


## Systems To Analyze

### OLTP
- SQLite
- PostgreSQL

### OLAP
- DuckDB
- Clickhouse

| Database | Primary Approach | Target Workload |
|----------|------------------|-----------------|
| ClickHouse | Heuristic → CBO | OLAP |
| DuckDB | Hybrid Rules+Cost | OLAP |
| PostgreSQL | Cost-Based + GEQO | OLTP |
| SQLite | Cost-Based | OLTP |


## Links

### General

1. [Query Optimization on Wikipedia](https://en.wikipedia.org/wiki/Query_optimization)
1. [An Overview Of Query Optimization In Relational Systems Paper](https://web.stanford.edu/class/cs345d-01/rl/chaudhuri98.pdf)
1. [What Sets Cost Based Vs Heuristic Optimizers Apart](https://celerdata.com/glossary/cost-based-optimizer-vs-rule-based-optimizer)
1. [Simple Introduction To Cost Based vs Heuristic Optimizers](https://dzone.com/articles/optimizing-database-queries-exploring-the-heuristi)
1. [Understanding Cost-Based Optimizer: How It Works and Why It Matters](https://celerdata.com/glossary/cost-based-optimizer)

### Specific Systems

1. [Exploring Yugabyte's Cost Based Query Optimizer](https://www.yugabyte.com/blog/yugabytedb-cost-based-optimizer/)
1. [Couchbase's Cost-Based Optimizer](https://docs.couchbase.com/cloud/n1ql/n1ql-language-reference/cost-based-optimizer.html)
1. [Adaptive Query Optimization Spark SQL](https://www.databricks.com/blog/2020/05/29/adaptive-query-execution-speeding-up-spark-sql-at-runtime.html)
1. [Oracle Cost Based Optimizer](https://docs.oracle.com/cd/E98457_01/opera_5_6_core_help/cost_based_optimizer.htm)
1. [Query Optimization In YandexDB](https://ydb.tech/docs/en/concepts/optimizer)

#### ClickHouse

1. [ClickHouse Query Execution](https://clickhouse.com/docs/guides/developer/understanding-query-execution-with-the-analyzer#analyzer)
1. [Clickhouse - Lightning Fast Analytics For Everyone](https://www.vldb.org/pvldb/vol17/p3731-schulze.pdf)
1. [Why ClickHouse Needs CBO](http://jackywoo.cn/why-we-need-cbo-optimizer-en/)

#### SQLite

1. [SQLite Optimizer](https://www.sqlite.org/optoverview.html)
1. [SQLite Next Generation Query Planner](https://www.sqlite.org/queryplanner-ng.html)

#### PostgreSQL

1. [PostgreSQL Planner/Optimizer](https://www.postgresql.org/docs/current/planner-optimizer.html)
1. [PostgreSQL Query Planning](https://www.postgresql.org/docs/current/runtime-config-query.html)

#### DuckDB

1. [DuckDB Internals](https://duckdb.org/docs/stable/internals/overview.html)
1. [Optimizers](https://duckdb.org/2024/11/14/optimizers.html)
1. [Push Based Execution In DuckDB (Video)](https://www.youtube.com/watch?v=1kDrPgRUuEI)
1. [DuckDB Internals CMU Talk (Video)](https://www.youtube.com/watch?v=bZOvAKGkzpQ)
1. [Morsel Drive Parallelism For NUMA Aware Architectures](https://db.in.tum.de/~leis/papers/morsels.pdf)
1. [Dynamic Programming Strikes Back (Join Ordering Algorithm For DuckDB)](https://15721.courses.cs.cmu.edu/spring2020/papers/20-optimizer2/p539-moerkotte.pdf)