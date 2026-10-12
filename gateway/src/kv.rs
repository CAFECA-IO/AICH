//! Small key-value abstraction over Redis (multi-instance) or process memory (single node / dev).
//! Used for rate-limit windows, abuse counters and the response cache.

use std::sync::Arc;
use std::time::{Duration, Instant};

use dashmap::DashMap;
use redis::aio::ConnectionManager;
use redis::AsyncCommands;

#[derive(Clone)]
pub struct Kv {
    memory: Arc<MemoryKv>,
    redis: Option<ConnectionManager>,
}

#[derive(Default)]
pub struct MemoryKv {
    counters: DashMap<String, (Instant, u64)>,
    values: DashMap<String, (Instant, String)>,
}

impl MemoryKv {
    fn incr(&self, key: &str, by: u64, ttl: Duration) -> u64 {
        let now = Instant::now();
        let mut e = self
            .counters
            .entry(key.to_string())
            .or_insert((now + ttl, 0));
        if e.0 <= now {
            *e = (now + ttl, 0);
        }
        e.1 += by;
        let v = e.1;
        drop(e);
        if self.counters.len() > 100_000 {
            self.counters.retain(|_, (exp, _)| *exp > now);
        }
        v
    }

    fn get(&self, key: &str) -> Option<String> {
        let e = self.values.get(key)?;
        if e.0 > Instant::now() {
            Some(e.1.clone())
        } else {
            drop(e);
            self.values.remove(key);
            None
        }
    }

    fn set_ex(&self, key: &str, value: &str, ttl: Duration) {
        let now = Instant::now();
        if self.values.len() > 10_000 {
            self.values.retain(|_, (exp, _)| *exp > now);
        }
        self.values
            .insert(key.to_string(), (now + ttl, value.to_string()));
    }
}

impl Kv {
    pub fn memory() -> Self {
        Kv {
            memory: Arc::new(MemoryKv::default()),
            redis: None,
        }
    }

    pub async fn redis(url: &str) -> anyhow::Result<Self> {
        let client = redis::Client::open(url)?;
        let mgr = ConnectionManager::new(client).await?;
        Ok(Kv {
            memory: Arc::new(MemoryKv::default()),
            redis: Some(mgr),
        })
    }

    pub fn backend(&self) -> &'static str {
        if self.redis.is_some() {
            "redis"
        } else {
            "memory"
        }
    }

    /// Increment a counter that expires `ttl` after its creation; returns the new value.
    /// If Redis errors, falls back to a per-process counter so limits never silently switch off.
    pub async fn incr(&self, key: &str, by: u64, ttl: Duration) -> u64 {
        if let Some(conn) = &self.redis {
            let mut c = conn.clone();
            let res: redis::RedisResult<u64> = c.incr(key, by).await;
            match res {
                Ok(v) => {
                    if v == by {
                        let _: redis::RedisResult<bool> =
                            c.expire(key, ttl.as_secs().max(1) as i64).await;
                    }
                    return v;
                }
                Err(e) => tracing::warn!(error = %e, "redis incr failed; using in-memory counter"),
            }
        }
        self.memory.incr(key, by, ttl)
    }

    pub async fn get(&self, key: &str) -> Option<String> {
        if let Some(conn) = &self.redis {
            let mut c = conn.clone();
            if let Ok(v) = c.get::<_, Option<String>>(key).await {
                return v;
            }
        }
        self.memory.get(key)
    }

    pub async fn set_ex(&self, key: &str, value: &str, ttl: Duration) {
        if let Some(conn) = &self.redis {
            let mut c = conn.clone();
            let r: redis::RedisResult<()> = c.set_ex(key, value, ttl.as_secs().max(1)).await;
            if r.is_ok() {
                return;
            }
        }
        self.memory.set_ex(key, value, ttl);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn memory_counter_and_values() {
        let kv = Kv::memory();
        assert_eq!(kv.incr("a", 1, Duration::from_secs(60)).await, 1);
        assert_eq!(kv.incr("a", 5, Duration::from_secs(60)).await, 6);
        kv.set_ex("k", "v", Duration::from_secs(60)).await;
        assert_eq!(kv.get("k").await.as_deref(), Some("v"));
        kv.set_ex("gone", "v", Duration::from_millis(1)).await;
        tokio::time::sleep(Duration::from_millis(5)).await;
        assert_eq!(kv.get("gone").await, None);
    }
}
