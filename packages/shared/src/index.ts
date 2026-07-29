/**
 * @rick/shared
 *
 * Shared utilities, types, and constants used across all RICK packages.
 * Framework-agnostic. No external runtime dependencies.
 */

// ── Version ───────────────────────────────────────────────────────────────────

export const RICK_VERSION = '0.1.0' as const

// ── Brand identity ────────────────────────────────────────────────────────────

export const RICK_APP_NAME = 'RICK Control Center' as const

// ── Result type ───────────────────────────────────────────────────────────────

export type Ok<T> = { readonly ok: true, readonly value: T }
export type Err<E> = { readonly ok: false, readonly error: E }
export type Result<T, E = Error> = Ok<T> | Err<E>

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value }
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error }
}

// ── Branded ID types ──────────────────────────────────────────────────────────

declare const __brand: unique symbol
export type Brand<T, B> = T & { readonly [__brand]: B }

export type ProjectId = Brand<string, 'ProjectId'>
export type ContractId = Brand<string, 'ContractId'>
export type RunId = Brand<string, 'RunId'>
export type AuditId = Brand<string, 'AuditId'>
