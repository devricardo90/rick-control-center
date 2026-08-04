/**
 * Argon2id password hashing.
 *
 * Uses @node-rs/argon2 (maintained, prebuilt native bindings via napi-rs —
 * no native compile step). Parameters are the OWASP-recommended Argon2id
 * baseline profile, set explicitly rather than relying on library defaults.
 *
 * NDERCC-6: single-user authentication.
 */
import { hash, verify } from '@node-rs/argon2'

/** OWASP-recommended Argon2id baseline: 19 MiB memory, 2 iterations, 1 thread. */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS)
}

export async function verifyPassword(
  passwordHash: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plainPassword)
  }
  catch {
    // @node-rs/argon2 throws on a malformed/foreign hash string rather than
    // returning false. Treat that the same as a failed verification.
    return false
  }
}

/**
 * A precomputed Argon2id hash (same parameters as real password hashes) of
 * the fixed, explicitly artificial string below — never a real credential
 * and never generated per-request. Used to run `verifyPassword` against a
 * decoy when no operator matches a login attempt, so a nonexistent-username
 * lookup and a wrong-password lookup take roughly the same amount of time.
 * This hash can never authenticate a real operator: no operator's password
 * is ever set to this literal decoy string.
 *
 * Decoy plaintext: "rick-ndercc6-timing-safety-decoy-not-a-real-credential"
 */
export const DUMMY_PASSWORD_HASH
  = '$argon2id$v=19$m=19456,t=2,p=1$jW6omzRc+wN3uJW3Yf9ZwQ$MBddLV0ntPpp5jpspif2R+9/VdMM6XO3nQNrxb9omNs'
