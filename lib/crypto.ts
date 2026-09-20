import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for AES-GCM
const TAG_LENGTH = 16; // 128-bit auth tag

function getEncryptionKey(): Buffer {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('ENCRYPTION_KEY is not defined in environment variables.');
  }
  const cleanKey = rawKey.trim();
  if (cleanKey.length !== 64) {
    throw new Error(`ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Received length: ${cleanKey.length}`);
  }
  return Buffer.from(cleanKey, 'hex');
}

export function encryptToken(plainText: string): string {
  if (!plainText) {
    throw new Error('Cannot encrypt empty or undefined text.');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

export function decryptToken(cipherText: string): string {
  if (!cipherText) return '';

  // 1. Unencrypted fallback: Plaid sandbox/production tokens start with 'access-'
  if (cipherText.startsWith('access-') || !cipherText.includes(':')) {
    return cipherText;
  }

  const parts = cipherText.split(':');
  if (parts.length !== 3) {
    // Malformed encrypted string; return as-is rather than crashing server
    return cipherText;
  }

  const [ivHex, tagHex, encryptedHex] = parts;

  // Validate expected hex lengths before initializing decipher
  if (ivHex.length !== IV_LENGTH * 2 || tagHex.length !== TAG_LENGTH * 2) {
    return cipherText;
  }

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    console.error('Decryption failed, falling back to raw value:', err.message);
    return cipherText;
  }
}