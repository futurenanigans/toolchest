export type LamCounts = Record<string, number>
export type StatusSegment = { text: string; color?: string }

declare module 'claude-code' {
  interface PluginState {
    lam: { counts: Shaped<LamCounts>; readmeGuided: boolean; status: Shaped<StatusSegment[]> }
  }
}
