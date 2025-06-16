---
layout: post
title: "Testing Prism.js Syntax Highlighting"
category: test
---

This post tests the new Prism.js syntax highlighting across multiple languages relevant to the blog.

## Rust Code

```rust
use std::collections::HashMap;

#[derive(Debug)]
struct Database {
    tables: HashMap<String, Vec<Row>>,
}

impl Database {
    fn new() -> Self {
        Database {
            tables: HashMap::new(),
        }
    }
    
    fn create_table(&mut self, name: String) -> Result<(), String> {
        if self.tables.contains_key(&name) {
            Err(format!("Table {} already exists", name))
        } else {
            self.tables.insert(name, Vec::new());
            Ok(())
        }
    }
}

fn main() {
    let mut db = Database::new();
    match db.create_table("users".to_string()) {
        Ok(_) => println!("Table created successfully"),
        Err(e) => eprintln!("Error: {}", e),
    }
}
```

## C++ Code

```cpp
#include <memory>
#include <vector>
#include <iostream>

class BTreeNode {
private:
    std::vector<int> keys;
    std::vector<std::unique_ptr<BTreeNode>> children;
    bool is_leaf;
    int degree;

public:
    BTreeNode(int degree, bool is_leaf) 
        : degree(degree), is_leaf(is_leaf) {
        keys.reserve(2 * degree - 1);
        if (!is_leaf) {
            children.reserve(2 * degree);
        }
    }
    
    void insert_non_full(int key) {
        int i = keys.size() - 1;
        
        if (is_leaf) {
            keys.push_back(0);
            while (i >= 0 && keys[i] > key) {
                keys[i + 1] = keys[i];
                i--;
            }
            keys[i + 1] = key;
        }
    }
};

int main() {
    auto root = std::make_unique<BTreeNode>(3, true);
    std::cout << "B-Tree node created with degree 3\n";
    return 0;
}
```

## JavaScript Code

```javascript
class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
    }
    
    get(key) {
        if (this.cache.has(key)) {
            const value = this.cache.get(key);
            // Move to end (most recent)
            this.cache.delete(key);
            this.cache.set(key, value);
            return value;
        }
        return -1;
    }
    
    put(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.capacity) {
            // Remove least recently used
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
}

// Usage
const lru = new LRUCache(3);
lru.put(1, 'one');
lru.put(2, 'two');
console.log(lru.get(1)); // 'one'
```

## Python Code

```python
import asyncio
from typing import Dict, Any, Optional

class AsyncDatabase:
    def __init__(self):
        self.data: Dict[str, Any] = {}
        self.locks: Dict[str, asyncio.Lock] = {}
    
    async def get_lock(self, key: str) -> asyncio.Lock:
        if key not in self.locks:
            self.locks[key] = asyncio.Lock()
        return self.locks[key]
    
    async def set(self, key: str, value: Any) -> None:
        lock = await self.get_lock(key)
        async with lock:
            # Simulate async operation
            await asyncio.sleep(0.01)
            self.data[key] = value
    
    async def get(self, key: str) -> Optional[Any]:
        lock = await self.get_lock(key)
        async with lock:
            await asyncio.sleep(0.01)
            return self.data.get(key)

async def main():
    db = AsyncDatabase()
    await db.set("user:1", {"name": "Alice", "age": 30})
    user = await db.get("user:1")
    print(f"Retrieved user: {user}")

if __name__ == "__main__":
    asyncio.run(main())
```

## SQL Code

```sql
-- Create table with proper indexing for performance
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE
);

-- Create index for common query patterns
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Complex query with window functions
WITH user_activity AS (
    SELECT 
        u.id,
        u.username,
        u.last_login,
        LAG(u.last_login) OVER (
            PARTITION BY u.id 
            ORDER BY u.last_login
        ) as previous_login,
        COUNT(*) OVER (
            PARTITION BY DATE(u.last_login)
        ) as daily_logins
    FROM users u
    WHERE u.last_login >= NOW() - INTERVAL '30 days'
)
SELECT 
    username,
    last_login,
    previous_login,
    daily_logins,
    EXTRACT(EPOCH FROM (last_login - previous_login))/3600 as hours_between_logins
FROM user_activity
WHERE previous_login IS NOT NULL
ORDER BY last_login DESC;
```

## Bash Script

```bash
#!/bin/bash

# Database backup script with error handling
set -euo pipefail

DB_NAME="${1:-myapp_production}"
BACKUP_DIR="/var/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a /var/log/db_backup.log
}

# Function to cleanup on exit
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        log "ERROR: Backup failed with exit code $exit_code"
        # Clean up partial backup file
        [[ -f "$BACKUP_FILE" ]] && rm "$BACKUP_FILE"
    fi
    exit $exit_code
}

trap cleanup EXIT

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

log "Starting backup of database: $DB_NAME"

# Perform the backup
pg_dump "$DB_NAME" | gzip > "$BACKUP_FILE"

# Verify backup file
if [[ -s "$BACKUP_FILE" ]]; then
    log "Backup completed successfully: $BACKUP_FILE"
    log "Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"
else
    log "ERROR: Backup file is empty or missing"
    exit 1
fi

# Cleanup old backups (keep last 7 days)
find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +7 -delete

log "Backup process completed"
```

## YAML Configuration

```yaml
# Kubernetes deployment for database application
apiVersion: apps/v1
kind: Deployment
metadata:
  name: database-app
  labels:
    app: database-app
    version: v1.0.0
spec:
  replicas: 3
  selector:
    matchLabels:
      app: database-app
  template:
    metadata:
      labels:
        app: database-app
    spec:
      containers:
      - name: app
        image: myregistry/database-app:1.0.0
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
        - name: RUST_LOG
          value: "info"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: database-app-service
spec:
  selector:
    app: database-app
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: ClusterIP
```

This test demonstrates syntax highlighting across all the major languages used in the technical blog content.