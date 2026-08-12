import { describe, expect, it } from 'vitest'
import { resolveTerminalShortcutAction } from './terminal-shortcut-policy'
import {
  resolveWindowsShiftEnterEncoding,
  resolveWindowsShiftEnterEncodingForPane
} from './terminal-windows-shift-enter'

describe('Shift+Enter bytes for the resolved Windows encoding', () => {
  const shiftEnter = {
    key: 'Enter',
    code: 'Enter',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: true,
    repeat: false
  }

  it('sends LF for a proven Windows shell foreground (#12267)', () => {
    // PSReadLine binds LF (Ctrl+J) to AddLine; Esc+CR is unbound in plain shells.
    expect(
      resolveTerminalShortcutAction(
        shiftEnter,
        false,
        'false',
        0,
        true,
        undefined,
        undefined,
        () => false,
        undefined,
        () => 'newline',
        () => true
      )
    ).toEqual({ type: 'sendInput', data: '\n' })
  })

  it('lets active KKP outrank the shell heuristic', () => {
    expect(
      resolveTerminalShortcutAction(
        shiftEnter,
        false,
        'false',
        0,
        true,
        undefined,
        undefined,
        () => true,
        undefined,
        () => 'newline',
        () => true
      )
    ).toEqual({ type: 'sendInput', data: '\x1b[13;2u' })
  })

  it('keeps Esc+CR on non-Windows hosts even for shells', () => {
    // Why: zsh binds M-Return to self-insert-unmeta, so Esc+CR already newlines there.
    expect(
      resolveTerminalShortcutAction(
        shiftEnter,
        false,
        'false',
        0,
        false,
        undefined,
        undefined,
        () => false,
        undefined,
        () => 'newline',
        () => false
      )
    ).toEqual({ type: 'sendInput', data: '\x1b\r' })
  })
})

