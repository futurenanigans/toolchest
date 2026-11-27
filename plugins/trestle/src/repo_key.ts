/**
 * Pure-TS deterministic repository key (safe for both Node/Bun and the sandboxed
 * `claude-code` hooks runtime). Normalizes Windows paths case-insensitively and
 * produces `<basename>-<12-hex-hash>`.
 */
export function repoKey(repoRoot: string, isWin = false): string {
  const trimmed = repoRoot.replace(/[\\/]+$/, '') || '/'
  const normalized = isWin ? trimmed.toLowerCase().replace(/\\/g, '/') : trimmed.replace(/\\/g, '/')

  let h1 = 0x811c9dc5
  let h2 = 0x9e3779b9
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i)
    h1 ^= ch
    h1 = Math.imul(h1, 0x01000193) >>> 0
    h2 ^= ch
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0
  }

  const hex = `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`.slice(0, 12)
  const lastSep = normalized.lastIndexOf('/')
  const rawBase = lastSep >= 0 ? normalized.slice(lastSep + 1) : normalized
  const base = rawBase.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 24) || 'repo'
  return `${base}-${hex}`
}
