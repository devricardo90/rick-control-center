#!/usr/bin/env node
/**
 * Interactive administrative bootstrap: creates or updates the
 * installation's single primary operator.
 *
 * Idempotent — always targets the same canonical row (see
 * `upsertPrimaryOperator`), so re-running it changes the existing
 * operator's username/password rather than creating a second one.
 * Revokes every existing session afterward, since a password change must
 * invalidate previously issued sessions.
 *
 * The password is read from the terminal without echoing it and is never
 * logged or persisted — only its Argon2id hash is stored.
 *
 * Usage: pnpm --filter @rick/database bootstrap:operator
 *
 * NDERCC-6: single-user authentication.
 */
import { createInterface } from 'node:readline'
import { hashPassword } from '../auth/password.js'
import { revokeAllSessionsForOperator } from '../auth-session.js'
import { prisma } from '../client.js'
import { upsertPrimaryOperator } from '../operator.js'

const MIN_PASSWORD_LENGTH = 12

const KEY_ENTER = '\r'
const KEY_NEWLINE = '\n'
// Built via fromCharCode rather than a literal escape so no raw control
// bytes are stored in this source file.
const KEY_CTRL_C = String.fromCharCode(3)
const KEY_CTRL_D = String.fromCharCode(4)
const KEY_BACKSPACE = String.fromCharCode(127)

function promptVisible(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process

    if (!stdin.isTTY) {
      reject(new Error('A TTY is required to read a password without echoing it.'))
      return
    }

    stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    let value = ''

    const stop = (): void => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
    }

    function onData(char: string): void {
      switch (char) {
        case KEY_ENTER:
        case KEY_NEWLINE:
        case KEY_CTRL_D:
          stop()
          stdout.write('\n')
          resolve(value)
          break
        case KEY_CTRL_C:
          stop()
          stdout.write('\n')
          reject(new Error('Aborted.'))
          break
        case KEY_BACKSPACE:
          value = value.slice(0, -1)
          break
        default:
          value += char
      }
    }

    stdin.on('data', onData)
  })
}

async function readNewPassword(): Promise<string> {
  const password = await promptHidden('Operator password: ')
  const confirmation = await promptHidden('Confirm password: ')

  if (password !== confirmation) {
    throw new Error('Passwords do not match.')
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  }

  return password
}

async function main(): Promise<void> {
  const username = await promptVisible('Operator username: ')

  if (username.length === 0) {
    throw new Error('Username must not be empty.')
  }

  const password = await readNewPassword()
  const passwordHash = await hashPassword(password)
  const operator = await upsertPrimaryOperator(prisma, { username, passwordHash })
  await revokeAllSessionsForOperator(prisma, operator.id)

  console.log(`Operator '${operator.username}' provisioned. All existing sessions were revoked.`)
}

main()
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Unknown bootstrap error'
    console.error(`Bootstrap failed: ${message}`)
    process.exitCode = 1
  })
  .finally(() => {
    void prisma.$disconnect()
  })
