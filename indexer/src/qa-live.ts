// QA end-to-end (v2): replicate the frontend's exact data path against the live batch
// deployment + verify all on-chain state in one pass.
//   npx tsx src/qa-live.ts
import { createPublicClient, http, parseAbi } from "viem";

const client = createPublicClient({ transport: http("https://rpc.sepolia.mantle.xyz") });

const ATTEST = "0x2EB832F24136c24A3B38D4b06D3318C48B618163" as const; // v2 (batch)
const VAULT = "0x851C251411Fe4F4bab586F775c7450f86A348EAD" as const; // v2
const VERIFIER = "0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A" as const; // real SP1 v6.1.0
const REP = "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;
const ID = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;

const COHORT_TOP = "0x4cf89f51e090d6dcddbbbe5a458a01e9061823c5" as const; // 214 swaps, score -0.112
const BEST = "0x48f1142AFA03A3b710f63c3D9fF56655A58F7b8d" as const; // score 4.265, vault-approved
const LOSER = "0x4589ac7bc932b8c8e4ea001d44d40d5e4858b808" as const; // score -0.676, vault-rejected
const CLIENT = "0x9b16d7525a0510272f8E1a28966ba989D42e0C4E" as const;
const NOBODY = "0x000000000000000000000000000000000000dEaD" as const;

const ATT_ABI = parseAbi([
  "function getAttestation(address wallet) view returns ((bytes32 anchorBlockHash, uint64 windowStart, uint64 windowEnd, uint32 numTrades, int64 sharpeMilli, uint32 maxDrawdownBps, int64 roiBps, uint64 volumeUsdE6, uint64 attestedAt, address attester, bool exists))",
  "function verifier() view returns (address)",
  "function buktiProgramVKey() view returns (bytes32)",
]);
const VAULT_ABI = parseAbi(["function approvedAgent(address) view returns (bool)"]);
const VER_ABI = parseAbi(["function VERSION() view returns (string)"]);
const REP_ABI = parseAbi([
  "function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128, uint8, string, string, bool)",
]);
const ID_ABI = parseAbi(["function ownerOf(uint256) view returns (address)"]);

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

async function main() {
  check("chainId = 5003", (await client.getChainId()) === 5003);

  console.log("\n[proof layer]");
  const v = await client.readContract({ address: ATTEST, abi: ATT_ABI, functionName: "verifier" });
  check("attestation v2 wired to REAL verifier", v.toLowerCase() === VERIFIER.toLowerCase(), v);
  const ver = await client.readContract({ address: VERIFIER, abi: VER_ABI, functionName: "VERSION" });
  check("verifier VERSION v6.1.0", ver === "v6.1.0", ver);
  const vk = await client.readContract({ address: ATTEST, abi: ATT_ABI, functionName: "buktiProgramVKey" });
  check("vkey = batch program", vk === "0x001519bd647490bda9c351ff1809e4adc8bf42f68564f95b21d3ec1229bba8ac");

  console.log("\n[frontend data path] getAttestation (batch-attested wallets)");
  const a = await client.readContract({ address: ATTEST, abi: ATT_ABI, functionName: "getAttestation", args: [COHORT_TOP] });
  check("cohort-top exists (214-swap ClawHack bot)", a.exists);
  check("cohort-top score = -112", a.sharpeMilli === -112n, String(a.sharpeMilli));
  check("cohort-top trades = 135 realized", a.numTrades === 135, String(a.numTrades));

  const b = await client.readContract({ address: ATTEST, abi: ATT_ABI, functionName: "getAttestation", args: [BEST] });
  check("best scorer = 4265", b.exists && b.sharpeMilli === 4265n, String(b.sharpeMilli));

  const c = await client.readContract({ address: ATTEST, abi: ATT_ABI, functionName: "getAttestation", args: [NOBODY] });
  check("unknown wallet -> exists=false", !c.exists);

  console.log("\n[vault v2]");
  const vb = await client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "approvedAgent", args: [BEST] });
  const vl = await client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "approvedAgent", args: [LOSER] });
  check("best APPROVED on-chain", vb === true);
  check("loser NOT approved", vl === false);

  console.log("\n[ERC-8004 — unchanged rails]");
  const owner = await client.readContract({ address: ID, abi: ID_ABI, functionName: "ownerOf", args: [137n] });
  check("agent #137 owned by deployer", owner.toLowerCase() === "0x39d2bae5eaeda9283535ddc98f1991c81ed5cd7e");
  const fb = await client.readContract({ address: REP, abi: REP_ABI, functionName: "readFeedback", args: [137n, CLIENT, 1n] });
  check("reputation feedback intact", fb[0] === -1316n && fb[2] === "bukti-score");

  console.log(`\n==== RESULT: ${pass} pass, ${fail} fail ====`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
