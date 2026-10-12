//! Shared helpers for the portal/admin JSON APIs.

use serde_json::{Map, Value};
use sqlx::{PgPool, Postgres, QueryBuilder};

use crate::error::{ApiError, ApiResult};

#[derive(Clone, Copy)]
pub enum Field {
    Text,
    Bool,
    Int,
    BigInt,
    TextArray,
    Json,
}

/// Wrap a SELECT so Postgres returns the rows as a JSON array.
pub fn as_json_array(select: &str) -> String {
    format!("SELECT COALESCE(json_agg(t), '[]'::json) FROM ({select}) t")
}

/// Wrap a SELECT so Postgres returns the first row as a JSON object (or null).
pub fn as_json_object(select: &str) -> String {
    format!("SELECT row_to_json(t) FROM ({select}) t LIMIT 1")
}

fn bind_value<'a>(
    qb: &mut QueryBuilder<'a, Postgres>,
    name: &str,
    kind: Field,
    v: &Value,
) -> ApiResult<()> {
    let bad = || ApiError::bad_request(format!("invalid value for '{name}'"));
    match kind {
        Field::Text => {
            qb.push_bind(if v.is_null() {
                None
            } else {
                Some(v.as_str().ok_or_else(bad)?.to_string())
            });
        }
        Field::Bool => {
            qb.push_bind(v.as_bool().ok_or_else(bad)?);
        }
        Field::Int => {
            qb.push_bind(if v.is_null() {
                None
            } else {
                Some(v.as_i64().ok_or_else(bad)? as i32)
            });
        }
        Field::BigInt => {
            qb.push_bind(if v.is_null() {
                None
            } else {
                Some(v.as_i64().ok_or_else(bad)?)
            });
        }
        Field::TextArray => {
            let arr = if v.is_null() {
                None
            } else {
                Some(
                    v.as_array()
                        .ok_or_else(bad)?
                        .iter()
                        .map(|x| x.as_str().map(String::from).ok_or_else(bad))
                        .collect::<ApiResult<Vec<String>>>()?,
                )
            };
            qb.push_bind(arr);
        }
        Field::Json => {
            qb.push_bind(v.clone());
        }
    }
    Ok(())
}

/// Build `INSERT INTO table (cols) VALUES (...)` from whitelisted JSON fields plus fixed extras.
pub async fn dynamic_insert(
    db: &PgPool,
    table: &str,
    body: &Map<String, Value>,
    allowed: &[(&str, Field)],
    required: &[&str],
) -> ApiResult<()> {
    for r in required {
        if body.get(*r).map(Value::is_null).unwrap_or(true) {
            return Err(ApiError::bad_request(format!("'{r}' is required")));
        }
    }
    let present: Vec<&(&str, Field)> = allowed
        .iter()
        .filter(|(n, _)| body.contains_key(*n))
        .collect();
    let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(format!("INSERT INTO {table} ("));
    let cols: Vec<&str> = present.iter().map(|(n, _)| *n).collect();
    qb.push(cols.join(", "));
    qb.push(") VALUES (");
    for (i, (name, kind)) in present.iter().enumerate() {
        if i > 0 {
            qb.push(", ");
        }
        bind_value(&mut qb, name, *kind, &body[*name])?;
    }
    qb.push(")");
    qb.build().execute(db).await?;
    Ok(())
}

/// Build `UPDATE table SET a=$1,... WHERE id_col = $n` from whitelisted JSON fields.
pub async fn dynamic_update<'a, T>(
    db: &PgPool,
    table: &str,
    id_col: &str,
    id: T,
    body: &Map<String, Value>,
    allowed: &[(&str, Field)],
) -> ApiResult<u64>
where
    T: 'a + sqlx::Encode<'a, Postgres> + sqlx::Type<Postgres> + Send,
{
    let mut qb: QueryBuilder<'a, Postgres> = QueryBuilder::new(format!("UPDATE {table} SET "));
    let mut n = 0;
    for (name, kind) in allowed {
        if let Some(v) = body.get(*name) {
            if n > 0 {
                qb.push(", ");
            }
            qb.push(format!("{name} = "));
            bind_value(&mut qb, name, *kind, v)?;
            n += 1;
        }
    }
    if n == 0 {
        return Err(ApiError::bad_request("no updatable fields supplied"));
    }
    qb.push(format!(" WHERE {id_col} = "));
    qb.push_bind(id);
    let res = qb.build().execute(db).await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::not_found(format!("{table} record not found")));
    }
    Ok(res.rows_affected())
}

pub fn obj(v: Value) -> ApiResult<Map<String, Value>> {
    match v {
        Value::Object(m) => Ok(m),
        _ => Err(ApiError::bad_request("expected a JSON object")),
    }
}

pub fn clamp_limit(limit: Option<i64>) -> i64 {
    limit.unwrap_or(50).clamp(1, 500)
}
