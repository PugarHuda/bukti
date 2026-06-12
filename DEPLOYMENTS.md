# Bukti — Deployments

## 🏆 Headline: the Provable ClawHack Leaderboard (v2, current)

During this hackathon's own Phase 1 ("ClawHack", Apr 15–30 2026), hundreds of AI agents
traded on Mantle — ranked by a leaderboard you had to *trust*. Bukti re-ran that cohort
**provably**: 382 wallets discovered in the window, the top 25 scored from 626 raw Agni
swap legs (historical Pyth pricing), reconstructed inside the SP1 zkVM, and attested with
**ONE 714-byte Groth16 proof** verified on-chain.

| Item | Value |
|---|---|
| **BuktiAttestation v2 (batch)** | [`0x2EB832F24136c24A3B38D4b06D3318C48B618163`](https://sepolia.mantlescan.xyz/address/0x2EB832F24136c24A3B38D4b06D3318C48B618163) — wired to the **real** SP1 v6.1.0 verifier |
| **GatedVault v2** | [`0x851C251411Fe4F4bab586F775c7450f86A348EAD`](https://sepolia.mantlescan.xyz/address/0x851C251411Fe4F4bab586F775c7450f86A348EAD) |
| **Batch attestation tx (25 wallets, 1 real proof)** | [`0xe478d52a…`](https://sepolia.mantlescan.xyz/tx/0xe478d52a6c5e312bf0a62b4dad0f944b784da3011649947770c96e00fb82dbc6) |
| Program vkey (batch) | `0x001519bd647490bda9c351ff1809e4adc8bf42f68564f95b21d3ec1229bba8ac` |
| Cohort window | mainnet blocks 94,040,444 → 94,731,644 (Apr 15–30 2026) |
| Proof economics | 25 wallets, 1,279,532 cycles, proof still 714 bytes — marginal wallet ≈ free |
| Fixture | `contracts/src/fixtures/groth16-clawhack-batch.json` |

Live leaderboard (event-driven): https://bukti-smoky.vercel.app

## Mantle Sepolia (chainId 5003) — v1 history (superseded)

| Contract | Address |
|---|---|
| **BuktiAttestation** | [`0x7b0A5E9D4A8b1bf2829478e72f62283C6939C816`](https://sepolia.mantlescan.xyz/address/0x7b0A5E9D4A8b1bf2829478e72f62283C6939C816) |
| **SP1 Groth16 Verifier v6.1.0 (REAL)** | [`0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A`](https://sepolia.mantlescan.xyz/address/0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A) |
| GatedVault (composability demo) | [`0x5e6b9242Db15959EdCEccBa5C369fca3576fd598`](https://sepolia.mantlescan.xyz/address/0x5e6b9242Db15959EdCEccBa5C369fca3576fd598) |
| SP1MockVerifier (superseded placeholder) | [`0xE80AF60bF8ca81f711dB1bD16eEF7C823AF7228a`](https://sepolia.mantlescan.xyz/address/0xE80AF60bF8ca81f711dB1bD16eEF7C823AF7228a) |

### 🔐 REAL Groth16 proof verified on-chain
The mock era is over — `BuktiAttestation` now points at the **real SP1 v6.1.0 Groth16 verifier**:

| Step | Evidence |
|---|---|
| Groth16 proof generated **locally, $0** (8 GB RAM + 28 GB swap, SP1 native-gnark, ~75 min) | `contracts/src/fixtures/groth16-fixture.json` |
| Verifier rotation (`setVerifier` → real) | tx [`0x42baa6f2…`](https://sepolia.mantlescan.xyz/tx/0x42baa6f2c27eb00e227bc6c36c4062f9fbaf938cbdef6812c73ae068ee13d556) |
| **Attestation submitted with the REAL proof, verified on-chain** | tx [`0x9e224886…`](https://sepolia.mantlescan.xyz/tx/0x9e224886bff63bc4d50e9d184b977430cd8ae7744e9ce3f81a124c520635f0b9) |
| Negative control: junk proof **rejected** | revert `WrongVerifierSelector(0xdeadbeef, 0x4388a21c)` |

- Deployer: `0x39D2bae5EAedA9283535dDC98F1991c81eD5Cd7E`
- Program vkey (v2: in-circuit cost-basis PnL reconstruction, integer math): `0x00dc2fa887b1c394893cfdb809ea60e4d6af5a303ba1ebe8e25f7e3cab8298c9`

### Real-data attestation (Mantle mainnet trader)
- Wallet scored: `0x4cf89f51e090d6dcddbbbe5a458a01e9061823c5` — 11 raw Agni swap legs (mainnet), Pyth Benchmarks historical pricing, anchor block `0x206091f6…`
- Result: score **−1.316** (×1000 = −1316), max drawdown **1.25%**, ROI **−1.25%**, volume **$25.13**, 5 realized trades
- Attestation tx: [`0x8b90c36e…`](https://sepolia.mantlescan.xyz/tx/0x8b90c36ef1b09904c39022e56ce0530be8c75f94168bc64c9a1bb93f4ab312f7) · read back via `getSharpeMilli` → `(-1316, true)`

### GatedVault composability demo — live on-chain
Capital gated by *proven* score (threshold: 500 = 0.5):

| Action | Result |
|---|---|
| Sample agent `0x1111…1111` (score **0.533**) attested | tx [`0xe9572a52…`](https://sepolia.mantlescan.xyz/tx/0xe9572a524706f5595611e16ccd2f69f11efd698b1a736208512a90fead943e75) |
| `approveAgent(0x1111…)` → **APPROVED** ✓ | tx [`0x0fd64966…`](https://sepolia.mantlescan.xyz/tx/0x0fd649667263c9742e73e6e1b11296e86e32fcdab600ecb8698a965424682638), `approvedAgent` → `true` |
| `approveAgent(0x4cf8…)` (real trader, score **−1.316**) → **REJECTED** | on-chain revert `SharpeBelowThreshold(-1316, 500)` |

### ERC-8004 integration (canonical registries on Mantle Sepolia)
Bukti writes its zkVM-reconstructed scores into Mantle's own ERC-8004 trust layer:

| Step | Detail |
|---|---|
| IdentityRegistry | [`0x8004A818BFB912233c491871b3d84c89A494BD9e`](https://sepolia.mantlescan.xyz/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) |
| Agent registered | **agentId 137**, agentURI → the Bukti attestation tx · register tx [`0xe50aaf78…`](https://sepolia.mantlescan.xyz/tx/0xe50aaf7807a43be77603f6462614fcc36c9e91afc0fc3b5897cd3f402ad1f438) |
| ReputationRegistry | [`0x8004B663056A597Dffe9eCcC1965A193B7388713`](https://sepolia.mantlescan.xyz/address/0x8004B663056A597Dffe9eCcC1965A193B7388713) |
| Feedback written | `giveFeedback(137, -1316, 3, "bukti-score", "per-trade-sharpe", …, anchorHash)` from client `0x9b16d752…` · tx [`0xf44b6d62…`](https://sepolia.mantlescan.xyz/tx/0xf44b6d62e80ab8e6e8f09b7da31f1975b3ea58269d66beb7fb1d3c44480464f7) |
| Verified read | `readFeedback(137, client, 1)` → `(-1316, 3, "bukti-score", "per-trade-sharpe", false)` |

> Mantle's ERC-8004 announcement describes the Validation Registry as "cryptographic proof of
> work completed — stake-secured or **ZK-based**" and the Reputation Registry as "portable
> track records". Bukti is that ZK-based scoring layer, live: zkVM-reconstructed metrics →
> on-chain attestation → ERC-8004 reputation.

### 🧩 ERC-8004 Validation Registry — the ZK validator (live, verified)
The Validation Registry's specified "ZK-based mechanism" shipped empty. `BuktiValidator` fills
it: it reads a wallet's zkVM-proven score from `BuktiAttestation` and answers a validation
request with a 0–100 response — a number only writable *after* a real Groth16 proof verified
on-chain. Negative/net-losing scores floor at 0; a per-trade information ratio of +5.0 saturates
at 100.

| Item | Value |
|---|---|
| **BuktiValidator** (Mantlescan-verified) | [`0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0`](https://sepolia.mantlescan.xyz/address/0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0#code) |
| **ReferenceValidationRegistry** (stand-in for Mantle's canonical registry; verified) | [`0x0954E50cBC85836C9E3FC6868d24b6118d974E9d`](https://sepolia.mantlescan.xyz/address/0x0954E50cBC85836C9E3FC6868d24b6118d974E9d#code) |
| Live read: `validationScore(0x48f1…)` (proof champion, score 4.265) | → `(85, true)` — read from the **real** attestation |
| Live read: `validationScore(0x4cf8…)` (losing trader, score −1.316) | → `(0, true)` |
| **Live validation tx** (`respondToValidation`, writes 85/100) | [`0x780bbaa8…`](https://sepolia.mantlescan.xyz/tx/0x780bbaa851bd7789e349a878fd6a8a07410a6efc44e415d8ce9bf01971a0847f) |
| Negative control | `respondToValidation` for an un-proven wallet **reverts** `NoProvenAttestation` |

On mainnet, `BuktiValidator.setRegistry(...)` repoints at Mantle's canonical ERC-8004 Validation
Registry — same `validationResponse(bytes32,uint8)` interface; the reference registry above only
exists so the bridge is verifiable on testnet today.

### 💸 BuktiAllocator — capital routed by ZK-proven skill (live, verified)
A proof of skill is inert until it moves money. `BuktiAllocator` splits a deposit across
candidate agents **weighted by their zk-proven score**; below-gate / net-losing / unproven
wallets receive zero. It's the on-chain analog of Mantle's MI4 index, but constituent
eligibility is a Groth16 proof, not a committee. Pull-payment design (recipients `withdraw`).

| Item | Value |
|---|---|
| **BuktiAllocator** (Mantlescan-verified, gate 0.5) | [`0x6DF2F45f9184346C175a94D783F37C77C8f3B8B2`](https://sepolia.mantlescan.xyz/address/0x6DF2F45f9184346C175a94D783F37C77C8f3B8B2#code) |
| `previewAllocation` of 1 MNT across champion / runner-up / volume-champion | weights `[4265, 949, 0]` → `[0.818, 0.182, 0.000]` MNT |
| **Live allocation tx** (0.01 MNT routed by proof) | [`0x559503d3…`](https://sepolia.mantlescan.xyz/tx/0x559503d328df13df28ba8ee61564046307d69f9341af557a5be0db04f9011db0) |
| Credited result | champion `0x48f1…` **81.8%**, runner-up `0x0a85…` **18.2%**, volume champion `0x4cf8…` (score −1.316) **0%** |

*MI4 is proven-beta for institutions; BuktiAllocator is proven-alpha — an index whose
constituents are admitted by a ZK proof of risk-adjusted skill.*

### Verification
All three contracts are **verified on Mantlescan** (source visible): [BuktiAttestation](https://sepolia.mantlescan.xyz/address/0x7b0A5E9D4A8b1bf2829478e72f62283C6939C816#code) · [GatedVault](https://sepolia.mantlescan.xyz/address/0x5e6b9242Db15959EdCEccBa5C369fca3576fd598#code) · [SP1MockVerifier](https://sepolia.mantlescan.xyz/address/0xE80AF60bF8ca81f711dB1bD16eEF7C823AF7228a#code)

### Notes
- Deploy command: `forge script script/Deploy.s.sol:Deploy --rpc-url $MANTLE_SEPOLIA_RPC --private-key $PRIVATE_KEY --broadcast --legacy`
- Previous iteration (under the working name "ProofSharpe") deployed at `0x481fE34e…` with attestation txs `0xe32278c9…` / `0x76449fb6…` — superseded by this Bukti deployment.
