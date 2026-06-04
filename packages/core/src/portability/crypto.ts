/**
 * Portability crypto — seal/open an Ava data bundle with a user passphrase.
 *
 * This is the cryptographic core of data sovereignty: a bundle is encrypted
 * ON-DEVICE so that whatever carries it (a `.ava-backup` file the user stores,
 * or a transfer relay) only ever sees ciphertext it cannot read. The passphrase
 * never leaves the device; the key is derived locally via scrypt.
 *
 * Format: a JSON envelope (so it's trivially portable across surfaces and
 * inspectable as text) wrapping AES-256-GCM ciphertext. GCM gives us
 * authenticated encryption — a tampered or truncated file fails to open rather
 * than silently returning garbage.
 */

import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';

const MAGIC = 'AVABKP';
const ENVELOPE_VERSION = 1 as const;
const KEY_LEN = 32; // AES-256

// scrypt work factors. N=2^15 is a sane desktop default (~tens of ms) — strong
// against brute force while staying snappy for an interactive export/import.
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

interface KdfParams { algo: 'scrypt'; N: number; r: number; p: number; salt: string }

export interface SealedEnvelope {
  magic: typeof MAGIC;
  v: typeof ENVELOPE_VERSION;
  kdf: KdfParams;
  /** base64 AES-GCM nonce. */
  iv: string;
  /** base64 ciphertext. */
  ct: string;
  /** base64 GCM auth tag. */
  tag: string;
}

function deriveKey(passphrase: string, salt: Buffer, p: Pick<KdfParams, 'N' | 'r' | 'p'>): Buffer {
  // NFKC-normalise so the same typed passphrase derives the same key across
  // platforms/keyboards.
  return scryptSync(passphrase.normalize('NFKC'), salt, KEY_LEN, {
    N: p.N, r: p.r, p: p.p, maxmem: SCRYPT_MAXMEM,
  });
}

/** Encrypt a plaintext string under a passphrase. Returns the JSON envelope. */
export function seal(plaintext: string, passphrase: string): string {
  if (!passphrase) throw new Error('A passphrase is required to seal a backup');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(passphrase, salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  const env: SealedEnvelope = {
    magic: MAGIC,
    v: ENVELOPE_VERSION,
    kdf: { algo: 'scrypt', N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, salt: salt.toString('base64') },
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64'),
  };
  return JSON.stringify(env);
}

/** Decrypt a JSON envelope under a passphrase. Throws on wrong passphrase,
 *  tampering, or unrecognised format — never returns partial/garbage data. */
export function open(envelopeJson: string, passphrase: string): string {
  let env: SealedEnvelope;
  try {
    env = JSON.parse(envelopeJson) as SealedEnvelope;
  } catch {
    throw new Error('This is not a valid Ava backup file');
  }
  if (env?.magic !== MAGIC || env.v !== ENVELOPE_VERSION) {
    throw new Error('Unrecognised backup format or version');
  }
  if (env.kdf?.algo !== 'scrypt') throw new Error('Unsupported key-derivation in backup');

  const salt = Buffer.from(env.kdf.salt, 'base64');
  const key = deriveKey(passphrase, salt, { N: env.kdf.N, r: env.kdf.r, p: env.kdf.p });
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
  try {
    const pt = Buffer.concat([decipher.update(Buffer.from(env.ct, 'base64')), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    // GCM tag mismatch — wrong passphrase or the file was altered/corrupted.
    throw new Error('Wrong passphrase, or the backup is corrupted');
  }
}

/** True if a string looks like an Ava sealed envelope (cheap pre-check). */
export function isSealedEnvelope(s: string): boolean {
  try {
    const env = JSON.parse(s) as SealedEnvelope;
    return env?.magic === MAGIC && typeof env.ct === 'string';
  } catch {
    return false;
  }
}
