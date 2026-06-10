// Bukti indexer configuration.
//
// Addresses verified on-chain 2026-06-10 (Agni official deploy file, GeckoTerminal,
// mantlescan, Pyth Hermes). The indexer reads swaps straight from the public Mantle RPC
// (no API key) and reads each pool's token0()/token1() on-chain (so token order is never
// guessed).

export const MANTLE_MAINNET = {
  chainId: 5000,
  rpc: process.env.INDEXER_RPC ?? "https://rpc.mantle.xyz",
  explorer: "https://mantlescan.xyz",
} as const;

export const MANTLE_SEPOLIA = {
  chainId: 5003,
  rpc: process.env.INDEXER_RPC ?? "https://rpc.sepolia.mantle.xyz",
  explorer: "https://sepolia.mantlescan.xyz",
} as const;

export const PYTH = {
  contractMantle: "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729",
  hermes: "https://hermes.pyth.network",
} as const;

export interface TokenInfo {
  symbol: string;
  decimals: number;
  /** Stable witness token id (registry index) — must be unique and never reordered. */
  id: number;
  /** Bybit spot symbol for historical (kline) pricing; null when priced as USD cash. */
  bybit: string | null;
  /** Pyth price feed id (bytes32), kept for cross-checking. */
  pythFeedId: string | null;
  /** Treat as USD cash (stablecoin) for cost-basis accounting. */
  isUsd?: boolean;
}

// Pyth feed IDs (chain-agnostic), all confirmed live via Hermes.
const MNT_USD = "0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585";
const ETH_USD = "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";

/** token address (lowercased) -> info. */
export const TOKENS: Record<string, TokenInfo> = {
  "0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8": { symbol: "WMNT", decimals: 18, id: 1, bybit: "MNTUSDT", pythFeedId: MNT_USD },
  "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9": { symbol: "USDC", decimals: 6, id: 0, bybit: null, pythFeedId: null, isUsd: true },
  "0x201eba5cc46d216ce6dc03f6a759e8e766e956ae": { symbol: "USDT", decimals: 6, id: 0, bybit: null, pythFeedId: null, isUsd: true },
  "0xdeaddeaddeaddeaddeaddeaddeaddeaddead1111": { symbol: "WETH", decimals: 18, id: 2, bybit: "ETHUSDT", pythFeedId: ETH_USD },
  // mETH priced via ETH/USD as an MVP proxy (carries a small staking premium in reality).
  "0xcda86a272531e8640cd7f1a92c01839911b90bb0": { symbol: "mETH", decimals: 18, id: 3, bybit: "ETHUSDT", pythFeedId: ETH_USD },
};

/** Bybit public REST for historical 1-minute klines (generous rate limits, no key). */
export const BYBIT_API = "https://api.bybit.com";

export type DexKind = "univ3" | "lb";

export interface PoolInfo {
  address: string;
  kind: DexKind;
  label: string;
  /** Filled at runtime from the pool's token0()/token1(); leave undefined in config. */
  token0?: string;
  token1?: string;
}

/** Real Mantle pools to scan (Agni = UniV3 fork). token order is read on-chain. */
export const POOLS: PoolInfo[] = [
  { address: "0x54169896d28dec0ffabe3b16f90f71323774949f", kind: "univ3", label: "Agni WETH/WMNT 0.05%" },
  { address: "0xd08c50f7e69e9aeb2867deff4a8053d9a855e26a", kind: "univ3", label: "Agni USDT/WMNT 0.05%" },
  // Merchant Moe Liquidity Book pairs use a different (bin-based) Swap event — deferred.
  // { address: "0xf6c9020C9E915808481757779edB53DAcEAe2415", kind: "lb", label: "Merchant Moe WMNT/USDT" },
];
