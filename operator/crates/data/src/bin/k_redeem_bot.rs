//! `k-redeem-bot`
//!
//! The actually-executing Bot K-redeem. Scans settled positions, builds and
//! submits real `redeem_permissionless<DUSDC>` PTBs via the `sui` CLI
//! subprocess (which handles signing with the user's keystore — so the bot
//! never touches the private key directly).
//!
//! Loop:
//!   1. Reload candidates via `fetch_redemption_candidates`
//!   2. Filter to winners with payout >= O88_MIN_REDEEM_PAYOUT_ATOMIC
//!   3. Group by oracle, chunk into ≤ O88_MAX_REDEEMS_PER_PTB
//!   4. For each chunk: build a PTB, run `sui client ptb …`, log result
//!   5. Sleep O88_SCAN_INTERVAL_SECS, repeat
//!
//! Setup (one-time):
//!   1. cargo run --release --bin verify-keypair -- --print-sui-import
//!      (copy the suiprivkey1... and run the printed `sui keytool import …`)
//!   2. sui client switch --env testnet
//!   3. sui client switch --address <O88_KEEPER_ADDRESS>
//!   4. cargo run --release --bin k-redeem-bot

use anyhow::{Context, Result, anyhow};
use clap::Parser;
use o88_data::{
    Network, OracleStatus, PredictCatalog, SuiRpcClient, discover_managers,
    find_redemption_candidates, read_manager_positions,
};
use rust_decimal::Decimal;
use std::env;
use std::path::Path;
use std::process::Command;
use std::time::Duration;

const SUI_COIN_TYPE: &str = "0x2::sui::SUI";
const DEFAULT_GAS_BUDGET: u64 = 50_000_000; // 0.05 SUI; covers ≤10 redemptions
const PER_REDEEM_GAS_ADD: u64 = 5_000_000; // +0.005 SUI per extra redemption

#[derive(Parser)]
struct Args {
    /// Print the PTB commands without executing (no tx submitted, no key needed).
    #[arg(long, default_value_t = false)]
    dry_run: bool,
    /// Run one scan + exit (instead of looping forever).
    #[arg(long, default_value_t = false)]
    once: bool,
    /// Override the scan limit (managers to walk back from newest).
    #[arg(long, default_value_t = 200)]
    manager_scan: usize,
}

struct Config {
    keeper_addr: String,
    predict_pkg: String,
    predict_obj: String,
    dusdc_type: String,
    min_payout_atomic: u64,
    max_per_ptb: usize,
    scan_interval: Duration,
}

