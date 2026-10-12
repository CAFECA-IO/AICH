//! Live health tracking per upstream target (provider + upstream model):
//! EWMA latency / TTFT, success counters and a circuit breaker.

use std::time::{Duration, Instant};

use dashmap::DashMap;
use serde::Serialize;

const EWMA_ALPHA: f64 = 0.3;
const FAILURE_THRESHOLD: u32 = 5;
const BASE_OPEN: Duration = Duration::from_secs(30);
const MAX_OPEN: Duration = Duration::from_secs(300);
/// A half-open probe older than this is considered abandoned (e.g. the client disconnected).
const PROBE_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

#[derive(Debug, Clone)]
pub struct TargetHealth {
    pub ewma_latency_ms: Option<f64>,
    pub ewma_ttft_ms: Option<f64>,
    pub successes: u64,
    pub failures: u64,
    pub consecutive_failures: u32,
    pub open_until: Option<Instant>,
    pub open_duration: Duration,
    /// Set while a half-open probe is outstanding; expires so a cancelled probe cannot wedge the circuit.
    pub probe_in_flight: Option<Instant>,
    pub last_error: Option<String>,
}

impl Default for TargetHealth {
    fn default() -> Self {
        Self {
            ewma_latency_ms: None,
            ewma_ttft_ms: None,
            successes: 0,
            failures: 0,
            consecutive_failures: 0,
            open_until: None,
            open_duration: BASE_OPEN,
            probe_in_flight: None,
            last_error: None,
        }
    }
}

