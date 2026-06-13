// identity-bind.ts — SOLVES the "wallet ↔ controller identity" trust gap.
//
// Bukti proves a WALLET's history is real; it did not, by itself, prove the CLAIMANT controls
// that wallet's key (someone could point at a stranger's good wallet). The fix is a standard
// EIP-191 signature challenge: the claimant signs a Bukti nonce with the wallet's key, and we
// ecrecover it — if the recovered address == the wallet whose proof is on-chain, control is
// bound. This is the exact primitive the web "Prove control" panel and an on-chain
// BuktiIdentity.bind(addr, sig) would use; here we prove the crypto end-to-end.
//
//   npx tsx src/identity-bind.ts
import { privateKeyToAccount } from "viem/accounts";
import { recoverMessageAddress, verifyMessage, keccak256, toHex } from "viem";

// A domain-separated challenge so a signature can't be replayed outside Bukti.
export function challenge(wallet: string, nonce: string): string {
  return `Bukti: I control ${wallet.toLowerCase()} and bind it to my proven track record.\nnonce: ${nonce}`;
}

async function main() {
  // deterministic test key (NOT a real key) — proves the primitive, no secrets involved.
  const pk = ("0x" + "11".repeat(32)) as `0x${string}`;
  const acct = privateKeyToAccount(pk);
  const wallet = acct.address;
  const nonce = keccak256(toHex(`bukti-${wallet}-2026`)).slice(0, 18);
  const msg = challenge(wallet, nonce);

  // 1. claimant signs the Bukti challenge with the wallet's key
  const sig = await acct.signMessage({ message: msg });

  // 2. Bukti recovers the signer and binds it to the proven wallet
  const recovered = await recoverMessageAddress({ message: msg, signature: sig });
  const bound = recovered.toLowerCase() === wallet.toLowerCase();
  const valid = await verifyMessage({ address: wallet, message: msg, signature: sig });

  console.log(`=== wallet ↔ controller identity binding (EIP-191) ===`);
  console.log(`wallet (has on-chain proof): ${wallet}`);
  console.log(`challenge: "${msg.split("\n")[0]}…"`);
  console.log(`signature: ${sig.slice(0, 26)}… (${(sig.length - 2) / 2} bytes)`);
  console.log(`recovered signer:            ${recovered}`);
  console.log(`bound (recovered == wallet): ${bound ? "✓" : "✗"}   verifyMessage: ${valid ? "✓" : "✗"}`);

  // 3. negative case: a forged signature from a DIFFERENT key must NOT bind to the wallet
  const attacker = privateKeyToAccount(("0x" + "22".repeat(32)) as `0x${string}`);
  const forged = await attacker.signMessage({ message: msg });
  const forgedRecovered = await recoverMessageAddress({ message: msg, signature: forged });
  const forgedBinds = forgedRecovered.toLowerCase() === wallet.toLowerCase();
  console.log(`\nadversary signs the same challenge with a different key:`);
  console.log(`  recovered ${forgedRecovered.slice(0, 12)}… binds to wallet: ${forgedBinds ? "✓ (BUG!)" : "✗ rejected"}`);

  const ok = bound && valid && !forgedBinds;
  console.log(`\n${ok ? "IDENTITY_BIND_OK" : "IDENTITY_BIND_FAIL"}: control is provable by signature; an impostor pointing at someone else's wallet cannot bind it.`);
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
