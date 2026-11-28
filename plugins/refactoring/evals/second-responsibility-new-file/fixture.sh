#!/usr/bin/env bash
set -euo pipefail
mkdir -p src
cat > src/auth.ts <<'TS'
// Issues and verifies session tokens.
import { createHmac, timingSafeEqual } from 'node:crypto'

const sign = (payload: string, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('hex')

export function issueToken(userId: string, secret: string): string {
  return `${userId}.${sign(userId, secret)}`
}

export function verifyToken(token: string, secret: string): string | undefined {
  const [userId, mac] = token.split('.')
  if (userId === undefined || mac === undefined) return undefined
  const expected = Buffer.from(sign(userId, secret))
  const given = Buffer.from(mac)
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : undefined
}
TS
