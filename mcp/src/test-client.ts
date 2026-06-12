// E2E test: spawn the bukti-mcp server over stdio, call every tool, assert results.
//   npm test
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const BEST = "0x48f1142AFA03A3b710f63c3D9fF56655A58F7b8d";
const VOLCHAMP = "0x4cf89f51e090d6dcddbbbe5a458a01e9061823c5";
const NOBODY = "0x000000000000000000000000000000000000dEaD";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  cond ? pass++ : fail++;
};

async function main() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/server.ts"],
  });
  const client = new Client({ name: "bukti-test", version: "0.0.1" });
  await client.connect(transport);

  const tools = await client.listTools();
  check("5 tools terdaftar", tools.tools.length === 5, tools.tools.map((t) => t.name).join(","));

  const text = (r: any) => JSON.parse(r.content[0].text);

  const s = text(await client.callTool({ name: "bukti_get_verified_score", arguments: { wallet: BEST } }));
  check("get_verified_score(best) = 4.265", s.score === 4.265, String(s.score));

  const n = text(await client.callTool({ name: "bukti_get_verified_score", arguments: { wallet: NOBODY } }));
  check("unattested wallet flagged UNVERIFIED", n.attested === false);

  const lb = text(await client.callTool({ name: "bukti_leaderboard", arguments: {} }));
  check("leaderboard 25 entri", lb.entries.length === 25, String(lb.entries.length));
  check("rank 1 = best scorer", lb.entries[0].wallet.toLowerCase() === BEST.toLowerCase());

  const v1 = text(await client.callTool({ name: "bukti_check_vault_eligibility", arguments: { wallet: BEST } }));
  check("vault: best ELIGIBLE + approved on-chain", v1.wouldClearGate === true && v1.alreadyApprovedOnChain === true);

  const v2 = text(await client.callTool({ name: "bukti_check_vault_eligibility", arguments: { wallet: VOLCHAMP } }));
  check("vault: volume-champion REJECT", v2.verdict.startsWith("REJECT"), v2.verdict);

  const cmp = text(await client.callTool({ name: "bukti_compare_wallets", arguments: { walletA: VOLCHAMP, walletB: BEST } }));
  check("compare merekomendasikan best", cmp.recommendation.includes(BEST.slice(0, 6)) || cmp.recommendation.toLowerCase().includes(BEST.toLowerCase().slice(0, 8)), cmp.recommendation);

  const info = text(await client.callTool({ name: "bukti_proof_info", arguments: {} }));
  check("proof_info berisi batch tx", info.clawhackBatchProofTx.includes("0xe478d52a"));

  await client.close();
  console.log(`\n==== MCP E2E: ${pass} pass, ${fail} fail ====`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
