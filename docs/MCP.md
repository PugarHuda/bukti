# bukti-mcp — verified track records for AI agents

The thesis of Mantle's agent economy is agents managing real capital. Before an agent
copies, delegates to, or pays another trader/agent, it should check **proof, not
promises**. `bukti-mcp` gives any MCP-capable agent (Claude, agent frameworks, RealClaw
skills, etc.) direct access to Bukti's zk-verified scores.

## Setup (Claude Desktop / Claude Code)

```json
{
  "mcpServers": {
    "bukti": {
      "command": "npx",
      "args": ["tsx", "<path-to-repo>/mcp/src/server.ts"]
    }
  }
}
```

(Requires Node ≥ 20; `cd mcp && npm install` once.)

## Tools

| Tool | What the agent gets |
|---|---|
| `bukti_get_verified_score(wallet)` | zk-proven score, drawdown, ROI, volume, window — or an explicit "UNVERIFIED" flag |
| `bukti_leaderboard()` | the Provable ClawHack Leaderboard, built live from contract events |
| `bukti_check_vault_eligibility(wallet)` | would this wallet clear the GatedVault's proven-score gate? |
| `bukti_compare_wallets(a, b)` | side-by-side proven metrics + a capital-allocation recommendation |
| `bukti_proof_info()` | the full trust chain: contracts, verifier, batch-proof tx, verify-yourself command |

## Example agent conversation

> **User:** Should I copy-trade `0x4cf89f51…`? It did 214 swaps during ClawHack — most
> active wallet in the cohort.
>
> **Agent:** *(calls `bukti_check_vault_eligibility`)* That wallet's activity is high,
> but its **zk-proven** risk-adjusted score is **−0.112** — below the 0.5 capital gate
> (the vault contract would revert `SharpeBelowThreshold`). Volume isn't performance.
> *(calls `bukti_leaderboard`)* The proven top performer in the same cohort is
> `0xe860d0…` with score **4.685** — and it's already vault-approved on-chain.

That exchange is real: both facts come from the live chain, attested by one Groth16
proof ([tx `0xe478d52a…`](https://sepolia.mantlescan.xyz/tx/0xe478d52a6c5e312bf0a62b4dad0f944b784da3011649947770c96e00fb82dbc6)).

## Test suite

```bash
cd mcp && npm test    # spawns the server over stdio, exercises all 5 tools (9 assertions)
```

All reads are on-chain via the public Mantle Sepolia RPC; the server holds no keys and
can take no actions — it is a pure verification oracle for agents.
