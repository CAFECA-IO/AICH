//! Smart routing engine: turns a hub model + request into an ordered list of upstream candidates.

pub mod health;
pub mod intent;
pub mod keypool;

use std::sync::Arc;

use crate::catalog::{Catalog, ModelInfo, ProviderInfo, Route, Strategy};
use health::{target_key, Health};

#[derive(Debug, Clone)]
pub struct Candidate {
    pub route: Route,
    pub provider: Arc<ProviderInfo>,
    pub target: String,
}

#[derive(Debug, Clone)]
pub struct RoutePlan {
    pub strategy: Strategy,
    pub intent: Option<&'static str>,
    pub candidates: Vec<Candidate>,
    /// Candidates removed because their circuit is open / budget exhausted / no keys.
    pub skipped: Vec<(String, &'static str)>,
}

pub struct PlanInput<'a> {
    pub catalog: &'a Catalog,
    pub model: &'a ModelInfo,
    pub strategy: Strategy,
    pub intent: Option<&'static str>,
    pub prompt_tokens: u32,
    pub max_output_tokens: u32,
    pub stream: bool,
    pub user_id: uuid::Uuid,
}

pub fn estimated_cost(route: &Route, prompt_tokens: u32, output_tokens: u32) -> f64 {
    (prompt_tokens as f64 * route.input_price as f64
        + output_tokens as f64 * route.output_price as f64)
        / 1_000_000.0
        * route.ratio_bp as f64
}