fn load_config() -> Result<Config> {
    Ok(Config {
        keeper_addr: env::var("O88_KEEPER_ADDRESS")
            .context("O88_KEEPER_ADDRESS not set in .env")?,
        predict_pkg: env::var("PREDICT_PACKAGE")
            .unwrap_or_else(|_| "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138".into()),
        predict_obj: env::var("PREDICT_OBJECT")
            .unwrap_or_else(|_| "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a".into()),
        dusdc_type: env::var("DUSDC_COIN_TYPE")
            .unwrap_or_else(|_| "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC".into()),
        min_payout_atomic: env::var("O88_MIN_REDEEM_PAYOUT_ATOMIC")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(100_000), // $0.10 default
        max_per_ptb: env::var("O88_MAX_REDEEMS_PER_PTB")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(10),
        scan_interval: Duration::from_secs(
            env::var("O88_SCAN_INTERVAL_SECS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(30),
        ),
    })
}

fn preflight(cfg: &Config, dry_run: bool) -> Result<()> {
    if dry_run {
        println!("dry-run mode: skipping sui CLI preflight");
        return Ok(());
    }
    // Verify `sui` is in PATH.
    let which = Command::new("which").arg("sui").output();
    let sui_in_path = which.ok().map(|o| o.status.success()).unwrap_or(false);
    if !sui_in_path {
        return Err(anyhow!(
            "`sui` CLI not in PATH — install from https://docs.sui.io/guides/developer/getting-started/sui-install"
        ));
    }

    // Verify the active address matches the keeper.
    let out = Command::new("sui")
        .args(["client", "active-address"])
        .output()
        .context("sui client active-address")?;
    if !out.status.success() {
        return Err(anyhow!(
            "sui client active-address failed: {}",
            String::from_utf8_lossy(&out.stderr)
        ));
    }
    let active = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let want = cfg.keeper_addr.to_lowercase();
    if active.to_lowercase() != want {
        return Err(anyhow!(
            "active sui CLI address is {active}; expected {want}\n  fix: sui client switch --address {want}"
        ));
    }
    println!("preflight ✓  sui CLI active address = {active}");
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    // .env lookup
    for candidate in [".env", "../.env", "../../.env"] {
        if Path::new(candidate).exists() {
            dotenvy::from_path(candidate).ok();
            eprintln!("loaded {candidate}");
            break;
        }
    }
    let cfg = load_config()?;
    preflight(&cfg, args.dry_run)?;

    println!();
    println!("o88 keeper · k-redeem-bot");
    println!("  address          {}", cfg.keeper_addr);
    println!("  predict pkg      {}", &cfg.predict_pkg[..18]);
    println!("  predict obj      {}", &cfg.predict_obj[..18]);
    println!("  min payout       {} atomic DUSDC", cfg.min_payout_atomic);
    println!("  max per PTB      {}", cfg.max_per_ptb);
    println!(
        "  scan interval    {}s {}",
        cfg.scan_interval.as_secs(),
        if args.once { "(once)" } else { "(looping)" }
    );
    println!();

    let rpc = SuiRpcClient::for_network(Network::Testnet);
    loop {
        if let Err(e) = scan_and_redeem(&cfg, &rpc, args.dry_run, args.manager_scan).await {
            eprintln!("scan err: {e:#}");
        }
        if args.once {
            break;
        }
        tokio::time::sleep(cfg.scan_interval).await;
    }
    Ok(())
}

async fn scan_and_redeem(
    cfg: &Config,
    rpc: &SuiRpcClient,
    dry_run: bool,
    manager_scan: usize,
) -> Result<()> {
    let started = std::time::Instant::now();

    // 1) Catalog → settled oracles only.
    let cat = PredictCatalog::default();
    let oracles = cat.list().await?;
    let settled: Vec<(String, Decimal)> = oracles
        .iter()
        .filter(|o| matches!(o.status, OracleStatus::Settled))
        .filter_map(|o| {
            o.settlement_price
                .map(|p| (o.oracle_id.clone(), Decimal::from(p) / Decimal::from(1_000_000_000u64)))
        })
        .collect();

    // 2) Discover managers + their open positions.
    let managers = discover_managers(rpc, manager_scan).await?;
    let mut all_positions = Vec::new();
    for m in &managers {
        if let Ok(ps) = read_manager_positions(rpc, &m.manager_id).await {
            all_positions.extend(ps);
        }
    }
    let candidates = find_redemption_candidates(&all_positions, &settled);
    let winning: Vec<_> = candidates
        .into_iter()
        .filter(|c| c.wins && c.position.quantity >= cfg.min_payout_atomic)
        .collect();

    println!(
        "[{:>4}s]  scanned {} mgrs · {} positions · {} winners ≥ min · {} settled oracles",
        started.elapsed().as_secs(),
        managers.len(),
        all_positions.len(),
        winning.len(),
        settled.len(),
    );

    if winning.is_empty() {
        return Ok(());
    }

    // 3) Group winners by oracle (PTB locks `&mut oracle` so we can't mix).
    use std::collections::HashMap;
    let mut by_oracle: HashMap<String, Vec<_>> = HashMap::new();
    for w in winning {
        by_oracle
            .entry(w.position.oracle_id.clone())
            .or_default()
            .push(w);
    }

    // 4) For each oracle, chunk + submit.
    for (oracle_id, mut group) in by_oracle {
        // Lookup the oracle's mfg expiry for MarketKey reconstruction
        let oracle_cat = oracles
            .iter()
            .find(|o| o.oracle_id == oracle_id)
            .ok_or_else(|| anyhow!("catalog miss for oracle {oracle_id}"))?
            .clone();
        // Process in chunks
        while !group.is_empty() {
            let take = group.len().min(cfg.max_per_ptb);
            let chunk: Vec<_> = group.drain(..take).collect();
            let cmd_args =
                build_ptb_args(cfg, &oracle_id, oracle_cat.expiry, &chunk);
            if dry_run {
                println!();
                println!(
                    "DRY-RUN  oracle={} chunk={} (would call sui client {})",
                    &oracle_id[..18],
                    chunk.len(),
                    cmd_args.join(" ")
                );
                continue;
            }
            match run_sui_ptb(&cmd_args) {
                Ok(digest) => println!(
                    "  ✓ redeemed {} positions on {} → tx {digest}",
                    chunk.len(),
                    &oracle_id[..18]
                ),
                Err(e) => eprintln!(
                    "  ✗ ptb failed for oracle {}: {e:#}",
                    &oracle_id[..18]
                ),
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }
    Ok(())
}

/// Build the `sui client ptb …` arg list for one chunk of redemptions on one oracle.
/// Each redemption needs: market_key::new() → assign → redeem_permissionless(…, key).
fn build_ptb_args(
    cfg: &Config,
    oracle_id: &str,
    oracle_expiry_ms: u64,
    chunk: &[o88_data::RedemptionCandidate],
) -> Vec<String> {
    let mut args: Vec<String> = vec!["client".into(), "ptb".into()];
    let gas_budget = DEFAULT_GAS_BUDGET + PER_REDEEM_GAS_ADD * (chunk.len() as u64).saturating_sub(1);
    for (i, c) in chunk.iter().enumerate() {
        let p = &c.position;
        let varname = format!("k{i}");
        // market_key::new(oracle_id: ID, expiry: u64, strike: u64, is_up: bool)
        args.push("--move-call".into());
        args.push(format!("{}::market_key::new", cfg.predict_pkg));
        args.push(format!("@{oracle_id}"));
        args.push(format!("{oracle_expiry_ms}u64"));
        args.push(format!("{}u64", p.strike));
        args.push(if p.is_up { "true".into() } else { "false".into() });
        args.push("--assign".into());
        args.push(varname.clone());

        // predict::redeem_permissionless<DUSDC>(predict, manager, oracle, key, qty, clock, ctx)
        args.push("--move-call".into());
        args.push(format!(
            "{}::predict::redeem_permissionless<{}>",
            cfg.predict_pkg, cfg.dusdc_type
        ));
        args.push(format!("@{}", cfg.predict_obj));
        args.push(format!("@{}", p.manager_id));
        args.push(format!("@{oracle_id}"));
        args.push(varname);
        args.push(format!("{}u64", p.quantity));
        args.push("@0x6".into());
    }
    args.push("--gas-budget".into());
    args.push(gas_budget.to_string());
    args
}

/// Run `sui` with the given args and try to extract the tx digest from stdout.
fn run_sui_ptb(args: &[String]) -> Result<String> {
    let out = Command::new("sui")
        .args(args)
        .output()
        .context("spawn sui client ptb")?;
    if !out.status.success() {
        return Err(anyhow!(
            "sui exited {}: stderr={}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    // sui prints something like "Transaction Digest: <base58>"; extract it.
    for line in stdout.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("Transaction Digest:") {
            return Ok(rest.trim().to_string());
        }
    }
    Ok("(no digest parsed, but tx succeeded)".into())
}

// Ensure the unused `SUI_COIN_TYPE` doesn't trip dead-code warnings — used for
// future balance-precondition checks.
#[allow(dead_code)]
const _RESERVED: &str = SUI_COIN_TYPE;
