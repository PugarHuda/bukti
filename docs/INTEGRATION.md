# Bukti — Integration Guide (use Bukti from another project)

Bukti turns a wallet/agent's realized trading record into a **single on-chain number any
contract or service can trust** — proven in a zkVM, not self-reported. Four ways to consume it:
**read a proven score on-chain**, **gate/route by proof**, **embed a badge**, and **verify a
proof yourself**. Everything is a public read — no API key, no account.

- **Chain:** Mantle Sepolia (chainId `5003`) · RPC `https://rpc.sepolia.mantle.xyz`
- **Underlying data:** Mantle mainnet swaps (Agni/FusionX), historical Pyth prices
- **Score unit:** `sharpeMilli` = risk-adjusted score × 1000 (int64). e.g. `4685` → 4.685

## Deployed contracts (all source-verified on Mantlescan)

| Contract | Address | Read it for |
|---|---|---|
| BuktiAttestation (105-wallet cohort) | `0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9` | a wallet's proven score |
| BuktiAttestation v3 (+completeness) | `0x03fA99f0dE08F182b2880Ee12a2194DBF00a0Dbf` | score + swapsRoot commitment |
| BuktiProvenance | `0xa4d6d9932B19f9B03D0439264F1188F39F8522f0` | "is this swap genuine chain data?" |
| BuktiFullProof | `0xC16f221d8bae221A7B5B3ca74DCDCb892B9067FB` | metric proven over genuine data |
| BuktiAllocator | `0xa2D2E87367A5cEB1c10B02952fD1e5d375b4b5B9` | capital split by proof |
| BuktiValidator (ERC-8004) | `0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0` | ZK validation responses |
| GatedVault (reference consumer) | `0x851C251411Fe4F4bab586F775c7450f86A348EAD` | proof-gated deposits |
| SP1 Groth16 Verifier v6.1.0 | `0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A` | verify any Bukti proof |

---

## 1. Read a wallet's proven score (the core API — the 3-line gate)

```solidity
interface IBukti {
    function getSharpeMilli(address wallet) external view returns (int64 sharpeMilli, bool exists);
}

// inside your protocol:
(int64 score, bool proven) = IBukti(0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9).getSharpeMilli(agent);
require(proven && score >= 500, "Bukti: no proven track record"); // 500 == score 0.5
```

Full record (drawdown, ROI, volume, window, anchor):

```solidity
struct Attestation {
    bytes32 anchorBlockHash; uint64 windowStart; uint64 windowEnd; uint32 numTrades;
    int64 sharpeMilli; uint32 maxDrawdownBps; int64 roiBps; uint64 volumeUsdE6;
    bytes32 swapsRoot; uint32 numSwaps; uint64 attestedAt; address attester; bool exists;
}
function getAttestation(address wallet) external view returns (Attestation memory);
```

**viem (TypeScript):**

```ts
import { createPublicClient, http, parseAbi } from "viem";
const client = createPublicClient({ transport: http("https://rpc.sepolia.mantle.xyz") });
const [scoreMilli, proven] = await client.readContract({
  address: "0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9",
  abi: parseAbi(["function getSharpeMilli(address) view returns (int64,bool)"]),
  functionName: "getSharpeMilli", args: [agent],
});
const score = Number(scoreMilli) / 1000; // e.g. 4.685
```

**cast (CLI):**

```bash
cast call 0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9 \
  "getSharpeMilli(address)(int64,bool)" 0xe860d04da18b968efcbbbee4133ec12fe0f14dc3 --rpc-url https://rpc.sepolia.mantle.xyz
```

See [`GatedVault.sol`](../contracts/src/GatedVault.sol) for a complete consumer (live on Sepolia:
top scorer approved on-chain, losers revert `SharpeBelowThreshold`).

---

## 2. Is a swap genuine Mantle chain data? (provenance — the differentiator)

Don't just trust a number; check the *trades* are real. `getProven` returns true only if a
Groth16 proof established that a swap log is included in a real Mantle block (receipt-trie
inclusion under the block's `receiptsRoot`, anchored trustlessly via EIP-2935 — **no relayer,
no trusted indexer**).

```solidity
interface IBuktiProvenance {
    struct ProvenanceOutput { bytes32 blockHash; uint32 txIndex; address pool; bool included; }
    function getProven(bytes32 blockHash, uint32 txIndex) external view returns (ProvenanceOutput memory);
}
```

```bash
cast call 0xa4d6d9932B19f9B03D0439264F1188F39F8522f0 \
  "getProven(bytes32,uint32)((bytes32,uint32,address,bool))" <blockHash> <txIndex> \
  --rpc-url https://rpc.sepolia.mantle.xyz
```

**BuktiFullProof** goes further — a metric computed over swaps EACH proven genuine, in one proof:

```bash
cast call 0xC16f221d8bae221A7B5B3ca74DCDCb892B9067FB \
  "latest()(uint32,uint64,bytes32,bool)" --rpc-url https://rpc.sepolia.mantle.xyz
# -> numSwaps, totalVolumeUsdE6, firstBlockHash, allIncluded
cast call 0xC16f221d8bae221A7B5B3ca74DCDCb892B9067FB "proofCount()(uint256)" --rpc-url ...
```

---

## 3. Route capital / gate access by proof

