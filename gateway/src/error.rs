use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

/// API error rendered in the OpenAI error envelope so existing SDKs surface it properly.
#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: StatusCode,
    pub kind: &'static str,
    pub code: &'static str,
    pub message: String,
}

impl ApiError {
    pub fn new(
        status: StatusCode,
        kind: &'static str,
        code: &'static str,
        message: impl Into<String>,
    ) -> Self {
        Self {
            status,
            kind,
            code,
            message: message.into(),
        }
    }
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self::new(
            StatusCode::BAD_REQUEST,
            "invalid_request_error",
            "bad_request",
            msg,
        )
    }
    pub fn unauthorized(msg: impl Into<String>) -> Self {
        Self::new(
            StatusCode::UNAUTHORIZED,
            "authentication_error",
            "invalid_api_key",
            msg,
        )
    }
    pub fn forbidden(msg: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, "permission_error", "forbidden", msg)
    }
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::new(
            StatusCode::NOT_FOUND,
            "invalid_request_error",
            "not_found",
            msg,
        )
    }
    pub fn conflict(msg: impl Into<String>) -> Self {
        Self::new(
            StatusCode::CONFLICT,
            "invalid_request_error",
            "conflict",
            msg,
        )
    }
    pub fn payment_required(msg: impl Into<String>) -> Self {
        Self::new(
            StatusCode::PAYMENT_REQUIRED,
            "insufficient_quota",
            "insufficient_quota",
            msg,
        )
    }
    pub fn rate_limited(msg: impl Into<String>) -> Self {
        Self::new(
            StatusCode::TOO_MANY_REQUESTS,
            "rate_limit_error",
            "rate_limit_exceeded",
            msg,
        )
    }
    pub fn upstream(msg: impl Into<String>) -> Self {
        Self::new(
            StatusCode::BAD_GATEWAY,
            "upstream_error",
            "upstream_unavailable",
            msg,
        )
    }
    pub fn internal(msg: impl Into<String>) -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "server_error",
            "internal_error",
            msg,
        )
    }

    pub fn body(&self) -> serde_json::Value {
        json!({ "error": { "message": self.message, "type": self.kind, "code": self.code } })
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({}): {}", self.status, self.code, self.message)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body())).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        if let sqlx::Error::Database(db) = &e {
            if db.code().as_deref() == Some("23505") {
                return ApiError::conflict("resource already exists");
            }
            if db.code().as_deref() == Some("23514") || db.code().as_deref() == Some("22P02") {
                return ApiError::bad_request("invalid field value");
            }
            if db.code().as_deref() == Some("23503") {
                return ApiError::bad_request("referenced resource does not exist");
            }
        }
        tracing::error!(error = %e, "database error");
        ApiError::internal("database error")
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        tracing::error!(error = %e, "internal error");
        ApiError::internal("internal error")
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
