//! Phase-1 de-risk: rebuild a real Mantle block's receipts trie locally and check the root
//! matches header.receipts_root. Mantle is OP-stack → block 0 is a type-0x7E deposit
//! receipt; we decode receipts with op-alloy types so the encoding matches.
//!
//!   cargo run --release -- <blockNumber>

use alloy_eips::eip2718::Encodable2718;
use alloy_primitives::B256;
use alloy_provider::{Provider, ProviderBuilder};
use alloy_rlp::Encodable;
use alloy_rpc_types_eth::BlockNumberOrTag;
use alloy_trie::{HashBuilder, Nibbles};
use op_alloy_rpc_types::OpTransactionReceipt;
use std::env;

const RPC: &str = "https://rpc.mantle.xyz";

#[tokio::main]
async fn main() -> eyre::Result<()> {
    let block_num: u64 = env::args().nth(1).unwrap_or_else(|| "96483631".into()).parse()?;
    let provider = ProviderBuilder::new().connect(RPC).await?;

    let block = provider
        .get_block_by_number(BlockNumberOrTag::Number(block_num))
        .await?
        .ok_or_else(|| eyre::eyre!("block not found"))?;
    let expected_root = block.header.receipts_root;
    println!("block {block_num}");
    println!("header.receipts_root = {expected_root}");

    // Fetch OP receipts via raw RPC (avoids the op-alloy-network trait conflict).
    let receipts: Vec<OpTransactionReceipt> = provider
        .client()
        .request("eth_getBlockReceipts", (BlockNumberOrTag::Number(block_num),))
        .await?;
    println!("receipts: {}", receipts.len());

    // EIP-2718 typed-envelope bytes per receipt = the trie leaf value.
    let encoded: Vec<Vec<u8>> = receipts
        .iter()
        .map(|r| {
            // rpc receipt envelope carries rpc Logs; convert to consensus Logs for 2718.
            let consensus = r.inner.inner.clone().map_logs(|l| l.inner);
            let mut out = Vec::new();
            consensus.encode_2718(&mut out);
            out
        })
        .collect();

    // Build the trie via HashBuilder in ascending-index nibble order.
    let mut indexed: Vec<(Nibbles, &Vec<u8>)> = encoded
        .iter()
        .enumerate()
        .map(|(i, v)| {
            let mut k = Vec::new();
            (i as u64).encode(&mut k);
            (Nibbles::unpack(&k), v)
        })
        .collect();
    indexed.sort_by(|a, b| a.0.cmp(&b.0));
    let mut hb = HashBuilder::default();
    for (k, v) in &indexed {
        hb.add_leaf(k.clone(), v);
    }
    let root: B256 = hb.root();
    println!("rebuilt root         = {root}");
    println!("MATCH = {}", root == expected_root);

    // Diagnostics: per-receipt type byte + length (0x7e = OP deposit receipt).
    for (i, e) in encoded.iter().enumerate() {
        let tb = e.first().copied().unwrap_or(0);
        println!("  receipt[{i}] type=0x{tb:02x} len={}", e.len());
    }
    Ok(())
}
