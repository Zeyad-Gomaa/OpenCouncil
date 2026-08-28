import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildWorkspaceBriefing,
  matchGlob,
  normalizeWorkspace,
  parseToolCalls,
  readWorkspaceFile,
  resolveWorkspaceRoot,
  runTool,
  stripToolBlocks,
} from '../engine/workspace.js'

let dir: string

beforeEach(() => {
  dir = path.join(os.tmpdir(), `oc-ws-${Date.now()}`)
  mkdirSync(path.join(dir, 'src'), { recursive: true })
  writeFileSync(path.join(dir, 'README.md'), '# Hello\n')
  writeFileSync(
    path.join(dir, 'src', 'app.ts'),
    'export const x = 1\nexport function add(a: number, b: number) { return a + b }\n',
  )
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('workspace', () => {
  it('refuses a filesystem root and missing paths', () => {
    expect(() => resolveWorkspaceRoot('/')).toThrow(/root/)
    expect(() => resolveWorkspaceRoot(path.join(dir, 'nope'))).toThrow(/not found/)
  })

  it('builds a briefing with tree and file excerpts', () => {
    const brief = buildWorkspaceBriefing({ root: dir, files: ['src/app.ts'] })
    expect(brief).toContain('src/app.ts')
    expect(brief).toContain('export const x = 1')
    expect(brief).toContain('README.md')
  })

  it('blocks path escape and runs tools', () => {
    expect(() => readWorkspaceFile(dir, '../secret')).toThrow(/escapes/)
    const listed = runTool(dir, { name: 'list_dir', path: 'src' })
    expect(listed).toContain('src/app.ts')
    const grep = runTool(dir, { name: 'grep', pattern: 'export function add' })
    expect(grep).toMatch(/app\.ts:2:/)
  })

  it('normalizes a pointed file into that file’s directory', () => {
    const ref = normalizeWorkspace(path.join(dir, 'src', 'app.ts'))
    expect(ref.root).toBe(path.join(dir, 'src'))
    expect(ref.files).toEqual(['app.ts'])
  })

  it('keeps extra files that sit inside a folder workspace', () => {
    const ref = normalizeWorkspace(dir, ['src/app.ts', path.join(dir, 'README.md')])
    expect(ref.root).toBe(dir)
    expect(ref.files).toEqual(['src/app.ts', 'README.md'])
  })

  it('matches simple globs', () => {
    expect(matchGlob('src/app.ts', '*.ts')).toBe(true)
    expect(matchGlob('src/app.ts', '**/*.ts')).toBe(true)
    expect(matchGlob('src/app.ts', '*.md')).toBe(false)
  })

  it('parses tool fences and xml, then strips them', () => {
    const text = `Need the file.\n\`\`\`tool\n{"name":"read_file","path":"src/app.ts"}\n\`\`\`\n<tool name="grep"><pattern>add</pattern></tool>`
    const calls = parseToolCalls(text)
    expect(calls.map((c) => c.name)).toEqual(['read_file', 'grep'])
    expect(calls[0]?.path).toBe('src/app.ts')
    expect(stripToolBlocks(text)).toBe('Need the file.')
  })
})
