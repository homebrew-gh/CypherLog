import { nip19 } from 'nostr-tools';

/**
 * Normalize a pubkey returned by an external signer (e.g. NIP-55 Amber).
 * Some signers omit a leading zero on the hex form (63 chars); @noble/hashes
 * requires even-length padded hex and throws "padded hex string expected".
 */
export function normalizeSignerPubkey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('Signer returned an empty public key');
  }

  if (/^npub1/i.test(trimmed)) {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== 'npub') {
      throw new Error('Signer returned an invalid npub');
    }
    return decoded.data.toLowerCase();
  }

  let hex = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? trimmed.slice(2) : trimmed;
  hex = hex.replace(/\s+/g, '');
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('Signer returned a public key that is not hex or npub');
  }

  hex = hex.toLowerCase();
  // 32-byte pubkey must be 64 hex digits; Amber has been observed to drop a leading 0.
  if (hex.length === 63) {
    hex = `0${hex}`;
  }
  if (hex.length !== 64) {
    throw new Error(
      `Invalid pubkey length from signer (${hex.length} hex digits; expected 64). Try updating Amber.`,
    );
  }

  return hex;
}