impl TargetHealth {
    pub fn state(&self, now: Instant) -> CircuitState {
        match self.open_until {
            Some(t) if t > now => CircuitState::Open,
            Some(_) => CircuitState::HalfOpen,
            None => CircuitState::Closed,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct HealthSnapshot {
    pub target: String,
    pub state: CircuitState,
    pub ewma_latency_ms: Option<f64>,
    pub ewma_ttft_ms: Option<f64>,
    pub successes: u64,
    pub failures: u64,
    pub consecutive_failures: u32,
    pub last_error: Option<String>,
}

#[derive(Default)]
pub struct Health {
    targets: DashMap<String, TargetHealth>,
}

pub fn target_key(provider_id: &str, upstream_model: &str) -> String {
    format!("{provider_id}/{upstream_model}")
}

fn ewma(prev: Option<f64>, sample: f64) -> f64 {
    match prev {
        Some(p) => p * (1.0 - EWMA_ALPHA) + sample * EWMA_ALPHA,
        None => sample,
    }
}

impl Health {
    /// Whether a request may be sent to this target now. In half-open state only one probe passes.
    pub fn try_acquire(&self, key: &str) -> bool {
        let now = Instant::now();
        let mut h = self.targets.entry(key.to_string()).or_default();
        match h.state(now) {
            CircuitState::Closed => true,
            CircuitState::Open => false,
            CircuitState::HalfOpen => match h.probe_in_flight {
                Some(started) if now.duration_since(started) < PROBE_TIMEOUT => false,
                _ => {
                    h.probe_in_flight = Some(now);
                    true
                }
            },
        }
    }

    /// Non-mutating availability check used for planning/sorting.
    pub fn is_available(&self, key: &str) -> bool {
        self.targets
            .get(key)
            .map(|h| h.state(Instant::now()) != CircuitState::Open)
            .unwrap_or(true)
    }

    pub fn latency(&self, key: &str, stream: bool) -> Option<f64> {
        self.targets.get(key).and_then(|h| {
            if stream {
                h.ewma_ttft_ms.or(h.ewma_latency_ms)
            } else {
                h.ewma_latency_ms
            }
        })
    }

    pub fn record_success(&self, key: &str, latency: Duration, ttft: Option<Duration>) {
        let mut h = self.targets.entry(key.to_string()).or_default();
        h.successes += 1;
        h.consecutive_failures = 0;
        h.open_until = None;
        h.open_duration = BASE_OPEN;
        h.probe_in_flight = None;
        h.ewma_latency_ms = Some(ewma(h.ewma_latency_ms, latency.as_millis() as f64));
        if let Some(t) = ttft {
            h.ewma_ttft_ms = Some(ewma(h.ewma_ttft_ms, t.as_millis() as f64));
        }
    }

    pub fn record_failure(&self, key: &str, error: &str) {
        let now = Instant::now();
        let mut h = self.targets.entry(key.to_string()).or_default();
        h.failures += 1;
        h.consecutive_failures += 1;
        h.last_error = Some(error.chars().take(300).collect());
        let was_half_open = h.state(now) == CircuitState::HalfOpen;
        h.probe_in_flight = None;
        if was_half_open {
            // Probe failed: reopen with exponential backoff.
            h.open_duration = (h.open_duration * 2).min(MAX_OPEN);
            h.open_until = Some(now + h.open_duration);
        } else if h.consecutive_failures >= FAILURE_THRESHOLD {
            h.open_until = Some(now + h.open_duration);
        }
    }

    /// Release a half-open probe slot without recording an outcome (e.g. non-retryable client error).
    pub fn release(&self, key: &str) {
        if let Some(mut h) = self.targets.get_mut(key) {
            h.probe_in_flight = None;
        }
    }

    pub fn reset(&self, key: &str) {
        self.targets.remove(key);
    }

    pub fn snapshot(&self) -> Vec<HealthSnapshot> {
        let now = Instant::now();
        let mut v: Vec<HealthSnapshot> = self
            .targets
            .iter()
            .map(|e| HealthSnapshot {
                target: e.key().clone(),
                state: e.state(now),
                ewma_latency_ms: e.ewma_latency_ms.map(|x| x.round()),
                ewma_ttft_ms: e.ewma_ttft_ms.map(|x| x.round()),
                successes: e.successes,
                failures: e.failures,
                consecutive_failures: e.consecutive_failures,
                last_error: e.last_error.clone(),
            })
            .collect();
        v.sort_by(|a, b| a.target.cmp(&b.target));
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opens_after_threshold_and_half_opens() {
        let h = Health::default();
        let k = "p/m";
        for _ in 0..FAILURE_THRESHOLD {
            assert!(h.try_acquire(k));
            h.record_failure(k, "boom");
        }
        assert!(!h.try_acquire(k));
        assert!(!h.is_available(k));
        // Force expiry
        h.targets.get_mut(k).unwrap().open_until = Some(Instant::now() - Duration::from_millis(1));
        assert!(h.try_acquire(k)); // probe
        assert!(!h.try_acquire(k)); // only one probe
        h.record_success(k, Duration::from_millis(100), None);
        assert!(h.try_acquire(k));
        assert_eq!(h.latency(k, false), Some(100.0));
    }

    #[test]
    fn failed_probe_doubles_open_time() {
        let h = Health::default();
        let k = "p/m";
        for _ in 0..FAILURE_THRESHOLD {
            h.record_failure(k, "x");
        }
        h.targets.get_mut(k).unwrap().open_until = Some(Instant::now() - Duration::from_millis(1));
        assert!(h.try_acquire(k));
        h.record_failure(k, "still down");
        assert_eq!(h.targets.get(k).unwrap().open_duration, BASE_OPEN * 2);
        assert!(!h.is_available(k));
    }

    #[test]
    fn abandoned_probe_expires() {
        let h = Health::default();
        let k = "p/m";
        for _ in 0..FAILURE_THRESHOLD {
            h.record_failure(k, "x");
        }
        h.targets.get_mut(k).unwrap().open_until = Some(Instant::now() - Duration::from_millis(1));
        assert!(h.try_acquire(k));
        assert!(!h.try_acquire(k));
        // Probe was cancelled without reporting back; after the timeout a new probe is allowed.
        h.targets.get_mut(k).unwrap().probe_in_flight = Some(Instant::now() - PROBE_TIMEOUT);
        assert!(h.try_acquire(k));
    }

    #[test]
    fn ewma_smooths() {
        let h = Health::default();
        h.record_success(
            "a",
            Duration::from_millis(100),
            Some(Duration::from_millis(50)),
        );
        h.record_success(
            "a",
            Duration::from_millis(200),
            Some(Duration::from_millis(50)),
        );
        assert_eq!(h.latency("a", false), Some(130.0));
        assert_eq!(h.latency("a", true), Some(50.0));
    }
}
