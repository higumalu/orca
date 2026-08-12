import { describe, expect, it } from 'vitest'
import {
  resolveTerminalShortcutAction,
  type TerminalShortcutEvent
} from './terminal-shortcut-policy'

function event(overrides: Partial<TerminalShortcutEvent>): TerminalShortcutEvent {
  return {
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides
  }
}

describe('terminal pane close chord under the terminal shortcut policy', () => {
  it('yields the default Ctrl+W pane-close chord to the shell under terminal-first (#13015)', () => {
    const resolveOnWindows = (
      keybindings?: Parameters<typeof resolveTerminalShortcutAction>[5],
      policy: 'orca-first' | 'terminal-first' = 'terminal-first'
    ) =>
      resolveTerminalShortcutAction(
        event({ key: 'w', code: 'KeyW', ctrlKey: true }),
        false,
        'false',
        0,
        true,
        keybindings,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        policy
      )

    // Default Mod+W binding yields to the shell (bash unix-word-rubout / PSReadLine).
    expect(resolveOnWindows()).toBeNull()
    // orca-first keeps the existing pane-close behavior.
    expect(resolveOnWindows(undefined, 'orca-first')).toEqual({ type: 'closeActivePane' })
    // An explicit user remap onto the same chord still closes the pane.
    expect(resolveOnWindows({ 'terminal.closePane': ['Mod+W'] })).toEqual({
      type: 'closeActivePane'
    })
    // A remap elsewhere closes via the remapped chord, not Ctrl+W.
    expect(resolveOnWindows({ 'terminal.closePane': ['Mod+Shift+W'] })).toBeNull()
  })

  it('keeps macOS Cmd+W closing the pane under terminal-first', () => {
    // Why: Cmd chords never reach the PTY, so yielding Cmd+W would just lose the shortcut.
    expect(
      resolveTerminalShortcutAction(
        event({ key: 'w', code: 'KeyW', metaKey: true }),
        true,
        'false',
        0,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'terminal-first'
      )
    ).toEqual({ type: 'closeActivePane' })
  })
})