pub fn plan(input: &PlanInput<'_>, health: &Health) -> RoutePlan {
    let mut candidates = Vec::new();
    let mut skipped = Vec::new();

    for route in &input.model.routes {
        let target = target_key(&route.provider_id, &route.upstream_model);
        let Some(provider) = input.catalog.providers.get(&route.provider_id) else {
            skipped.push((target, "provider_missing"));
            continue;
        };
        if !provider.enabled {
            skipped.push((target, "provider_disabled"));
            continue;
        }
        if provider.budget_exceeded() {
            skipped.push((target, "budget_exceeded"));
            continue;
        }
        let has_key = input
            .catalog
            .keys
            .get(&route.provider_id)
            .map(|ks| {
                ks.iter()
                    .any(|k| k.owner_user_id.is_none() || k.owner_user_id == Some(input.user_id))
            })
            .unwrap_or(false);
        if !has_key {
            skipped.push((target, "no_provider_key"));
            continue;
        }
        if !health.is_available(&target) {
            skipped.push((target, "circuit_open"));
            continue;
        }
        candidates.push(Candidate {
            route: route.clone(),
            provider: provider.clone(),
            target,
        });
    }

    match input.strategy {
        Strategy::Failover => candidates.sort_by_key(|c| c.route.priority),
        Strategy::Cost => candidates.sort_by(|a, b| {
            let ca = estimated_cost(&a.route, input.prompt_tokens, input.max_output_tokens);
            let cb = estimated_cost(&b.route, input.prompt_tokens, input.max_output_tokens);
            ca.partial_cmp(&cb)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.route.priority.cmp(&b.route.priority))
        }),
        Strategy::Latency => candidates.sort_by(|a, b| {
            // Unmeasured targets sort first so they get explored once.
            let la = health.latency(&a.target, input.stream).unwrap_or(0.0);
            let lb = health.latency(&b.target, input.stream).unwrap_or(0.0);
            la.partial_cmp(&lb)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.route.priority.cmp(&b.route.priority))
        }),
        Strategy::Intent => {
            let intent = input.intent.unwrap_or("general");
            candidates
                .sort_by_key(|c| (!c.route.tags.iter().any(|t| t == intent), c.route.priority));
        }
    }

    RoutePlan {
        strategy: input.strategy,
        intent: input.intent,
        candidates,
        skipped,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{ModelInfo, ProviderKey};
    use crate::providers::ProviderKind;
    use std::time::Duration;
    use uuid::Uuid;

    fn provider(id: &str) -> Arc<ProviderInfo> {
        Arc::new(ProviderInfo {
            id: id.into(),
            kind: ProviderKind::Mock,
            name: id.into(),
            base_url: "mock://".into(),
            enabled: true,
            timeout: Duration::from_secs(5),
            monthly_budget: None,
            month_spend: 0,
            config: serde_json::json!({}),
        })
    }

    fn route(p: &str, m: &str, prio: i32, inp: i64, out: i64, tags: &[&str]) -> Route {
        Route {
            id: Uuid::new_v4(),
            provider_id: p.into(),
            upstream_model: m.into(),
            priority: prio,
            input_price: inp,
            output_price: out,
            tags: tags.iter().map(|s| s.to_string()).collect(),
            ratio_bp: 10_000,
        }
    }

    fn catalog(routes: Vec<Route>) -> (Catalog, ModelInfo) {
        let mut c = Catalog::default();
        for p in ["a", "b", "c"] {
            c.providers.insert(p.into(), provider(p));
            c.keys.insert(
                p.into(),
                vec![ProviderKey {
                    id: Uuid::new_v4(),
                    provider_id: p.into(),
                    owner_user_id: None,
                    secret: "k".into(),
                    weight: 1,
                }],
            );
        }
        let m = ModelInfo {
            id: "m".into(),
            display_name: "m".into(),
            description: String::new(),
            tier: "basic".into(),
            strategy: Strategy::Failover,
            context_window: 1000,
            supports_vision: false,
            supports_tools: true,
            sort_order: 0,
            routes,
        };
        (c, m)
    }

    fn order(
        c: &Catalog,
        m: &ModelInfo,
        s: Strategy,
        intent: Option<&'static str>,
        h: &Health,
    ) -> Vec<String> {
        plan(
            &PlanInput {
                catalog: c,
                model: m,
                strategy: s,
                intent,
                prompt_tokens: 1000,
                max_output_tokens: 500,
                stream: false,
                user_id: Uuid::new_v4(),
            },
            h,
        )
        .candidates
        .into_iter()
        .map(|c| c.provider.id.clone())
        .collect()
    }

    #[test]
    fn orders_by_each_strategy() {
        let (c, m) = catalog(vec![
            route("a", "x", 0, 3_000_000, 15_000_000, &["reasoning"]),
            route("b", "y", 1, 100_000, 400_000, &["simple"]),
            route("c", "z", 2, 1_000_000, 2_000_000, &["code"]),
        ]);
        let h = Health::default();
        assert_eq!(
            order(&c, &m, Strategy::Failover, None, &h),
            vec!["a", "b", "c"]
        );
        assert_eq!(order(&c, &m, Strategy::Cost, None, &h), vec!["b", "c", "a"]);
        assert_eq!(
            order(&c, &m, Strategy::Intent, Some("code"), &h),
            vec!["c", "a", "b"]
        );
        h.record_success("a/x", Duration::from_millis(900), None);
        h.record_success("b/y", Duration::from_millis(300), None);
        h.record_success("c/z", Duration::from_millis(100), None);
        assert_eq!(
            order(&c, &m, Strategy::Latency, None, &h),
            vec!["c", "b", "a"]
        );
    }

    #[test]
    fn skips_unhealthy_disabled_and_keyless() {
        let (mut c, m) = catalog(vec![
            route("a", "x", 0, 1, 1, &[]),
            route("b", "y", 1, 1, 1, &[]),
            route("c", "z", 2, 1, 1, &[]),
        ]);
        let h = Health::default();
        for _ in 0..5 {
            h.record_failure("a/x", "down");
        }
        c.keys.remove("b");
        let p = plan(
            &PlanInput {
                catalog: &c,
                model: &m,
                strategy: Strategy::Failover,
                intent: None,
                prompt_tokens: 1,
                max_output_tokens: 1,
                stream: false,
                user_id: Uuid::new_v4(),
            },
            &h,
        );
        assert_eq!(p.candidates.len(), 1);
        assert_eq!(p.candidates[0].provider.id, "c");
        assert_eq!(p.skipped.len(), 2);
    }

    #[test]
    fn budget_breaker_excludes_provider() {
        let (mut c, m) = catalog(vec![
            route("a", "x", 0, 1, 1, &[]),
            route("b", "y", 1, 1, 1, &[]),
        ]);
        let mut pa = (*c.providers["a"]).clone();
        pa.monthly_budget = Some(100);
        pa.month_spend = 150;
        c.providers.insert("a".into(), Arc::new(pa));
        assert_eq!(
            order(&c, &m, Strategy::Failover, None, &Health::default()),
            vec!["b"]
        );
    }
}
