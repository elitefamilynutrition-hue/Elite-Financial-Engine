import crypto from 'crypto';

/**
 * AES-256-GCM encryption for third-party (Plaid) access tokens.
 *
 * Stored format: `v1:<iv hex>:<authTag hex>:<ciphertext hex>`
 * The `v1` prefix is a key-version marker. When the encryption key is rotated,
 * bump the prefix (v2) and teach `decryptToken` about both versions so old rows
 * can be re-encrypted in the background.
 *
 * This module FAILS CLOSED. An earlier version returned the ciphertext unchanged
 * whenever decryption went wrong, which meant a rotated key silently handed
 * garbage to Plaid as if it were an access token. Every failure now throws.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_VERSION = 'v1';
const KEY_HEX_LENGTH = 64;

export class TokenDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenDecryptionError';
  }
}

function getEncryptionKey(): Buffer {
  const rawKey = process.env.ENCRYPTION_KEY;

  if (!rawKey) {
    throw new Error('ENCRYPTION_KEY is not configured.');
  }

  const cleanKey = rawKey.trim();
  if (cleanKey.length !== KEY_HEX_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be a ${KEY_HEX_LENGTH}-character hex string (32 bytes). Received length: ${cleanKey.length}`
    );
  }

  return Buffer.from(cleanKey, 'hex');
}

export function encryptToken(plainText: string): string {
  if (!plainText) {
    throw new Error('Cannot encrypt an empty token.');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [KEY_VERSION, iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':');
}

/** Cheap structural check — no key required, safe to run in a loop. */
export function isEncryptedToken(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== KEY_VERSION) return false;
  return parts[1].length === IV_LENGTH * 2 && parts[2].length === TAG_LENGTH * 2 && parts[3].length > 0;
}

/**
 * Decrypts a stored token. Also understands the legacy 3-part
 * `iv:tag:ciphertext` format so pre-migration rows keep working until they are
 * re-encrypted. Throws `TokenDecryptionError` on any problem.
 */
export function decryptToken(storedValue: string): string {
  if (!storedValue) {
    throw new TokenDecryptionError('Attempted to decrypt an empty token.');
  }

  const parts = storedValue.split(':');
  const isVersioned = parts.length === 4 && parts[0] === KEY_VERSION;
  const isLegacy = parts.length === 3;

  if (!isVersioned && !isLegacy) {
    throw new TokenDecryptionError(
      'Stored token is not in a recognised encrypted format. Re-run the token encryption migration.'
    );
  }

  const [ivHex, tagHex, cipherHex] = isVersioned ? parts.slice(1) : parts;

  if (ivHex.length !== IV_LENGTH * 2 || tagHex.length !== TAG_LENGTH * 2 || !cipherHex) {
    throw new TokenDecryptionError('Stored token has an invalid IV, auth tag, or ciphertext.');
  }

  try {
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

    const decrypted = Buffer.concat([decipher.update(Buffer.from(cipherHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    throw new TokenDecryptionError(`Token decryption failed: ${reason}`);
  }
}
