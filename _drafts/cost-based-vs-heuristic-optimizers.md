## Rough Outline

- Start off with explaining the spectrum from heuristic to cost based optimization. Add a small note on rule based optimizers(Oracle RBO, deprecated in 2003 for Oracle 10g).
- Explain difference in no cost vs fixed cost vs dynamic cost optimizers.
- Mention list of cost factors typically used in dynamic cost optimizers.
- Track history of some engines over when they moved from heuristic to dynamic cost optimizers.
- Explore knobs exposed by different engines for tuning the planner.
- Explore different cost factors used by different engines in their dynamic cost optimizers.

 There isn't a clear line of demarcation between a heuristic vs cost based optimizer. This is more of a spectrum.

 ```text
 Question: How does the optimizer choose between alternatives?

                    Uses transformation rules?
                           │
                    ┌──────┴──────┐
                   Yes           (N/A - everyone uses rules)
                    │
            Considers costs?
                    │
         ┌──────────┴──────────┐
        No                    Yes
         │                     │
    Heuristic           Cost calculated how?
    (pure rules)              │
         │            ┌────────┴────────┐
    Pick by:         Fixed            Dynamic
    - First match   values          from stats
    - Fixed order      │                │
    Eg: Oracle     Heuristic         Cost-Based
      RBO          w/ costs          Optimizer
                  (hybrid)          (System-R,
                  Eg: SQLite        Starburst,
                                     Volcano)
                                    Eg: Modern, Postgres, MySQL etc.
```                                     

## Relevant Dimensions To Compare Optimizer Models

- Query complexity analysis. Are there specific types of queries that do better with a specific kind of optimizer? Do these tend to be OLTP or OLAP queries?
- Runtime cost. What is the tradeoff?
- Do relational vs non-relational data models perform better with a specific kind of optimizer?
- Shared-node (single server) vs Shared-disk (multiple servers, one storage) vs Shared-nothing (distributed)
  - shared-node - SQLite, PostgreSQL
  - shared-disk - ClickHouse
  - shared-nothing - need examples
- What is the cost of stale statistics for each? Is there more of a performance hit on CBO? [Perhaps relevant](https://medium.com/nazar-io/sql-performance-killers-stale-statistics-f735411facc8)

## Hardware Impact

- Hardware changes the cost model 

  For example, the following quote from [PostgreSQL docs](https://www.postgresql.org/docs/current/runtime-config-query.html#GUC-RANDOM-PAGE-COST)
  "e.g., solid-state drives, might also be better modeled with a lower value for random_page_cost, e.g., 1.1."

  The following quote from an [SO answer](https://stackoverflow.com/questions/66820661/index-scan-vs-sequential-scan-in-postgres)
  "You can tune random_page_cost to influence the point where a sequential scan is chosen. If you have SSD storage, you should set the parameter to 1.0 or 1.1 to tell PostgreSQL that index scans are cheaper on your hardware."

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
| PostgreSQL | Cost-Based | OLTP |
| SQLite | Cost-Based | OLTP |

## General Questions

- Are there any systems used in production which implement a purely heuristic optimizer with fixed cost strategies?

## Links

### General

1. [Query Optimization on Wikipedia](https://en.wikipedia.org/wiki/Query_optimization)
1. [An Overview Of Query Optimization In Relational Systems Paper](https://web.stanford.edu/class/cs345d-01/rl/chaudhuri98.pdf)
1. [What Sets Cost Based Vs Heuristic Optimizers Apart](https://celerdata.com/glossary/cost-based-optimizer-vs-rule-based-optimizer)
1. [Simple Introduction To Cost Based vs Heuristic Optimizers](https://dzone.com/articles/optimizing-database-queries-exploring-the-heuristi)
1. [Understanding Cost-Based Optimizer: How It Works and Why It Matters](https://celerdata.com/glossary/cost-based-optimizer)
1. [A Practical Guide To Rule Based Optimizer](https://celerdata.com/glossary/rule-based-optimizer) [Outlines the cost of heuristic vs CBO's]

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
1. [Dynamic Programming Strikes Back (Join Ordering Algorithm For DuckDB)](https://15721.courses.cs.cmu.edu/spring2020/papers/20-optimizer2/p539-moerkotte.pdf))