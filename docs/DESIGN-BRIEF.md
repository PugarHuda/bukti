# Bukti — UI/UX Design Brief & Prompt (research-grounded)

> Use this as the system prompt / brief for any UI work on Bukti. It is written to actively
> avoid the "AI-slop" look (averaged, glossy, decorative) and produce a restrained, precise
> interface in the lineage of **Hyperliquid, Etherscan, Linear, Vercel, Stripe, Dune**.

## 1. Positioning
Bukti is a zero-knowledge **proof / on-chain trading-verification primitive** on Mantle. The UI
must read like a **precision financial-analytics terminal**, not a marketing SaaS template.
Brand values, in order: **trust, density, restraint.** The interface earns credibility by looking
like infrastructure — flat, exact, monospace numbers, no theatrics.

## 2. Anti-patterns — explicitly forbidden (the AI-slop tells)
- ❌ Gradient text; multi-stop color gradients; glassmorphism / backdrop-blur fills.
- ❌ Glows, neon shadows, "AI thinking" auras, drop-shadows on every card.
- ❌ Purple/indigo + teal duo-tone; a *different accent color per card*.
- ❌ Emoji used as UI icons.
- ❌ Oversized centered hero with a huge gradient headline.
- ❌ Over-rounded corners (> 12px); heavy elevation; busy backgrounds.
- ❌ Color used as decoration. **Color is signal, never garnish.**

## 3. Visual system

### Color — near-monochrome + ONE semantic accent
Grayscale carries ~95% of the UI. A single accent appears only for *meaning*: active nav,
positive value, primary action, links. A single red only for negative/danger.
```
--bg        #0a0b0d   (true near-black)
--surface   #101316   (one elevation step; differentiate by BORDER, not shadow)
--surface-2 #15191d
--line      #1d2227   (hairline borders)
--line-2    #2a3138   (hover/focus border)
--text      #e9edf1   (high-contrast primary)
--muted     #7c8693   (secondary)
--faint     #525a64   (labels, tertiary)
--accent    #3fbf86   (restrained green — positive / active / link / primary)
--neg       #e5484d   (negative / danger only)
```
No gradients anywhere. No box-shadow except, at most, a 1px hairline. Contrast is high
(near-white on near-black); nothing muddy.

### Typography
- Sans: **Geist** (fallback Inter). Headings tracking −0.02em; body normal.
- Mono: **Geist Mono** / JetBrains Mono for ALL numbers, addresses, hashes — `tabular-nums`.
- Section labels: 11px, UPPERCASE, letter-spacing 0.08em, color `--faint`.
- Hierarchy comes from **size + weight + color**, not from boxes. Body line-height 1.5–1.7.

### Space & layout
- Left-aligned, grid-based, data-dense but airy — always slightly more padding than feels needed
  (cards 20–24px; page sections 56–80px). Whitespace is structure, not emptiness.
- Prefer **hairline dividers** over nested cards. Surfaces sit on the bg via border, not shadow.
- Content max-width ≈ 1200px; data tables may go edge-to-edge.

### Components
- **Buttons**: primary = solid accent, near-black text; secondary = ghost (transparent, hairline
  border). Every button defines hover (subtle bg), focus (1px accent ring), active, disabled.
- **Inputs**: flat, hairline border, accent focus ring; mono for addresses.
- **Tables** (the centerpiece of an analytics app): tight rows, sticky UPPERCASE faint header,
  hover-row tint, monospace right-aligned numerics, color only on signed values.
- **Sidebar**: persistent left rail; item = small **line icon** (1.5px stroke, never emoji) + label;
  active = inset surface + accent text + a 2px left accent bar; exactly one active route at a time.
- **Charts/sparklines**: thin 1.5px lines, NO fills/glows; hairline gridlines; only the two
  semantic colors.

### Motion
120–160ms ease, transform/opacity only. No bounce, no glow pulse. Hover = small bg/border shift.
Honor `prefers-reduced-motion`.

## 4. Information architecture — a multi-page app (not one long scroll)
The dashboard has a **persistent sidebar with real routes**:
- `/dashboard` — **Overview**: KPI row, the headline insight, a compact top leaderboard, quick verify.
- `/dashboard/leaderboard` — full 25-row leaderboard with drill-down.
- `/dashboard/verify` — verify any wallet → proven score card → share.
- `/dashboard/agent` — the MCP / agent-copilot flows.
- `/dashboard/proof` — proof & contracts layer (addresses, txs, "verify it yourself").

The landing (`/`) is marketing only. Its top nav carries **brand + GitHub** — **no Dashboard link**;
the single entry to the app is the hero CTA.

## 5. Acceptance test
If a screenshot could pass for **Hyperliquid / Linear / Etherscan**, it's right. If it has a glow,
a gradient headline, three accent colors, or an emoji icon, it's wrong — redo it.

---
*Sources informing this brief:* Stripe/Linear/Vercel premium-UI restraint (mantlr.com,
pixeldarts.com); "AI slop" design tells = averaged glossy gradient/glow aesthetic (Built In,
The Adpharm); crypto-analytics references: Hyperliquid, Etherscan, Dune, Arkham.
