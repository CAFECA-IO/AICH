//! Provider key pool: weighted round-robin rotation with per-key cooldowns
//! (429 → short cooldown honouring Retry-After, 401/403 → long cooldown).

use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use dashmap::DashMap;
use serde::Serialize;
use uuid::Uuid;

use crate::catalog::ProviderKey;
use crate::providers::KeyFault;

const INVALID_KEY_COOLDOWN: Duration = Duration::from_secs(600);

#[derive(Default)]
pub struct KeyPool {
    cursors: DashMap<String, AtomicUsize>,
    cooldowns: DashMap<Uuid, (Instant, String)>,
}

#[derive(Debug, Serialize)]
pub struct KeyCooldown {
    pub key_id: Uuid,
    pub seconds_left: u64,
    pub reason: String,
}

impl KeyPool {
    fn cooling(&self, id: &Uuid, now: Instant) -> bool {
        self.cooldowns.get(id).map(|c| c.0 > now).unwrap_or(false)
    }

    /// Pick a key for `provider_id`. Keys owned by `user_id` (BYOK, enterprise) are preferred;
    /// keys owned by other users are never used. Shared keys are the fallback.
    pub fn select(
        &self,
        provider_id: &str,
        keys: &[ProviderKey],
        user_id: Uuid,
    ) -> Option<ProviderKey> {
        let now = Instant::now();
        let usable = |k: &&ProviderKey| !self.cooling(&k.id, now);
        let own: Vec<&ProviderKey> = keys
            .iter()
            .filter(|k| k.owner_user_id == Some(user_id))
            .filter(usable)
            .collect();
        let pool: Vec<&ProviderKey> = if !own.is_empty() {
            own
        } else {
            keys.iter()
                .filter(|k| k.owner_user_id.is_none())
                .filter(usable)
                .collect()
        };
        if pool.is_empty() {
            return None;
        }
        // Weighted round robin over an expanded index space.
        let total: usize = pool.iter().map(|k| k.weight as usize).sum();
        let cursor = self
            .cursors
            .entry(provider_id.to_string())
            .or_insert_with(|| AtomicUsize::new(0))
            .fetch_add(1, Ordering::Relaxed);
        let mut slot = cursor % total.max(1);
        for k in &pool {
            if slot < k.weight as usize {
                return Some((*k).clone());
            }
            slot -= k.weight as usize;
        }
        pool.first().map(|k| (*k).clone())
    }

    pub fn report(&self, key_id: Uuid, fault: KeyFault) {
        let now = Instant::now();
        match fault {
            KeyFault::None => {}
            KeyFault::RateLimited { retry_after_secs } => {
                let d = Duration::from_secs(retry_after_secs.clamp(1, 300));
                self.cooldowns
                    .insert(key_id, (now + d, "rate_limited".into()));
            }
            KeyFault::Invalid => {
                self.cooldowns
                    .insert(key_id, (now + INVALID_KEY_COOLDOWN, "auth_failed".into()));
            }
        }
    }

    pub fn clear(&self, key_id: &Uuid) {
        self.cooldowns.remove(key_id);
    }

    pub fn snapshot(&self) -> Vec<KeyCooldown> {
        let now = Instant::now();
        self.cooldowns
            .iter()
            .filter(|e| e.0 > now)
            .map(|e| KeyCooldown {
                key_id: *e.key(),
                seconds_left: (e.0 - now).as_secs(),
                reason: e.1.clone(),
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(owner: Option<Uuid>, weight: u32) -> ProviderKey {
        ProviderKey {
            id: Uuid::new_v4(),
            provider_id: "p".into(),
            owner_user_id: owner,
            secret: "s".into(),
            weight,
        }
    }

    #[test]
    fn rotates_and_skips_cooldown() {
        let pool = KeyPool::default();
        let keys = vec![key(None, 1), key(None, 1)];
        let u = Uuid::new_v4();
        let a = pool.select("p", &keys, u).unwrap().id;
        let b = pool.select("p", &keys, u).unwrap().id;
        assert_ne!(a, b);
        pool.report(
            a,
            KeyFault::RateLimited {
                retry_after_secs: 30,
            },
        );
        for _ in 0..4 {
            assert_eq!(pool.select("p", &keys, u).unwrap().id, b);
        }
        pool.report(b, KeyFault::Invalid);
        assert!(pool.select("p", &keys, u).is_none());
    }

    #[test]
    fn prefers_own_keys_and_hides_others() {
        let pool = KeyPool::default();
        let me = Uuid::new_v4();
        let other = Uuid::new_v4();
        let mine = key(Some(me), 1);
        let theirs = key(Some(other), 1);
        let shared = key(None, 1);
        let keys = vec![theirs.clone(), shared.clone(), mine.clone()];
        for _ in 0..3 {
            assert_eq!(pool.select("p", &keys, me).unwrap().id, mine.id);
            assert_eq!(
                pool.select("p", &keys, Uuid::new_v4()).unwrap().id,
                shared.id
            );
        }
        pool.report(mine.id, KeyFault::Invalid);
        assert_eq!(pool.select("p", &keys, me).unwrap().id, shared.id);
    }

    #[test]
    fn weights_are_respected() {
        let pool = KeyPool::default();
        let heavy = key(None, 3);
        let light = key(None, 1);
        let keys = vec![heavy.clone(), light.clone()];
        let u = Uuid::new_v4();
        let picks: Vec<Uuid> = (0..8)
            .map(|_| pool.select("p", &keys, u).unwrap().id)
            .collect();
        assert_eq!(picks.iter().filter(|i| **i == heavy.id).count(), 6);
    }
}
