//! 1e9 fixed-point conversion. DeepBook Predict scales every price/SVI param by 1e9.
//!
//! Treat `u64` raw values as "atomic" units; use these helpers to convert to/from
//! [`rust_decimal::Decimal`] real values.

use rust_decimal::Decimal;

/// `1e9` — the Predict on-chain scaling factor.
pub const FLOAT_SCALING: u64 = 1_000_000_000;

const SCALE_EXP: u32 = 9;

/// Convert a 1e9-scaled `u64` to a `Decimal` (real value).
#[inline]
pub fn from_u64_1e9(raw: u64) -> Decimal {
    Decimal::new(raw as i64, SCALE_EXP)
}

/// Convert a 1e9-scaled signed-magnitude pair (`is_negative`, `magnitude`) into a `Decimal`.
///
/// Used for [`crate::types::SviParams::rho`] and `m`, which on-chain are
/// `deepbook_predict::i64::I64` (`{is_negative: bool, magnitude: u64}`).
#[inline]
pub fn from_signed_mag_1e9(magnitude: u64, is_negative: bool) -> Decimal {
    let raw = magnitude as i64;
    let v = Decimal::new(raw, SCALE_EXP);
    if is_negative {
        -v
    } else {
        v
    }
}

/// Parse a stringified `u64` (Sui RPC returns large u64 fields as strings) into a u64.
#[inline]
pub fn parse_u64_str(s: &str) -> Result<u64, std::num::ParseIntError> {
    s.parse::<u64>()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    fn d(s: &str) -> Decimal {
        Decimal::from_str(s).unwrap()
    }

    #[test]
    fn raw_to_decimal() {
        assert_eq!(from_u64_1e9(1_000_000_000), d("1"));
        assert_eq!(from_u64_1e9(63_350_993_015_818), d("63350.993015818"));
        assert_eq!(from_u64_1e9(0), d("0"));
    }

    #[test]
    fn signed_mag() {
        assert_eq!(from_signed_mag_1e9(456_538_251, true), d("-0.456538251"));
        assert_eq!(from_signed_mag_1e9(456_538_251, false), d("0.456538251"));
        assert_eq!(from_signed_mag_1e9(0, true), d("0"));
    }
}
