//! Integration tests: parse real `OracleSVI` JSON fixtures into typed Rust state.

use o88_data::predict::parse_oracle_svi;
use o88_data::types::OracleStatus;
use serde_json::Value;
use std::fs;

#[test]
fn parses_btc_oracle_fixture() {
    let raw = fs::read_to_string("tests/fixtures/oracle_svi_btc.json").unwrap();
    let data: Value = serde_json::from_str(&raw).unwrap();
    let oid = "0x75c2aec22ad83ee7461e6b8d6b06aad84bd68c2b154232328ec0c9a96112ea99";

    let o = parse_oracle_svi(oid, &data).expect("parse OracleSVI");

    assert_eq!(o.id, oid);
    assert_eq!(o.underlying, "BTC");
    // Expiry was 2026-06-20T16:30:00Z
    assert_eq!(o.expiry_ms, 1781973000000);
    // The fixture had at least one cap registered
    assert!(!o.authorized_caps.is_empty());
    // Spot / forward should be positive reals
    assert!(o.prices.spot > rust_decimal::Decimal::new(0, 0));
    assert!(o.prices.forward > rust_decimal::Decimal::new(0, 0));
    // SVI sigma is always positive
    assert!(o.svi.sigma > rust_decimal::Decimal::new(0, 0));

    // Status depends on the clock. With expiry well in the past relative to "now",
    // the oracle is either Settled or PendingSettlement.
    let now = 1781973000000 + 60_000; // 1 min after expiry
    let status = o.status(now);
    assert!(matches!(
        status,
        OracleStatus::PendingSettlement | OracleStatus::Settled
    ));
}
