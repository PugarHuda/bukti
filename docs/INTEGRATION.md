# Integrating Bukti — gate capital by PROOF in 3 lines

Bukti exposes zk-verified, risk-adjusted trading track records as an on-chain primitive
on Mantle. Any vault, lender, copy-trading protocol, or agent framework can read it.

## Contracts (Mantle Sepolia, 5003 — all source-verified)

| Contract | Address |
|---|---|
| `BuktiAttestation` | `0x2EB832F24136c24A3B38D4b06D3318C48B618163` |
| SP1 Groth16 Verifier v6.1.0 | `0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A` |
| `GatedVault` (reference consumer) | `0x851C251411Fe4F4bab586F775c7450f86A348EAD` |

## Solidity — the 3-line gate

```solidity
interface IBukti {
    function getSharpeMilli(address wallet) external view returns (int64 sharpeMilli, bool exists);
}

// inside your protocol:
(int64 score, bool proven) = IBukti(0x2EB832F24136c24A3B38D4b06D3318C48B618163).getSharpeMilli(agent);
require(proven && score >= 500, "no proven track record"); // 500 = score 0.5
```

Full record (drawdown, ROI, volume, window, anchor):

```solidity
struct Attestation {
    bytes32 anchorBlockHash; uint64 windowStart; uint64 windowEnd; uint32 numTrades;
    int64 sharpeMilli; uint32 maxDrawdownBps; int64 roiBps; uint64 volumeUsdE6;
    uint64 attestedAt; address attester; bool exists;
}
function getAttestation(address wallet) external view returns (Attestation memory);
```

See [`GatedVault.sol`](../contracts/src/GatedVault.sol) for a complete consumer (live on
Sepolia: top scorer approved on-chain, losers revert `SharpeBelowThreshold`).

## TypeScript (viem)

```ts
import { createPublicClient, http, parseAbi } from "viem";

const client = createPublicClient({ transport: http("https://rpc.sepolia.mantle.xyz") });
const [scoreMilli, proven] = await client.readContract({
  address: "0x2EB832F24136c24A3B38D4b06D3318C48B618163",
  abi: parseAbi(["function getSharpeMilli(address) view returns (int64, bool)"]),
  functionName: "getSharpeMilli",
  args: [agent],
});
```

## Events (indexing / leaderboards)

```solidity
event AttestationSubmitted(
    address indexed wallet, address indexed attester,
    int64 sharpeMilli, uint32 maxDrawdownBps, int64 roiBps,
    uint64 volumeUsdE6, bytes32 anchorBlockHash
);
```

One `submitBatchAttestation` emits this per wallet — our live leaderboard is built
purely from these events.

## AI agents (MCP)

See [MCP.md](MCP.md) — agents query `bukti_get_verified_score` /
`bukti_check_vault_eligibility` before trusting any trader.

## ERC-8004 (Mantle's agent trust layer)

When an agent registers its ERC-8004 identity (and links its trading wallet via
`setAgentWallet`), Bukti writes the proven score into the canonical
`ReputationRegistry` as `giveFeedback(agentId, scoreMilli, 3, "bukti-score",
"per-trade-sharpe", …, anchorHash)` — demonstrated live with agent **#137**
([register tx](https://sepolia.mantlescan.xyz/tx/0xe50aaf7807a43be77603f6462614fcc36c9e91afc0fc3b5897cd3f402ad1f438),
[feedback tx](https://sepolia.mantlescan.xyz/tx/0xf44b6d62e80ab8e6e8f09b7da31f1975b3ea58269d66beb7fb1d3c44480464f7)).
We deliberately do **not** mass-register identities for wallets we don't control —
ERC-8004 identity belongs to the agent; Bukti supplies the *proof-backed reputation*
once the agent opts in.

## Trust model

The Groth16 proof (verified by the real SP1 v6.1.0 verifier — invalid proofs revert
`WrongVerifierSelector`) guarantees the metrics are the correct output of the public
reconstruction program over the committed witness. Data provenance is anchored to a
Mantle block hash (relayer-asserted in the MVP; in-circuit receipt proofs on the
roadmap). The program's vkey is pinned on-chain: only proofs of *this exact program*
are accepted.
