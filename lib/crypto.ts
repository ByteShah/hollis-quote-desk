import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for tenants' AI keys. The company id is bound in as additional
// authenticated data, so a ciphertext copied onto another company's row fails
// to decrypt instead of silently spending someone else's key.

function masterKey(): Buffer {
  const raw = process.env.KEY_ENCRYPTION_SECRET;
  if (!raw) throw new Error("KEY_ENCRYPTION_SECRET is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("KEY_ENCRYPTION_SECRET must be 32 bytes, base64-encoded");
  return key;
}

export function encryptSecret(plaintext: string, companyId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  cipher.setAAD(Buffer.from(companyId));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptSecret(blob: string, companyId: string): string {
  const buf = Buffer.from(blob, "base64");
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), buf.subarray(0, 12));
  decipher.setAAD(Buffer.from(companyId));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