**BuktiAllocator** — preview how capital splits across candidates by proven score (losers get 0):

```solidity
interface IBuktiAllocator {
    function previewAllocation(address[] calldata candidates, uint256 amount)
        external view returns (uint256[] memory weightsBps, uint256[] memory amounts);
}
```

**GatedVault** — deposits revert unless the depositor's proven score clears the threshold. Point
your product at it, or copy the one-line `require` from §1.

---

## 4. Verify a Bukti proof yourself (don't trust, verify)

Every attestation is backed by a real Groth16 proof the on-chain SP1 verifier accepts. Re-verify
any proof with a plain `eth_call` — a valid proof returns, a tampered one reverts.

```ts
await client.readContract({
  address: "0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A",
  abi: parseAbi(["function verifyProof(bytes32 vkey, bytes publicValues, bytes proof) view"]),
  functionName: "verifyProof", args: [vkey, publicValues, proof],
}); // resolves = VALID ; throws = REJECTED
```

Public-values ABI (decode the proven outputs yourself):

```solidity
struct BuktiOutput { address wallet; int64 sharpeMilli; uint32 numTrades; uint32 numSwaps; }      // attestation
struct FullOutput  { uint32 numSwaps; uint64 totalVolumeUsdE6; bytes32 firstBlockHash; bool allIncluded; } // full proof
```

---

## 5. Events (indexing / leaderboards)

```solidity
event AttestationSubmitted(
    address indexed wallet, address indexed attester,
    int64 sharpeMilli, uint32 maxDrawdownBps, int64 roiBps,
    uint64 volumeUsdE6, bytes32 anchorBlockHash
);
```

One `submitBatchAttestation` emits this per wallet — the live leaderboard is built purely from
these events.

---

## 6. HTTP surfaces (no chain calls needed)

| Endpoint | Returns |
|---|---|
| `GET /badge/<addr>` | live SVG score badge (embed in a README or profile) |
| `GET /api/gate/<addr>` | x402 proof-gate: HTTP **402** if score < 0.5, **200** otherwise |
| `GET /board-data.json` | the full proven leaderboard (scores == on-chain values) |
| `GET /proof-fixture.json` | a real `{vkey, publicValues, proof}` for in-browser verification |

Base URL: `https://bukti-smoky.vercel.app`. Embed the badge in markdown:

```md
![Bukti score](https://bukti-smoky.vercel.app/badge/0xe860d04da18b968efcbbbee4133ec12fe0f14dc3)
```

---

## 7. For AI agents — MCP server

`bukti-mcp` exposes the same proofs as agent tools (stdio MCP) — see [MCP.md](MCP.md):

| Tool | Purpose |
|---|---|
| `bukti_get_verified_score` | a wallet's proven score (read live from chain) |
| `bukti_leaderboard` | the proven ranking |
| `bukti_check_vault_eligibility` | does this wallet clear the proof gate? |
| `bukti_compare_wallets` | A vs B by proven score (catch the fake) |
| `bukti_proof_info` | the live proof / vkey / verifier metadata |

```jsonc
// claude_desktop_config.json (or any MCP client)
{ "mcpServers": { "bukti": { "command": "node", "args": ["mcp/dist/server.js"] } } }
```

---

## 8. ERC-8004 (Mantle's agent reputation / validation registries)

Bukti is the drop-in **ZK validator** for Mantle's ERC-8004 Validation Registry (spec'd for
ZK-based validation, ships empty). When an agent registers its ERC-8004 identity and links its
trading wallet via `setAgentWallet`, Bukti writes the proven score into the canonical
`ReputationRegistry` as `giveFeedback(agentId, scoreMilli, 3, "bukti-score", "per-trade-sharpe",
…, anchorHash)` — demonstrated live with agent **#137**
([register tx](https://sepolia.mantlescan.xyz/tx/0xe50aaf7807a43be77603f6462614fcc36c9e91afc0fc3b5897cd3f402ad1f438),
[feedback tx](https://sepolia.mantlescan.xyz/tx/0xf44b6d62e80ab8e6e8f09b7da31f1975b3ea58269d66beb7fb1d3c44480464f7)).
We deliberately do **not** mass-register identities for wallets we don't control — ERC-8004
identity belongs to the agent; Bukti supplies the *proof-backed reputation* once it opts in.

---

## Trust model

The Groth16 proof (verified by the real SP1 v6.1.0 verifier — invalid proofs revert) guarantees
the metrics are the correct output of the public reconstruction program over the committed
witness, and the program's vkey is pinned on-chain (only proofs of *this exact program* are
accepted). **Data provenance is itself proven on-chain** (BuktiProvenance): each swap log is shown
included in a real Mantle block via receipt-trie inclusion + EIP-2935 anchoring — not relayer-
asserted. The remaining trust boundary is published and kept current at
[/dashboard/trust](https://bukti-smoky.vercel.app/dashboard/trust).

---

### One-paragraph summary for your README

> We gate/rank by **Bukti** — a zkVM-proven trading track record on Mantle. We call
> `getSharpeMilli(wallet)` on `0x2EB8…8163`; a wallet only passes if it has an on-chain Groth16
> attestation whose underlying swaps are proven genuine Mantle chain data. No screenshots, no
> trusted indexer. Verify any score yourself at bukti-smoky.vercel.app/dashboard/proof.
