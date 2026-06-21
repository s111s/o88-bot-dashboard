//! Minimal Sui JSON-RPC client. Just the methods o88 actually uses.
//!
//! We deliberately don't depend on the heavyweight `sui-sdk` crate — it pulls in
//! the Move VM and 800+ transitive deps. For read-only RPC, raw `reqwest` + JSON
//! is faster to compile and easier to keep working across Sui releases.

use anyhow::{Context, Result, anyhow};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

const MAINNET_RPC: &str = "https://fullnode.mainnet.sui.io:443";
const TESTNET_RPC: &str = "https://fullnode.testnet.sui.io:443";

#[derive(Debug, Clone, Copy)]
pub enum Network {
    Mainnet,
    Testnet,
}

impl Network {
    pub fn default_rpc(self) -> &'static str {
        match self {
            Network::Mainnet => MAINNET_RPC,
            Network::Testnet => TESTNET_RPC,
        }
    }
}

#[derive(Clone)]
pub struct SuiRpcClient {
    http: reqwest::Client,
    url: String,
}

impl SuiRpcClient {
    pub fn new(url: impl Into<String>) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("reqwest client"),
            url: url.into(),
        }
    }

    pub fn for_network(network: Network) -> Self {
        Self::new(network.default_rpc())
    }

    /// Generic JSON-RPC call. Returns the `result` field.
    pub async fn call(&self, method: &str, params: Value) -> Result<Value> {
        let body = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });
        let resp: Value = self
            .http
            .post(&self.url)
            .json(&body)
            .send()
            .await
            .with_context(|| format!("POST {} {}", method, self.url))?
            .json()
            .await
            .with_context(|| format!("decode response for {}", method))?;
        if let Some(err) = resp.get("error") {
            return Err(anyhow!("rpc error from {}: {}", method, err));
        }
        resp.get("result")
            .cloned()
            .ok_or_else(|| anyhow!("no `result` in response: {}", resp))
    }

    /// `sui_getObject` with showType + showOwner + showContent. Returns the raw `data` field.
    pub async fn get_object(&self, object_id: &str) -> Result<Value> {
        let params = json!([object_id, {
            "showType": true,
            "showOwner": true,
            "showContent": true,
        }]);
        let res = self.call("sui_getObject", params).await?;
        res.get("data")
            .cloned()
            .ok_or_else(|| anyhow!("no `data` in getObject response: {}", res))
    }

    /// Deserialize a `sui_getObject` response into the supplied type via the `content.fields` shape.
    /// Suitable for shared objects with a known Move struct.
    pub async fn get_object_fields<T: DeserializeOwned>(&self, object_id: &str) -> Result<T> {
        let data = self.get_object(object_id).await?;
        let fields = data
            .pointer("/content/fields")
            .cloned()
            .ok_or_else(|| anyhow!("no /content/fields in {}", data))?;
        serde_json::from_value(fields).with_context(|| "decode fields")
    }

    /// Total balance for a coin type, in atomic units.
    /// `coin_type` examples: `"0x2::sui::SUI"` or `"0xpkg::dusdc::DUSDC"`.
    pub async fn get_balance(&self, owner: &str, coin_type: &str) -> Result<u128> {
        let params = json!([owner, coin_type]);
        let res = self.call("suix_getBalance", params).await?;
        let total = res
            .get("totalBalance")
            .and_then(Value::as_str)
            .ok_or_else(|| anyhow!("no totalBalance in {}", res))?;
        total.parse::<u128>().context("parse totalBalance")
    }
}
