# bukti-bot — Telegram & Discord surfaces

Track 02 (AI Alpha & Data) asks for delivery **"via Telegram and Discord."** `bukti-bot` is
exactly that: a thin, transport-agnostic bot that answers questions about **zk-verified,
on-chain trading track records** on Mantle. Every number it returns is read live from the
`BuktiAttestation` / `BuktiValidator` contracts and is backed by a Groth16 proof verified
on-chain — nothing is self-reported.

## Commands

| Command | What it does |
|---|---|
| `/score <address>` | Proven score card: score, ROI, drawdown, volume, ERC-8004 validation 0–100, vault verdict |
| `/validate <address>` | The ERC-8004 validation response (0–100) for the wallet |
| `/leaderboard` | Top proven traders from the ClawHack cohort, descending by proven score |
| `/help` | Usage |

## Run it

```bash
npm install

# Telegram (long-poll, raw Bot API — no SDK):
BUKTI_TELEGRAM_TOKEN=<from @BotFather> npm run telegram

# Discord (posts to an incoming webhook; omit the env to just print locally):
BUKTI_DISCORD_WEBHOOK=<channel webhook url> npm run discord -- score 0x48f1142afa03a3b710f63c3d9ff56655a58f7b8d
npm run discord -- leaderboard          # prints what would be posted

# Live test — exercises the core + both transports against the live deployment (no token needed):
npm test    # → BOT_OK: 19 passed
```

## Architecture

- **`src/core.ts`** — all chain reads + formatting, shared by both transports. Reads
  `getAttestation`, `BuktiValidator.validationScore`, and `GatedVault.approvedAgent` with a
  retry wrapper; the leaderboard is built from `AttestationSubmitted` events (9000-block
  chunked for the public RPC's range cap).
- **`src/telegram.ts`** — long-polling bot over the raw Telegram Bot API. `handleCommand` is
  exported so routing is unit-tested.
- **`src/discord.ts`** — posts an embed via a Discord webhook; `buildPayload` is exported and
  tested. Without a webhook it prints the payload (handy for demos).
- **`src/test-core.ts`** — live assertions (champion → 85/100 + vault-approved, losing trader
  → 0/100, unknown → unproven, leaderboard sorted, junk-address rejection on both surfaces).

Contracts read (Mantle Sepolia): attestation `0x2EB832F2…`, validator `0xda0cEB55…`,
vault `0x851C2514…`.
