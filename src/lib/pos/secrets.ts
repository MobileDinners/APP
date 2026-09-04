import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Encryption for POS access tokens.
 *
 * A Square or Clover access token can read a merchant's sales history and, with
 * the wrong scopes, take payments. Storing them in plaintext next to the orders
 * table means one SQL injection is also a payments incident, so they are sealed
 * with AES-256-GCM and the key never goes in the database.
 *
 * MD_TOKEN_KEY must be set in production. In development a fixed key is derived
 * so the app runs out of the box, and that is refused in production rather than
 * silently accepted.
 */

const DEV_KEY_MATERIAL = "mobile-dinners-development-only";

function key(): Buffer {
  const secret = process.env.MD_TOKEN_KEY;
  if (secret) return scryptSync(secret, "md-pos-tokens", 32);

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "MD_TOKEN_KEY is required in production. Refusing to encrypt POS tokens " +
      "with a key that is published in the source.",
    );
  }
  return scryptSync(DEV_KEY_MATERIAL, "md-pos-tokens", 32);
}

/** Returns `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function seal(plaintext: string): string {
  if (!plaintext) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    enc.toString("base64url"),
  ].join(".");
}

export function open(sealed: string): string {
  if (!sealed) return "";
  const [version, ivB64, tagB64, dataB64] = sealed.split(".");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed sealed token");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** For display: never show a token, only enough to recognise it. */
export function fingerprint(token: string): string {
  if (!token) return "";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}
