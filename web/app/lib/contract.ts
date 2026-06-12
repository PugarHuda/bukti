import { createPublicClient, http, fallback, defineChain, parseAbiItem } from "viem";

export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.sepolia.mantle.xyz"] } },
  blockExplorers: { default: { name: "Mantlescan", url: "https://sepolia.mantlescan.xyz" } },
  testnet: true,
});

// Multi-endpoint fallback + retry so a flaky/rate-limited public RPC never breaks the
// live demo (auto-fails-over across endpoints, ranks by latency).
export const client = createPublicClient({
  chain: mantleSepolia,
  transport: fallback(
    [
      http("https://rpc.sepolia.mantle.xyz", { retryCount: 2, timeout: 12_000 }),
      http("https://mantle-sepolia.drpc.org", { retryCount: 2, timeout: 12_000 }),
      http("https://mantle-sepolia-testnet.rpc.thirdweb.com", { retryCount: 2, timeout: 12_000 }),
    ],
    { rank: true },
  ),
});

/** BuktiAttestation v2 (batch) on Mantle Sepolia (overridable via NEXT_PUBLIC_ATTESTATION_ADDRESS). */
export const ATTESTATION_ADDRESS = (process.env.NEXT_PUBLIC_ATTESTATION_ADDRESS ??
  "0x2EB832F24136c24A3B38D4b06D3318C48B618163") as `0x${string}`;

export const ATTESTATION_ABI = [
  {
    type: "function",
    name: "getAttestation",
    stateMutability: "view",
    inputs: [{ name: "wallet", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "anchorBlockHash", type: "bytes32" },
          { name: "windowStart", type: "uint64" },
          { name: "windowEnd", type: "uint64" },
          { name: "numTrades", type: "uint32" },
          { name: "sharpeMilli", type: "int64" },
          { name: "maxDrawdownBps", type: "uint32" },
          { name: "roiBps", type: "int64" },
          { name: "volumeUsdE6", type: "uint64" },
          { name: "attestedAt", type: "uint64" },
          { name: "attester", type: "address" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
] as const;

export interface Attestation {
  anchorBlockHash: `0x${string}`;
  windowStart: bigint;
  windowEnd: bigint;
  numTrades: number;
  sharpeMilli: bigint;
  maxDrawdownBps: number;
  roiBps: bigint;
  volumeUsdE6: bigint;
  attestedAt: bigint;
  attester: `0x${string}`;
  exists: boolean;
}

export async function fetchAttestation(wallet: `0x${string}`): Promise<Attestation> {
  const res = (await client.readContract({
    address: ATTESTATION_ADDRESS,
    abi: ATTESTATION_ABI,
    functionName: "getAttestation",
    args: [wallet],
  })) as Attestation;
  return res;
}

/** Real SP1 Groth16 verifier the attestation contract points at (shown in the proof panel). */
export const VERIFIER_ADDRESS = "0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A";
export const VERIFIER_VERSION = "SP1 Groth16 v6.1.0";

const ATTESTATION_EVENT = parseAbiItem(
  "event AttestationSubmitted(address indexed wallet, address indexed attester, int64 sharpeMilli, uint32 maxDrawdownBps, int64 roiBps, uint64 volumeUsdE6, bytes32 anchorBlockHash)",
);

/** Contract deploy block on Mantle Sepolia — leaderboard scans from here. */
const DEPLOY_BLOCK = 39795000n;
const CHUNK = 9000n; // public RPC getLogs cap is 10k blocks

export interface LeaderboardEntry {
  wallet: `0x${string}`;
  sharpeMilli: bigint;
  maxDrawdownBps: number;
  roiBps: bigint;
  volumeUsdE6: bigint;
  txHash: `0x${string}`;
}

/** Build the leaderboard straight from on-chain AttestationSubmitted events
 *  (latest attestation per wallet wins), sorted by score desc. */
export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const latest = await client.getBlockNumber();
  const byWallet = new Map<string, LeaderboardEntry>();
  for (let from = DEPLOY_BLOCK; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    const logs = await client.getLogs({
      address: ATTESTATION_ADDRESS,
      event: ATTESTATION_EVENT,
      fromBlock: from,
      toBlock: to,
    });
    for (const l of logs) {
      byWallet.set((l.args.wallet as string).toLowerCase(), {
        wallet: l.args.wallet as `0x${string}`,
        sharpeMilli: l.args.sharpeMilli as bigint,
        maxDrawdownBps: Number(l.args.maxDrawdownBps),
        roiBps: l.args.roiBps as bigint,
        volumeUsdE6: l.args.volumeUsdE6 as bigint,
        txHash: l.transactionHash as `0x${string}`,
      });
    }
  }
  return [...byWallet.values()].sort((a, b) => (b.sharpeMilli > a.sharpeMilli ? 1 : -1));
}
