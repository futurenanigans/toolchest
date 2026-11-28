declare module 'claude-code' {
  interface PluginState {
    session: {
      failedCommands: Shaped<string[]>
    }
  }
}
