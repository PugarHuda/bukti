# Bukti — Business one-pager

**Category:** Proof-of-Real-PnL — the chain-authenticity layer for agent reputation.
**One line:** Bukti makes a trading track record mathematically impossible to fake, and routes
capital only to the ones proven real.

## The problem (why now)
The agent economy is being built on self-reported reputation. Every AI trading agent claims a
record; none can prove it. Screenshots are edited, dashboards are "trust me," and on-chain
"reputation" is self-attested. Capital — copy-trading, vault deposits, allocator mandates,
agent-to-agent credit — flows on adverse selection. As Mantle issues ERC-8004 identities to a
"verifiable workforce of agents managing real capital," the missing piece is a record that can't
be faked. That's Bukti.

## What we sell
A **verifiable reputation primitive**, not an app. Other protocols read one on-chain call.
- **Per-attestation fee** (in MNT): a protocol pays to score a wallet/agent. One Groth16 proof
  scores a whole cohort, so marginal cost per scored agent ≈ 0 — we monetize the *need to prove*.
- **Continuous re-scoring subscription**: keep a roster of agents/wallets fresh.
- **Verified report export**: a due-diligence artifact for funds/allocators.
- **Proof-gated access (x402)**: endpoints/actions that require a proven score to unlock — we take
  the rails fee.

## Who pays, in priority order
1. **Agent-vault curators & copy-trading platforms on Mantle** — they need a capital gate they can
   show *their* users (3-line integration: `getSharpeMilli()` in the deposit path).
2. **On-chain lenders / underwriters** — undercollateralized agent credit keyed on a proven record.
3. **Funds & allocators** vetting AI trading agents — verified reports for diligence.
4. **Agent marketplaces** (Virtuals ACP-style "evaluator" share, ERC-8004 reputation consumers).

## Market
Every dollar currently allocated on trust or a screenshot is the TAM. Agentic-commerce volume is
projected at \$8B in 2026 → \$3.5T by 2031; institutional on-chain indices (Mantle's MI4 ≈ \$173M)
already route real capital by *committee* — Bukti routes it by *proof*. We're the underwriting
layer the agent economy is broken without.

## Go-to-market
Land **one reference integration** — a Mantle copy-trading or agent-vault protocol that calls
`getSharpeMilli()` in its deposit path — then expand across the ERC-8004 agent registry as the
distribution rail. Each new agent in the economy *needs* to prove itself; we grow with the registry.

## Moat / defensibility
- **Uncontested technical lane:** no other entry proves risk-adjusted track records in a zkVM, and
  none proves the *data is genuine chain data* (our receipt-trie + EIP-2935 crack). ZK-PnL tools
  (CapCheck, CallScan) trust their input; we don't.
- **Composable lock-in:** once a vault/marketplace gates on a Bukti score, switching means
  re-instrumenting capital flows.
- **Unit economics:** one proof scores a cohort → marginal cost ≈ 0; an optional attester-staking
  layer (slashed on a successful ZK challenge) hardens trust as volume grows.

## Why Mantle, why this team
We use SP1 — the same zkVM that secures Mantle via OP-Succinct — and Mantle-native data; the proof
layer is live on Mantle Sepolia today. Solo-built end-to-end (circuit → on-chain verifier →
allocator → MCP → web) — a signal of how cheaply this scales.
