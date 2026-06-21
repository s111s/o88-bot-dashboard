//! `verify-keypair`
//!
//! Load .env, derive the Sui address from O88_KEEPER_PRIVATE_KEY, and compare
//! to O88_KEEPER_ADDRESS. Then check SUI gas balance on testnet.
//!
//! Run from operator/:
//!     cargo run --release --bin verify-keypair
//!
//! Reads .env from the parent dir (the repo root) by default.

use anyhow::{Context, Result, anyhow};
use clap::Parser;
use o88_data::keys::{parse_secret, sui_address_from_signing_key, to_bech32_secret};
use o88_data::{Network, SuiRpcClient};
use std::env;
use std::path::Path;

const SUI_COIN_TYPE: &str = "0x2::sui::SUI";

#[derive(Parser)]
struct Args {
    /// Also print the suiprivkey1... Bech32 form (for `sui keytool import`).
    /// WARNING: prints a private key to stdout — only use in a private terminal.
    #[arg(long, default_value_t = false)]
    print_sui_import: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();
    // .env lookup: try CWD, then repo root, then operator's parent.
    for candidate in [".env", "../.env", "../../.env"] {
        if Path::new(candidate).exists() {
            dotenvy::from_path(candidate).ok();
            eprintln!("loaded {candidate}");
            break;
        }
    }

    let header = "═".repeat(56);
    println!("\n  o88 keeper key verifier");
    println!("  {header}");

    // 1) Read .env values
    let secret_raw = env::var("O88_KEEPER_PRIVATE_KEY")
        .context("O88_KEEPER_PRIVATE_KEY not set in .env or env")?;
    let expected_addr_raw = env::var("O88_KEEPER_ADDRESS").ok();
    let network = env::var("SUI_NETWORK").unwrap_or_else(|_| "testnet".into());

    // 2) Parse secret + derive address
    let sk = parse_secret(&secret_raw)
        .context("failed to parse O88_KEEPER_PRIVATE_KEY — expect hex / suiprivkey1... / base64")?;
    let derived = sui_address_from_signing_key(&sk);

    println!("  source         .env (O88_KEEPER_PRIVATE_KEY)");
    println!("  parsed         ed25519 ✓");
    println!("  derived addr   {}", derived);

    let addr_for_rpc = match &expected_addr_raw {
        Some(expected) => {
            let expected = expected.trim().to_lowercase();
            let derived_lower = derived.to_lowercase();
            println!("  .env address   {expected}");
            if expected == derived_lower {
                println!("  match          ✓ keypair matches the declared address");
            } else {
                println!("  match          ✗ MISMATCH — derived address differs from .env value");
                return Err(anyhow!("key/address mismatch — fix one or the other"));
            }
            expected
        }
        None => {
            println!("  .env address   (not set — add O88_KEEPER_ADDRESS={})", derived);
            derived.clone()
        }
    };

    // 3) Check SUI gas balance
    let net = match network.as_str() {
        "mainnet" => Network::Mainnet,
        _ => Network::Testnet,
    };
    println!("\n  network        {network}");
    let rpc = SuiRpcClient::for_network(net);
    let bal = rpc.get_balance(&addr_for_rpc, SUI_COIN_TYPE).await?;
    let sui = bal as f64 / 1_000_000_000.0;
    let gas_ok = bal > 100_000_000; // 0.1 SUI = ~100 keeper calls
    println!(
        "  SUI balance    {:.4} SUI {}",
        sui,
        if gas_ok {
            "✓ gas funded"
        } else if bal == 0 {
            "✗ EMPTY — fund via faucet"
        } else {
            "⚠ low — top up via faucet"
        }
    );

    println!();
    if gas_ok {
        println!("  ✓ ready to run Bot K-redeem (Phase 1.3b)");
    } else {
        println!("  fund first:  sui client faucet --address {}", addr_for_rpc);
        println!("  or visit:    https://faucet.testnet.sui.io");
    }

    if args.print_sui_import {
        let bech = to_bech32_secret(&sk)?;
        println!();
        println!("  ── sui CLI import string ─────────────────────────────────");
        println!("  WARNING: this is a private key — do not share, do not log.");
        println!("  Run in your terminal:");
        println!("    sui keytool import {bech} ed25519");
        println!("  Then check it landed:");
        println!("    sui keytool list");
        println!("  And make it active for the bot:");
        println!("    sui client switch --address {addr_for_rpc}");
    }
    println!();
    Ok(())
}
