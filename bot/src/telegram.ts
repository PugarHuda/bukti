// bukti-bot Telegram surface — long-polling bot over the raw Bot API (no SDK dependency).
//   BUKTI_TELEGRAM_TOKEN=xxath npx tsx src/telegram.ts
// Commands: /score <addr>, /validate <addr>, /leaderboard, /help
import {
  getScoreCard,
  getLeaderboard,
  formatScoreCard,
  formatLeaderboard,
  normalizeAddress,
  HELP,
} from "./core.js";

const TOKEN = process.env.BUKTI_TELEGRAM_TOKEN;
const API = `https://api.telegram.org/bot${TOKEN}`;

async function send(chatId: number, text: string) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  });
}

/** Route one text message to a reply. Exported so the test harness can exercise routing. */
export async function handleCommand(text: string): Promise<string> {
  const [cmd, ...rest] = text.trim().split(/\s+/);
  const arg = rest[0] ?? "";
  switch (cmd.replace(/@.*$/, "").toLowerCase()) {
    case "/start":
    case "/help":
      return HELP;
    case "/score":
      try {
        const w = normalizeAddress(arg);
        return formatScoreCard(await getScoreCard(w), w);
      } catch (e: any) {
        return `Usage: /score <0x address>\n(${e.message})`;
      }
    case "/validate":
      try {
        const w = normalizeAddress(arg);
        const c = await getScoreCard(w);
        return c
          ? `ERC-8004 validation for ${arg}: ${c.validation100}/100 (proven score ${c.score.toFixed(3)}).`
          : `${arg} has no zk-verified attestation — validation 0/100 (unproven).`;
      } catch (e: any) {
        return `Usage: /validate <0x address>\n(${e.message})`;
      }
    case "/leaderboard":
      return formatLeaderboard(await getLeaderboard(10));
    default:
      return HELP;
  }
}

async function main() {
  if (!TOKEN) {
    console.error("Set BUKTI_TELEGRAM_TOKEN (from @BotFather) to run the Telegram bot.");
    process.exit(1);
  }
  console.log("bukti-bot (Telegram) polling…");
  let offset = 0;
  // long-poll loop
  for (;;) {
    try {
      const res = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
      const json: any = await res.json();
      for (const u of json.result ?? []) {
        offset = u.update_id + 1;
        const msg = u.message;
        if (!msg?.text) continue;
        const reply = await handleCommand(msg.text);
        await send(msg.chat.id, reply);
      }
    } catch (e) {
      console.error("poll error (retrying):", e);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

// Only start polling when run directly (so importing for tests doesn't block).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("telegram.ts")) {
  main();
}
