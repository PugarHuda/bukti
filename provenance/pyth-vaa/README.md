# pyth-vaa-verify — proving Pyth prices inside a zkVM ("prices proven, not asserted")

> **Status:** isolated R&D module — **working & tested (4/4)**, not a scaffold. The full
> verification core (PNAU accumulator + Wormhole VAA parse, **13-of-19 guardian secp256k1
> quorum**, signed-Merkle inclusion, price decode) runs end-to-end against a **real** Hermes
> update and reproduces the exact price Hermes reports; a tampered body breaks the quorum.
> Folding it into the live batch circuit (behind SP1's secp256k1 + keccak precompiles) and
> re-proving is the scoped next step — kept out of `lib`/`program` for now so new crypto deps
> can never change the **deployed** batch vkey. (Wormhole rotated to guardian **set 6**; the
> set index is read from each VAA header, so production resolves it on-chain.)

## Why this matters

Bukti's metrics are computed in-circuit, but each swap leg is priced at a Pyth historical
price the **host asserts** (relayer-trusted). This module closes the *price-provenance* half of
Bukti's trust boundary: it proves the prices used were the exact values **signed by Wormhole's
guardians**, not numbers a relayer typed in.

To our knowledge, **guardian-signature + Pyth-accumulator verification has not been done inside
a zkVM before** — existing Wormhole/Pyth VAA verification always runs in a Solidity contract
(`ecrecover` on-chain). Phrase the claim as *"to our knowledge, the first,"* not an absolute.

## What it verifies (end to end)

Input: the exact `PNAU` accumulator bytes Hermes serves (`/v2/updates/price/latest?...&encoding=hex`).

1. **Parse the accumulator** (`PNAU` magic → Wormhole-Merkle proof type → VAA + price messages
   each with a keccak160 Merkle proof).
2. **Verify the VAA** — double-keccak the body, `ecrecover` each guardian signature, require a
   **13-of-19 quorum** of *distinct, in-order* guardians from the current set. (Guardian
   addresses read from the Wormhole core contract `getGuardianSet(6)` on Ethereum and pinned in
   `GUARDIAN_SET_6`.)
3. **Extract the signed Merkle root** from the VAA payload (`AUWV` accumulator message).
4. **Verify Merkle inclusion** of each price message in that signed root (Pyth's keccak160 tree:
   leaf `keccak(0x00‖msg)[..20]`, node `keccak(0x01‖min‖max)[..20]`).
5. **Decode the price** (feed id, price, conf, expo, publish_time).

The unit tests (`tests/verify.rs`) run all of this against a saved real update
(`testdata/eth-update.json`) and assert: guardian set index = 4, the **real 13-of-19 quorum
verifies**, a **tampered body breaks the quorum**, and the end-to-end decoded price **equals
what Hermes reported**.

## Run it

```bash
cd provenance/pyth-vaa
cargo test          # verifies against the real Hermes fixture
```

(Refresh the fixture: `curl -s "https://hermes.pyth.network/v2/updates/price/latest?ids[]=<feedid>&encoding=hex"` → save `updateHex` + parsed price into `testdata/eth-update.json`.)

## Integration plan (scoped)

- Move `parse_*` + `verify_*` into `bukti-lib` behind `#[cfg(target_os="zkvm")]` precompile
  paths (SP1 patches `k256`/`secp256k1` and `tiny-keccak`), so the ~13 `ecrecover`s and keccak
  Merkle stay cheap. Budget: the metrics batch is ~11.3M cycles today; 13 accelerated
  `ecrecover`s add low millions — within the laptop proving envelope already demonstrated.
- The guest takes, per priced minute, the Hermes update bytes as witness; the circuit verifies
  the guardians + Merkle and *uses the proven price* in the cost-basis reconstruction, then
  commits a `pricesRoot` alongside `swapsRoot`. Result: price provenance becomes trustless,
  removing the last relayer assumption from the metric.
- Historical prices: Hermes `/v2/updates/price/{timestamp}` serves the signed update for past
  minutes, so the same verification applies to the ClawHack window prices.

## Why isolated

Same discipline as `provenance/check-trie/`: adding `k256`/keccak to the proving crates would
change the program ELF and therefore the **deployed** batch vkey (`0x00417dfd…`), invalidating
the live attestations. This workspace has its own `Cargo.toml`/lockfile and is excluded from
the main build until the verifier is proven out and intentionally merged in one vkey rotation.
