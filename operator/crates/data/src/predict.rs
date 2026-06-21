//! High-level Predict reader: combines [`PredictCatalog`] (discovery) and
//! [`SuiRpcClient`] (fresh on-chain state).
//!
//! Bot P's pipeline:
//! 1. `PredictReader::active_oracles()` — list every live oracle from the catalog
//! 2. For each: `PredictReader::read_oracle(oracle_id)` — fetch fresh chain state
//! 3. Pass into the SVI pricer (Phase 1.2) to compute fair binary/range marks.

use crate::predict_server::{CatalogEntry, PredictCatalog};
use crate::scale::{from_signed_mag_1e9, from_u64_1e9, parse_u64_str};
use crate::sui_rpc::SuiRpcClient;
use crate::types::{OracleSvi, PriceData, SviParams};
use anyhow::{Context, Result, anyhow};
use serde_json::Value;

pub struct PredictReader {
    catalog: PredictCatalog,
    rpc: SuiRpcClient,
}

impl PredictReader {
    pub fn new(catalog: PredictCatalog, rpc: SuiRpcClient) -> Self {
        Self { catalog, rpc }
    }

    pub fn testnet() -> Self {
        Self::new(
            PredictCatalog::default(),
            SuiRpcClient::for_network(crate::sui_rpc::Network::Testnet),
        )
    }

    /// All oracles currently in `Active` status per the off-chain catalog. Use this
    /// as the seed list; recheck on-chain status before relying on prices.
    pub async fn active_oracles(&self) -> Result<Vec<CatalogEntry>> {
        self.catalog.list_active().await
    }

    /// Read fresh [`OracleSvi`] state from chain.
    pub async fn read_oracle(&self, oracle_id: &str) -> Result<OracleSvi> {
        let data = self.rpc.get_object(oracle_id).await?;
        parse_oracle_svi(oracle_id, &data)
    }
}

/// Parse the `data` envelope returned by `sui_getObject` into an [`OracleSvi`].
/// Exposed for unit tests against fixture JSON.
pub fn parse_oracle_svi(oracle_id: &str, data: &Value) -> Result<OracleSvi> {
    let fields = data
        .pointer("/content/fields")
        .ok_or_else(|| anyhow!("no /content/fields in object {oracle_id}"))?;

    let underlying = fields
        .get("underlying_asset")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("missing underlying_asset"))?
        .to_string();

    let expiry_ms = field_u64(fields, "expiry")?;
    let timestamp_ms = field_u64(fields, "timestamp")?;
    let active = fields.get("active").and_then(Value::as_bool).unwrap_or(false);

    let prices_f = fields
        .pointer("/prices/fields")
        .ok_or_else(|| anyhow!("missing prices.fields"))?;
    let prices = PriceData {
        spot: from_u64_1e9(field_u64(prices_f, "spot")?),
        forward: from_u64_1e9(field_u64(prices_f, "forward")?),
    };

    let svi_f = fields
        .pointer("/svi/fields")
        .ok_or_else(|| anyhow!("missing svi.fields"))?;
    let svi = SviParams {
        a: from_u64_1e9(field_u64(svi_f, "a")?),
        b: from_u64_1e9(field_u64(svi_f, "b")?),
        rho: signed_field(svi_f, "rho")?,
        m: signed_field(svi_f, "m")?,
        sigma: from_u64_1e9(field_u64(svi_f, "sigma")?),
    };

    let settlement_price = match fields.get("settlement_price") {
        // The Move Option<u64> renders as either null OR an object with "vec":[v]
        // depending on Sui RPC version. Handle both.
        None | Some(Value::Null) => None,
        Some(Value::Object(o)) => {
            if let Some(arr) = o.get("vec").and_then(Value::as_array) {
                if let Some(first) = arr.first() {
                    Some(from_u64_1e9(parse_u64_str(first.as_str().unwrap_or("0"))?))
                } else {
                    None
                }
            } else {
                None
            }
        }
        Some(Value::String(s)) => Some(from_u64_1e9(parse_u64_str(s)?)),
        Some(Value::Number(n)) => Some(from_u64_1e9(n.as_u64().unwrap_or(0))),
        _ => None,
    };

    let authorized_caps = fields
        .pointer("/authorized_caps/fields/contents")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();

    Ok(OracleSvi {
        id: oracle_id.to_string(),
        underlying,
        expiry_ms,
        active,
        prices,
        svi,
        timestamp_ms,
        settlement_price,
        authorized_caps,
    })
}

fn field_u64(fields: &Value, key: &str) -> Result<u64> {
    let v = fields
        .get(key)
        .ok_or_else(|| anyhow!("missing field {key}"))?;
    match v {
        Value::String(s) => parse_u64_str(s).with_context(|| format!("parse u64 field {key}")),
        Value::Number(n) => n
            .as_u64()
            .ok_or_else(|| anyhow!("field {key} is non-u64 number {n}")),
        Value::Bool(b) => Ok(if *b { 1 } else { 0 }),
        _ => Err(anyhow!("field {key} has unexpected JSON shape: {v}")),
    }
}

/// Decode an embedded `<pkg>::i64::I64` struct (`{is_negative, magnitude}`) into a Decimal.
fn signed_field(fields: &Value, key: &str) -> Result<rust_decimal::Decimal> {
    let inner = fields
        .pointer(&format!("/{key}/fields"))
        .ok_or_else(|| anyhow!("missing signed field {key}"))?;
    let mag = field_u64(inner, "magnitude")?;
    let is_neg = inner
        .get("is_negative")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Ok(from_signed_mag_1e9(mag, is_neg))
}