describe('resolveWindowsShiftEnterEncoding', () => {
  it('uses CSI-u only for trusted Droid process evidence', () => {
    expect(
      resolveWindowsShiftEnterEncoding({
        foreground: { agent: 'droid', routingTrusted: true, shellForeground: false }
      })
    ).toBe('csi-u')
    expect(resolveWindowsShiftEnterEncoding({ launchAgentType: 'droid' })).toBe('alt-enter')
  })

  it('uses CSI-u only for trusted Pi process evidence', () => {
    expect(
      resolveWindowsShiftEnterEncoding({
        foreground: { agent: 'pi', routingTrusted: true, shellForeground: false }
      })
    ).toBe('csi-u')
    expect(resolveWindowsShiftEnterEncoding({ launchAgentType: 'pi' })).toBe('alt-enter')
  })

  it('recovers Pi CSI-u from its explicit title when process trust is unavailable', () => {
    const state = {
      paneForegroundAgentByPaneKey: {
        'tab:pane': { agent: null, shellForeground: false }
      },
      agentLaunchConfigByPaneKey: {}
    }

    expect(resolveWindowsShiftEnterEncodingForPane(state, 'tab:pane', '⠸ Pi')).toBe('csi-u')
    expect(
      resolveWindowsShiftEnterEncodingForPane(
        { paneForegroundAgentByPaneKey: {}, agentLaunchConfigByPaneKey: {} },
        'tab:pane',
        'Pi ready'
      )
    ).toBe('csi-u')
  })

  it('keeps trusted process and shell evidence authoritative over titles', () => {
    const state = {
      paneForegroundAgentByPaneKey: {
        'tab:pane': {
          agent: 'codex' as const,
          routingTrusted: true,
          shellForeground: false
        }
      },
      agentLaunchConfigByPaneKey: {}
    }

    expect(resolveWindowsShiftEnterEncodingForPane(state, 'tab:pane', 'Pi ready')).toBe('alt-enter')
    // Why: a proven shell foreground routes LF (#12267) even when a stale
    // title still names an agent.
    expect(
      resolveWindowsShiftEnterEncodingForPane(
        {
          paneForegroundAgentByPaneKey: {
            'tab:pane': { agent: null, shellForeground: true }
          },
          agentLaunchConfigByPaneKey: {}
        },
        'tab:pane',
        'Pi ready'
      )
    ).toBe('newline')
  })

  it('does not let a stale title undo explicit routing revocation', () => {
    const state = {
      paneForegroundAgentByPaneKey: {
        'tab:pane': {
          agent: 'pi' as const,
          routingRevoked: true,
          shellForeground: false
        }
      },
      agentLaunchConfigByPaneKey: {}
    }

    expect(resolveWindowsShiftEnterEncodingForPane(state, 'tab:pane', 'Pi ready')).toBe('alt-enter')
  })

  it('keeps legacy bytes for plain shell and unsupported-agent titles', () => {
    const state = {
      paneForegroundAgentByPaneKey: {},
      agentLaunchConfigByPaneKey: {}
    }

    expect(resolveWindowsShiftEnterEncodingForPane(state, 'tab:pane', 'C:\\work\\pi-project')).toBe(
      'alt-enter'
    )
    expect(resolveWindowsShiftEnterEncodingForPane(state, 'tab:pane', 'Codex')).toBe('alt-enter')
  })

  it('does not let hook status route bytes without a pane title or process proof', () => {
    const state = {
      paneForegroundAgentByPaneKey: {},
      agentStatusByPaneKey: {
        'tab:pane': { agentType: 'droid' as const }
      },
      agentLaunchConfigByPaneKey: {}
    }

    expect(resolveWindowsShiftEnterEncodingForPane(state, 'tab:pane')).toBe('alt-enter')
  })

  it('keeps the legacy byte for Codex, Antigravity, unknown, and plain panes', () => {
    for (const agent of ['codex', 'antigravity', 'claude', null] as const) {
      expect(
        resolveWindowsShiftEnterEncoding({
          foreground: { agent, shellForeground: false }
        })
      ).toBe('alt-enter')
    }
    expect(resolveWindowsShiftEnterEncoding({})).toBe('alt-enter')
  })

  it('lets current process identity override stale launch ownership', () => {
    expect(
      resolveWindowsShiftEnterEncoding({
        foreground: { agent: 'antigravity', routingTrusted: true, shellForeground: false },
        launchAgentType: 'droid'
      })
    ).toBe('alt-enter')
  })

  it('fails closed while a newer command generation awaits trusted evidence', () => {
    expect(
      resolveWindowsShiftEnterEncoding({
        foreground: { agent: 'droid', shellForeground: false },
        launchAgentType: 'droid'
      })
    ).toBe('alt-enter')
    expect(
      resolveWindowsShiftEnterEncoding({
        foreground: { agent: null, shellForeground: false },
        launchAgentType: 'droid'
      })
    ).toBe('alt-enter')
  })

  it('keeps launch ownership on its original leaf after a split sibling survives', () => {
    const state = {
      paneForegroundAgentByPaneKey: {},
      agentLaunchConfigByPaneKey: {
        'tab:launched-droid': { identity: { agentType: 'droid' } }
      }
    }

    expect(resolveWindowsShiftEnterEncodingForPane(state, 'tab:launched-droid')).toBe('alt-enter')
    // Why: after split→close leaves only the sibling, pane count is no longer
    // ownership evidence; the surviving leaf must keep the legacy fallback.
    expect(resolveWindowsShiftEnterEncodingForPane(state, 'tab:surviving-sibling')).toBe(
      'alt-enter'
    )
  })

  it('clears stale Droid ownership after the foreground returns to the shell', () => {
    expect(
      resolveWindowsShiftEnterEncoding({
        foreground: { agent: null, shellForeground: true },
        launchAgentType: 'droid'
      })
    ).toBe('newline')
  })
})
