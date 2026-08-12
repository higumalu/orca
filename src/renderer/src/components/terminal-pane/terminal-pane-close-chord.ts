import {
  keybindingMatchesAction,
  normalizeTerminalShortcutPolicy,
  type KeybindingInput,
  type KeybindingMatchOptions,
  type KeybindingOverrides
} from '../../../../shared/keybindings'

// Shared close-chord predicate: the terminal pane (L3) and the floating panel's focused-terminal
// branch (L2) both treat terminal.closePane OR a terminal-scope tab.close as "close the active
// pane," so the two layers can't diverge. Callers pass the options each binding needs.
export function isTerminalPaneCloseChord(
  event: KeybindingInput,
  platform: NodeJS.Platform,
  keybindings: KeybindingOverrides | undefined,
  closePaneOptions?: KeybindingMatchOptions,
  tabCloseOptions?: KeybindingMatchOptions
): boolean {
  return (
    matchesClosePaneRespectingTerminalFirst(event, platform, keybindings, closePaneOptions) ||
    keybindingMatchesAction('tab.close', event, platform, keybindings, tabCloseOptions)
  )
}

// Why: terminal.closePane defaults to Mod+W, which on Windows/Linux is Ctrl+W —
// a chord the shell owns (unix-word-rubout). Its terminal scope survives the
// context gate, so terminal-first needs this carve-out: the default Ctrl-based
// binding yields to the shell, while an explicit user remap keeps closing the
// pane and macOS Cmd+W is unaffected because Cmd chords never reach the PTY.
function matchesClosePaneRespectingTerminalFirst(
  event: KeybindingInput,
  platform: NodeJS.Platform,
  keybindings: KeybindingOverrides | undefined,
  options?: KeybindingMatchOptions
): boolean {
  if (!keybindingMatchesAction('terminal.closePane', event, platform, keybindings, options)) {
    return false
  }
  if (
    options?.context !== 'terminal' ||
    normalizeTerminalShortcutPolicy(options.terminalShortcutPolicy) !== 'terminal-first'
  ) {
    return true
  }
  if (keybindings?.['terminal.closePane'] !== undefined) {
    return true
  }
  const isCtrlChord = (event.ctrlKey ?? event.control) === true
  const isMetaChord = (event.metaKey ?? event.meta) === true
  return !(isCtrlChord && !isMetaChord)
}
