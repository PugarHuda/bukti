// bukti-bot Discord surface — posts a verified score card / leaderboard to a Discord
// channel via an incoming webhook (the simplest reliable Discord integration; Track 02
// asks for "via Telegram and Discord").
//
//   BUKTI_DISCORD_WEBHOOK=https://discord.com/api/webhooks/... \
//     npx tsx src/discord.ts score 0xabc...    # or: leaderboard
import {
  getScoreCard,
  getLeaderboard,
  formatScoreCard,
  formatLeaderboard,
  normalizeAddress,
  EXPLORER,
  ATTEST,
} from "./core.js";

/** Build the Discord embed payload for a command — exported so tests can assert it. */
export async function buildPayload(command: string, arg?: string): Promise<{ content: string }> {
  if (command === "leaderboard") {
    return { content: "```\n" + formatLeaderboard(await getLeaderboard(10)) + "\n```" };
  }
  if (command === "score" || command === "validate") {
    const w = normalizeAddress(arg ?? "");
    const card = await getScoreCard(w);
    if (command === "validate") {
      const v = card ? card.validation100 : 0;
      return { content: `ERC-8004 validation for \`${w}\`: **${v}/100** — ${EXPLORER}/address/${ATTEST}` };
    }
    return { content: "```\n" + formatScoreCard(card, w) + "\n```" };
  }
  throw new Error(`unknown command: ${command} (use: score <addr> | validate <addr> | leaderboard)`);
}

async function post(webhook: string, payload: { content: string }) {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Discord webhook ${res.status}: ${await res.text()}`);
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (!command) {
    console.error("Usage: npx tsx src/discord.ts <score <addr> | validate <addr> | leaderboard>");
    process.exit(1);
  }
  const payload = await buildPayload(command, arg);
  const webhook = process.env.BUKTI_DISCORD_WEBHOOK;
  if (!webhook) {
    // No webhook configured — print what WOULD be posted (useful for local/demo).
    console.log(payload.content);
    return;
  }
  await post(webhook, payload);
  console.log("posted to Discord ✓");
}

if (process.argv[1]?.endsWith("discord.ts")) main();
