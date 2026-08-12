/**
 * CI smoke test for Open With discovery on macOS/Linux runners.
 * Runs the real platform discovery modules against real OS tools —
 * no mocks. See .github/workflows/open-with-smoke.yml.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'open-with-smoke-'))
const mdFile = join(dir, 'sample.md')
const htmlFile = join(dir, 'sample.html')
writeFileSync(mdFile, '# open with smoke test\n')
writeFileSync(htmlFile, '<!doctype html><title>smoke</title>\n')

function logTool(command: string, args: string[]): void {
  try {
    console.log(`$ ${command} ${args.join(' ')}`)
    console.log(execFileSync(command, args, { encoding: 'utf8' }).trim())
  } catch (error) {
    console.log(`  (failed: ${error instanceof Error ? error.message : String(error)})`)
  }
}

if (process.platform === 'darwin') {
  const { listMacOpenWithApplications } =
    await import('../../src/main/open-with/macos-open-with-applications')
  for (const file of [mdFile, htmlFile]) {
    const apps = await listMacOpenWithApplications(file)
    console.log(
      file,
      JSON.stringify(
        apps.map((a) => ({ name: a.name, isDefault: a.isDefault })),
        null,
        2
      )
    )
    if (!Array.isArray(apps)) {
      throw new Error('listing is not an array')
    }
  }
  const htmlApps = await listMacOpenWithApplications(htmlFile)
  if (htmlApps.length === 0) {
    throw new Error('expected at least one registered handler for .html on macOS')
  }
  // Launch path: same `open -a <app> <file>` invocation production uses.
  const launchTarget = htmlApps.find((a) => a.launch.kind === 'macos-application')
  if (launchTarget?.launch.kind === 'macos-application') {
    execFileSync('open', ['-a', launchTarget.launch.applicationPath, htmlFile])
    console.log(`launched ${launchTarget.name} via open -a`)
  }
} else if (process.platform === 'linux') {
  logTool('xdg-mime', ['query', 'filetype', mdFile])
  logTool('gio', ['mime', 'text/markdown'])

  const { listLinuxOpenWithApplications } =
    await import('../../src/main/open-with/linux-open-with-applications')
  const apps = await listLinuxOpenWithApplications(mdFile)
  console.log(
    mdFile,
    JSON.stringify(
      apps.map((a) => ({ name: a.name, isDefault: a.isDefault })),
      null,
      2
    )
  )
  if (!Array.isArray(apps)) {
    throw new Error('listing is not an array')
  }
  // The workflow registers a "Smoke Editor" desktop entry for text/markdown;
  // the discovery pipeline must surface it end-to-end.
  if (!apps.some((a) => a.name === 'Smoke Editor')) {
    throw new Error('expected the registered Smoke Editor desktop entry in the listing')
  }
} else {
  console.log('smoke test targets macOS/Linux runners; skipping on', process.platform)
}

console.log('SMOKE OK')
