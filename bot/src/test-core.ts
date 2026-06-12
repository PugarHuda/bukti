// bukti-bot test — exercises the shared core + both transports' command routing against
// the LIVE Mantle deployment (no bot token / webhook needed).
//   npx tsx src/test-core.ts
import { getScoreCard, getLeaderboard, normalizeAddress } from "./core.js";
import { handleCommand } from "./telegram.js";
import { buildPayload } from "./discord.js";

const CHAMPION = "0x48f1142afa03a3b710f63c3d9ff56655a58f7b8d"; // proof champion, score 4.265
const LOSER = "0x4cf89f51e090d6dcddbbbe5a458a01e9061823c5"; // 214 swaps, net-losing
const NOBODY = "0x000000000000000000000000000000000000dEaD";

let pass = 0,
  fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  cond ? pass++ : fail++;
}

async function main() {
  // ---- core: champion ----
  const champ = await getScoreCard(normalizeAddress(CHAMPION));
  ok("champion has an attestation", champ !== null);
  ok("champion score ≈ 4.265", !!champ && Math.abs(champ.score - 4.265) < 0.01, champ ? `${champ.score}` : "");
  ok("champion validation = 85/100", champ?.validation100 === 85, `${champ?.validation100}`);
  ok("champion is vault-approved", champ?.vaultApproved === true);

  // ---- core: losing trader ----
  const loser = await getScoreCard(normalizeAddress(LOSER));
  ok("loser has an attestation", loser !== null);
  ok("loser validation = 0/100 (net-losing)", loser?.validation100 === 0, `${loser?.validation100}`);
  ok("loser is NOT vault-approved", loser?.vaultApproved === false);

  // ---- core: unknown wallet ----
  const nobody = await getScoreCard(normalizeAddress(NOBODY));
  ok("unknown wallet → null", nobody === null);

  // ---- leaderboard ----
  const board = await getLeaderboard(10);
  ok("leaderboard non-empty", board.length > 0, `${board.length} rows`);
  ok("leaderboard sorted desc", board.every((r, i) => i === 0 || board[i - 1].score >= r.score));
  ok("champion tops the board", board[0]?.wallet.toLowerCase() === CHAMPION.toLowerCase());

  // ---- Telegram routing ----
  const tgScore = await handleCommand(`/score ${CHAMPION}`);
  ok("TG /score shows 85/100", tgScore.includes("85/100"));
  ok("TG /score shows VAULT-APPROVED", tgScore.includes("VAULT-APPROVED"));
  const tgHelp = await handleCommand("/help");
  ok("TG /help mentions zk-verified", tgHelp.toLowerCase().includes("zk-verified"));
  const tgBad = await handleCommand("/score notanaddress");
  ok("TG /score rejects junk address", tgBad.toLowerCase().includes("usage"));
  const tgBoard = await handleCommand("/leaderboard");
  ok("TG /leaderboard shows the board", tgBoard.includes("Leaderboard"));

  // ---- Discord routing ----
  const dcValidate = await buildPayload("validate", CHAMPION);
  ok("Discord validate shows 85/100", dcValidate.content.includes("85/100"));
  const dcBoard = await buildPayload("leaderboard");
  ok("Discord leaderboard renders", dcBoard.content.includes("Leaderboard"));
  let threw = false;
  try {
    await buildPayload("score", "garbage");
  } catch {
    threw = true;
  }
  ok("Discord rejects junk address", threw);

  console.log(`\n${fail === 0 ? "BOT_OK" : "BOT_FAIL"}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
