import { createPublicClient, http, defineChain } from "viem";

export const mantleSepolia = defineChain({
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.sepolia.mantle.xyz"] } },
  blockExplorers: { default: { name: "Mantlescan", url: "https://sepolia.mantlescan.xyz" } },
  testnet: true,
});

export const client = createPublicClient({ chain: mantleSepolia, transport: http() });

/** BuktiAttestation on Mantle Sepolia (overridable via NEXT_PUBLIC_ATTESTATION_ADDRESS). */
export const ATTESTATION_ADDRESS = (process.env.NEXT_PUBLIC_ATTESTATION_ADDRESS ??
  "0x7b0A5E9D4A8b1bf2829478e72f62283C6939C816") as `0x${string}`;

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
