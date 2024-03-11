##  General Outline

- Basic introduction to what an LSM tree is (include note indicating that prior knowledge is assumed). 

- Introduce the concepts of read amplification, write amplification and space amplification.

  - Bring up Brian O'Neil's point about how to think about write amplification - essentially that if a block size is 4096 bytes (4k as is typical) and an entry size is 10 bytes, then the write amplification is (4096/10). This means that as the entry size increases, the write amplification decreases (which is a good thing, as you typically want lower write amplification). So, if you were to make a write to B-tree with an entry size of 10 bytes and no cache or WAL, the write amplification would be 400x.

  - The write amplification of LSM trees and B-trees have a crossover point as the size of the entry size increases. Beyond the cross over point, write amplification in LSM trees isn't necessarily (strictly?) better. (Use this link and screenshots to back up this point -> https://github.com/cojen/Tupl/wiki/RocksDB-vs-Tupl-on-Optane)

  - Talk about Miller's point regarding thinking about writing 100 sequential values to an LSM-tree and a B-tree versus just thinking of writing a single value to understand write amp better. B-tree will do splits and merges up front on each insert or update. LSM-trees will keep appending to memtable via WAL and then eventually sort before storing as SST on disk. Eventually, multiple SST files are sorted and merged. The hope is that with coalescing, there is eventually less write amp.

  - Talk about write stalls in LSM trees and why they occur. Explain why they don't occur in B-trees because there is no deferred work. All work is performed up front.
