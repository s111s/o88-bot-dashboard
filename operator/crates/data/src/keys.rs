//! Sui ed25519 key handling. Pure read-only address derivation — no signing
//! happens here (that's Phase 1.3b). Used by the verify-keypair binary to
//! confirm a .env-loaded key matches the address the user expects.
//!
//! Sui address = blake2b_256(flag_byte || ed25519_public_key)[..32]
//!   flag_byte for ed25519 = 0x00

use anyhow::{Context, Result, anyhow};
use blake2::digest::consts::U32;
use blake2::{Blake2b, Digest};
use ed25519_dalek::SigningKey;

const ED25519_FLAG: u8 = 0x00;
const BECH32_HRP: &str = "suiprivkey";

type Blake2b256 = Blake2b<U32>;

/// Parse a Sui ed25519 secret key from one of three formats:
/// - 64-char hex (`hex::encode` of the 32 raw secret bytes)
/// - 32-byte Bech32 (`suiprivkey1...` — the canonical Sui import format)
/// - 33-byte base64 (the keystore-line format: `[flag_byte] || [32 secret]`)
pub fn parse_secret(input: &str) -> Result<SigningKey> {
    let input = input.trim();
    let secret_bytes: [u8; 32] = if let Some(stripped) = input.strip_prefix(BECH32_HRP) {
        // Bech32: suiprivkey1... — decode then strip the 1-byte flag prefix.
        let _ = stripped; // silence unused — full string used below
        decode_bech32_secret(input)?
    } else if let Ok(bytes) = hex::decode(input.trim_start_matches("0x")) {
        // Hex path.
        bytes
            .try_into()
            .map_err(|v: Vec<u8>| anyhow!("hex key wrong length: got {} bytes, want 32", v.len()))?
    } else if let Ok(bytes) = base64_decode(input) {
        // Base64 keystore line: [flag] || [32 secret]
        if bytes.len() == 33 {
            if bytes[0] != ED25519_FLAG {
                return Err(anyhow!(
                    "base64 key has flag byte {:#04x}; expected {:#04x} (ed25519)",
                    bytes[0],
                    ED25519_FLAG
                ));
            }
            bytes[1..33].try_into().expect("33-1 = 32")
        } else if bytes.len() == 32 {
            // Raw 32-byte secret in base64 (no flag prefix).
            bytes.try_into().expect("len-checked")
        } else {
            return Err(anyhow!(
                "base64 key has {} bytes; expected 32 (raw) or 33 (flag+secret)",
                bytes.len()
            ));
        }
    } else {
        return Err(anyhow!(
            "private key not recognized as hex / Bech32 (suiprivkey1...) / base64"
        ));
    };

    Ok(SigningKey::from_bytes(&secret_bytes))
}

fn decode_bech32_secret(s: &str) -> Result<[u8; 32]> {
    let (hrp, data) = bech32::decode(s).context("bech32 decode")?;
    if hrp.as_str() != BECH32_HRP {
        return Err(anyhow!(
            "bech32 HRP is `{}`, expected `{BECH32_HRP}`",
            hrp.as_str()
        ));
    }
    if data.len() != 33 {
        return Err(anyhow!(
            "bech32 payload is {} bytes; expected 33 (flag+secret)",
            data.len()
        ));
    }
    if data[0] != ED25519_FLAG {
        return Err(anyhow!(
            "bech32 key flag byte is {:#04x}; expected {:#04x} (ed25519)",
            data[0],
            ED25519_FLAG
        ));
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&data[1..33]);
    Ok(out)
}

fn base64_decode(s: &str) -> Result<Vec<u8>> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .context("base64 decode")
}

/// Derive the Sui address (32-byte hex, no `0x`) for an ed25519 keypair.
pub fn sui_address_from_signing_key(sk: &SigningKey) -> String {
    let pubkey = sk.verifying_key();
    let pubkey_bytes = pubkey.to_bytes();
    let mut hasher = Blake2b256::new();
    hasher.update([ED25519_FLAG]);
    hasher.update(pubkey_bytes);
    let digest = hasher.finalize();
    format!("0x{}", hex::encode(digest))
}

/// Encode an ed25519 signing key in the canonical Sui `suiprivkey1...` Bech32 form
/// (what `sui keytool import` accepts).
pub fn to_bech32_secret(sk: &SigningKey) -> Result<String> {
    use bech32::{Bech32, Hrp};
    let mut payload = Vec::with_capacity(33);
    payload.push(ED25519_FLAG);
    payload.extend_from_slice(&sk.to_bytes());
    let hrp = Hrp::parse(BECH32_HRP).expect("valid HRP");
    bech32::encode::<Bech32>(hrp, &payload).context("bech32 encode")
}

#[cfg(test)]
mod tests {
    use super::*;

    // Known Sui ed25519 test vector — secret = 32 bytes of 0x01.
    // The address blake2b(0x00 || pubkey(0x01x32)) is deterministic; we just
    // verify the derivation pipeline doesn't change shape.
    #[test]
    fn derives_some_address() {
        let secret = [1u8; 32];
        let sk = SigningKey::from_bytes(&secret);
        let addr = sui_address_from_signing_key(&sk);
        assert!(addr.starts_with("0x"));
        assert_eq!(addr.len(), 66); // 0x + 64 hex chars
    }

    #[test]
    fn hex_round_trip() {
        let hex_key = "0101010101010101010101010101010101010101010101010101010101010101";
        let sk = parse_secret(hex_key).unwrap();
        let _ = sui_address_from_signing_key(&sk);
    }
}
