import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildWorkspaceBriefing,
  listTree,
  grepWorkspace,
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
  dir = realpathSync(dir)
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
  it('rejects relative paths and root aliases', () => {
    expect(() => resolveWorkspaceRoot('.')).toThrow(/absolute/)
    symlinkSync('/', path.join(dir, 'root-link'))
    expect(() => resolveWorkspaceRoot(path.join(dir, 'root-link'))).toThrow(/root/)
  })

  it('blocks external file and directory symlinks and skips cycles', () => {
    const outside = dir + '-outside'
    mkdirSync(outside)
    writeFileSync(path.join(outside, 'secret.ts'), 'outside-secret')
    try {
      symlinkSync(path.join(outside, 'secret.ts'), path.join(dir, 'linked.ts'))
      symlinkSync(outside, path.join(dir, 'linked-dir'))
      symlinkSync(dir, path.join(dir, 'src', 'cycle'))
      expect(() => readWorkspaceFile(dir, 'linked.ts')).toThrow(/escapes/)
      expect(() => readWorkspaceFile(dir, 'linked-dir/secret.ts')).toThrow(/escapes/)
      expect(() => listTree(dir, 'linked-dir')).toThrow(/escapes/)
      expect(listTree(dir).join(' ')).not.toMatch(/linked|cycle/)
      expect(buildWorkspaceBriefing({ root: dir, files: ['linked.ts'] })).not.toContain('outside-secret')
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('blocks secrets via direct reads and aliases but permits environment examples', () => {
    for (const name of ['.env', '.env.local', '.secret_key', 'credentials.json', 'private.pem', '.npmrc']) {
      writeFileSync(path.join(dir, name), 'credential-sentinel')
      expect(() => readWorkspaceFile(dir, name)).toThrow(/sensitive/)
    }
    symlinkSync(path.join(dir, 'credentials.json'), path.join(dir, 'innocent.json'))
    expect(() => readWorkspaceFile(dir, 'innocent.json')).toThrow(/sensitive/)
    writeFileSync(path.join(dir, '.env.example'), 'KEY=example')
    expect(listTree(dir)).toContain('.env.example')
    expect(readWorkspaceFile(dir, '.env.example')).toContain('KEY=example')
    expect(grepWorkspace(dir, 'credential-sentinel')).toEqual([])
  })

  it('treats model-generated grep patterns as literal text', () => {
    writeFileSync(path.join(dir, 'pattern.ts'), 'literal (a+)+$ and Foo.Bar')
    expect(grepWorkspace(dir, '(a+)+$')).toHaveLength(1)
    expect(grepWorkspace(dir, 'foo.bar')).toHaveLength(1)
    expect(grepWorkspace(dir, 'fooXbar')).toHaveLength(0)
  })

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
    const text = `Need the file.\n\`\`\`tool\n{"name":"read_file","path":"src/app.ts"}\n\`\`\`\n<tool name="grep"><pattern>add</pattern></tool>\n\`\`\`tool\n{"name":"web_search","query":"TypeScript queue best practices"}\n\`\`\``
    const calls = parseToolCalls(text)
    expect(calls.map((c) => c.name)).toEqual(['read_file', 'web_search', 'grep'])
    expect(calls[0]?.path).toBe('src/app.ts')
    expect(calls[1]?.query).toContain('TypeScript')
    expect(stripToolBlocks(text)).toBe('Need the file.')
  })

  it('rejects oversized or invalid model-authored tool arguments', () => {
    const text = [
      `\`\`\`tool\n${JSON.stringify({ name: 'read_file', path: 'x'.repeat(1001) })}\n\`\`\``,
      `\`\`\`tool\n${JSON.stringify({ name: 'grep', pattern: 'ok', startLine: -1 })}\n\`\`\``,
      `\`\`\`tool\n${JSON.stringify({ name: 'read_file', path: 'src/app.ts', startLine: 1, endLine: 3000 })}\n\`\`\``,
    ].join('\n')
    expect(parseToolCalls(text)).toEqual([])
  })

  it('bounds tool output returned to a model', () => {
    writeFileSync(path.join(dir, 'large.ts'), 'x'.repeat(40_000))
    const result = runTool(dir, { name: 'read_file', path: 'large.ts' })
    expect(result.length).toBeLessThan(30_100)
    expect(result).toContain('tool result truncated')
  })
})
