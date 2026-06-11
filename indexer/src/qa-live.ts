// QA end-to-end: replicate the frontend's exact data path (viem readContract
// getAttestation on Mantle Sepolia) + verify all live on-chain state in one pass.
//   npx tsx src/qa-live.ts
import { createPublicClient, http, parseAbi } from "viem";

const client = createPublicClient({ transport: http("https://rpc.sepolia.mantle.xyz") });

const ATTEST = "0x7b0A5E9D4A8b1bf2829478e72f62283C6939C816" as const;
const VAULT = "0x5e6b9242Db15959EdCEccBa5C369fca3576fd598" as const;
const REP = "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const;
const ID = "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const;
const REAL = "0x4cf89f51e090d6dcddbbbe5a458a01e9061823c5" as const;
const SAMPLE = "0x1111111111111111111111111111111111111111" as const;
const CLIENT = "0x9b16d7525a0510272f8E1a28966ba989D42e0C4E" as const;
const NOBODY = "0x000000000000000000000000000000000000dEaD" as const;

// Identical tuple ABI to web/app/lib/contract.ts
const ATT_ABI = parseAbi([
  "function getAttestation(address wallet) view returns ((bytes32 anchorBlockHash, uint64 windowStart, uint64 windowEnd, uint32 numTrades, int64 sharpeMilli, uint32 maxDrawdownBps, int64 roiBps, uint64 volumeUsdE6, uint64 attestedAt, address attester, bool exists))",
]);
const VAULT_ABI = parseAbi(["function approvedAgent(address) view returns (bool)"]);
const REP_ABI = parseAbi([
  "function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128, uint8, string, string, bool)",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64, int128, uint8)",
]);
const ID_ABI = parseAbi([
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
]);

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

async function main() {
  const chainId = await client.getChainId();
  check("chainId = 5003", chainId === 5003, String(chainId));

  console.log("\n[frontend data path] getAttestation");
  const a = await client.readContract({ address: ATTEST, abi: ATT_ABI, functionName: "getAttestation", args: [REAL] });
  check("REAL exists", a.exists);
  check("REAL score = -1316", a.sharpeMilli === -1316n, String(a.sharpeMilli));
  check("REAL drawdown = 125 bps", a.maxDrawdownBps === 125, String(a.maxDrawdownBps));
  check("REAL roi = -125 bps", a.roiBps === -125n, String(a.roiBps));
  check("REAL trades = 5", a.numTrades === 5, String(a.numTrades));
  check("REAL anchor set", a.anchorBlockHash.startsWith("0x206091f6"), a.anchorBlockHash.slice(0, 12));

  const b = await client.readContract({ address: ATTEST, abi: ATT_ABI, functionName: "getAttestation", args: [SAMPLE] });
  check("SAMPLE exists, score 533", b.exists && b.sharpeMilli === 533n, String(b.sharpeMilli));

  const c = await client.readContract({ address: ATTEST, abi: ATT_ABI, functionName: "getAttestation", args: [NOBODY] });
  check("UNKNOWN wallet -> exists=false (empty-state path)", !c.exists);

  console.log("\n[vault] approvedAgent");
  const vs = await client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "approvedAgent", args: [SAMPLE] });
  const vr = await client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "approvedAgent", args: [REAL] });
  check("SAMPLE approved = true", vs === true);
  check("REAL approved = false (rejected)", vr === false);

  console.log("\n[ERC-8004]");
  const owner = await client.readContract({ address: ID, abi: ID_ABI, functionName: "ownerOf", args: [137n] });
  check("agent #137 owned by deployer", owner.toLowerCase() === "0x39d2bae5eaeda9283535ddc98f1991c81ed5cd7e", owner);
  const uri = await client.readContract({ address: ID, abi: ID_ABI, functionName: "tokenURI", args: [137n] });
  check("agentURI -> attestation tx", uri.includes("0x8b90c36e"), uri.slice(0, 60));
  const fb = await client.readContract({ address: REP, abi: REP_ABI, functionName: "readFeedback", args: [137n, CLIENT, 1n] });
  check("feedback value = -1316 (dec 3)", fb[0] === -1316n && fb[1] === 3, `${fb[0]} dec ${fb[1]}`);
  check("feedback tags", fb[2] === "bukti-score" && fb[3] === "per-trade-sharpe", `${fb[2]}/${fb[3]}`);
  check("feedback not revoked", fb[4] === false);
  const sum = await client.readContract({ address: REP, abi: REP_ABI, functionName: "getSummary", args: [137n, [CLIENT], "bukti-score", ""] });
  check("getSummary count=1 value=-1316", sum[0] === 1n && sum[1] === -1316n, `${sum[0]}/${sum[1]}`);

  console.log(`\n==== RESULT: ${pass} pass, ${fail} fail ====`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
