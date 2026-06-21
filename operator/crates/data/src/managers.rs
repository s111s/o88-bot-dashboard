//! PredictManager discovery + position enumeration.
//!
//! Pipeline:
//! 1. [`discover_managers`] scans `PredictManagerCreated` events to find every
//!    shared `PredictManager` ever created.
//! 2. [`read_manager_positions`] reads one manager's `positions: Table<MarketKey, u64>`
//!    by listing the table's dynamic fields and decoding each.
//! 3. [`find_redemption_candidates`] joins (1) + (2) against a set of settled
//!    oracle IDs to surface positions Bot K-redeem can close out permissionlessly.

use crate::sui_rpc::SuiRpcClient;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

// Testnet Predict package (deployed bytecode) — see docs/deepbook-predict-testnet.md.
pub const PREDICT_PKG_TESTNET: &str =
    "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";

/// One row of the `PredictManagerCreated` event stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manager {
    pub manager_id: String,
    pub owner: String,
    pub created_at_ms: Option<u64>,
}

/// One open long position decoded from `PredictManager.positions`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub manager_id: String,
    pub owner: String,
    pub oracle_id: String,
    pub expiry_ms: u64,
    pub strike: u64,
    pub is_up: bool,
    pub quantity: u64,
}

/// A position whose oracle has settled — ready for `redeem_permissionless`.
#[derive(Debug, Clone, Serialize)]
pub struct RedemptionCandidate {
    pub position: Position,
    pub settlement_price: rust_decimal::Decimal,
    pub wins: bool,
}

/// Scan `PredictManagerCreated` events. Paginates back to `limit` records max.
pub async fn discover_managers(rpc: &SuiRpcClient, limit: usize) -> Result<Vec<Manager>> {
    let event_type = format!("{PREDICT_PKG_TESTNET}::predict_manager::PredictManagerCreated");
    let mut cursor: Option<Value> = None;
    let mut out = Vec::new();
    while out.len() < limit {
        let page = (limit - out.len()).min(50);
        let params = json!([
            { "MoveEventType": event_type },
            cursor,
            page,
            true,
        ]);
        let res = rpc.call("suix_queryEvents", params).await?;
        let data = res.get("data").and_then(Value::as_array).cloned().unwrap_or_default();
        for ev in &data {
            let pj = ev.get("parsedJson").unwrap_or(&Value::Null);
            let manager_id = pj.get("manager_id").and_then(Value::as_str).unwrap_or("").to_string();
            let owner = pj.get("owner").and_then(Value::as_str).unwrap_or("").to_string();
            let ts = ev
                .get("timestampMs")
                .and_then(Value::as_str)
                .and_then(|s| s.parse::<u64>().ok());
            if !manager_id.is_empty() {
                out.push(Manager { manager_id, owner, created_at_ms: ts });
            }
        }
        if !res.get("hasNextPage").and_then(Value::as_bool).unwrap_or(false) {
            break;
        }
        cursor = res.get("nextCursor").cloned();
        if data.is_empty() {
            break;
        }
    }
    Ok(out)
}

/// Read one manager's open long positions.
pub async fn read_manager_positions(
    rpc: &SuiRpcClient,
    manager_id: &str,
) -> Result<Vec<Position>> {
    let mgr = rpc.get_object(manager_id).await.context("get manager object")?;
    let fields = mgr
        .pointer("/content/fields")
        .cloned()
        .unwrap_or(Value::Null);
    let owner = fields
        .get("owner")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let positions_table_id = fields
        .pointer("/positions/fields/id/id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let Some(table_id) = positions_table_id else {
        return Ok(vec![]);
    };

    let mut out = Vec::new();
    let mut cursor: Option<Value> = None;
    loop {
        let params = json!([table_id, cursor, 50]);
        let res = rpc.call("suix_getDynamicFields", params).await?;
        let data = res.get("data").and_then(Value::as_array).cloned().unwrap_or_default();
        for f in &data {
            // The dynamic field's `name.value` IS the MarketKey JSON: { oracle_id, expiry, strike, direction }
            let name_val = f.pointer("/name/value");
            let oracle_id = name_val
                .and_then(|v| v.get("oracle_id"))
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let expiry_ms = name_val
                .and_then(|v| v.get("expiry"))
                .and_then(parse_u64_val)
                .unwrap_or(0);
            let strike = name_val
                .and_then(|v| v.get("strike"))
                .and_then(parse_u64_val)
                .unwrap_or(0);
            let direction = name_val
                .and_then(|v| v.get("direction"))
                .and_then(parse_u64_val)
                .unwrap_or(0) as u8;
            let field_id = f
                .get("objectId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();

            // Fetch the field object to read the u64 value.
            let field_obj = rpc.get_object(&field_id).await?;
            let quantity = field_obj
                .pointer("/content/fields/value")
                .and_then(parse_u64_val)
                .unwrap_or(0);

            if quantity > 0 && !oracle_id.is_empty() {
                out.push(Position {
                    manager_id: manager_id.to_string(),
                    owner: owner.clone(),
                    oracle_id,
                    expiry_ms,
                    strike,
                    is_up: direction == 0,
                    quantity,
                });
            }
        }
        if !res.get("hasNextPage").and_then(Value::as_bool).unwrap_or(false) {
            break;
        }
        cursor = res.get("nextCursor").cloned();
        if data.is_empty() {
            break;
        }
    }
    Ok(out)
}

/// Join: for every position whose oracle is in `settled_oracles`, build a redemption
/// candidate annotated with the settlement price + UP/DOWN win flag.
pub fn find_redemption_candidates(
    positions: &[Position],
    settled_oracles: &[(String, rust_decimal::Decimal)],
) -> Vec<RedemptionCandidate> {
    let mut out = Vec::new();
    for p in positions {
        if let Some((_, settle)) = settled_oracles
            .iter()
            .find(|(oid, _)| oid.eq_ignore_ascii_case(&p.oracle_id))
        {
            let strike_real = rust_decimal::Decimal::from(p.strike) / rust_decimal::Decimal::from(1_000_000_000u64);
            let wins = if p.is_up {
                *settle > strike_real
            } else {
                *settle <= strike_real
            };
            out.push(RedemptionCandidate {
                position: p.clone(),
                settlement_price: *settle,
                wins,
            });
        }
    }
    out
}

fn parse_u64_val(v: &Value) -> Option<u64> {
    match v {
        Value::String(s) => s.parse::<u64>().ok(),
        Value::Number(n) => n.as_u64(),
        Value::Bool(b) => Some(if *b { 1 } else { 0 }),
        _ => None,
    }
}
