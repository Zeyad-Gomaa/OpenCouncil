/** Local workspace access for coding-decision councils (list / read / grep). */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

export interface WorkspaceRef {
  root: string
  files: string[]
}

export interface ToolCall {
  name: 'list_dir' | 'read_file' | 'grep'
  path?: string
  pattern?: string
  glob?: string
  startLine?: number
  endLine?: number
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  'coverage',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'build',
  'out',
  'target',
  '.cache',
  '.turbo',
  '.idea',
  '.vscode',
])

const TEXT_EXT = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.rb',
  '.php',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.swift',
  '.md',
  '.json',
  '.yml',
  '.yaml',
  '.toml',
  '.sql',
  '.css',
  '.scss',
  '.html',
  '.vue',
  '.svelte',
  '.graphql',
  '.sh',
  '.env.example',
])

const MAX_FILE_BYTES = 200_000
const MAX_BRIEF_CHARS = 24_000
const MAX_TREE = 250
const MAX_GREP_HITS = 40

function expandHome(input: string): string {
  return input.trim().replace(/^~(?=\/|$)/, process.env.HOME || '')
}

export function resolveWorkspaceRoot(input: string): string {
  const abs = path.resolve(expandHome(input))
  if (!path.isAbsolute(abs)) throw new Error('workspace path must be absolute')
  if (!existsSync(abs)) throw new Error(`workspace not found: ${abs}`)
  const st = statSync(abs)
  if (!st.isDirectory() && !st.isFile()) throw new Error('workspace must be a file or folder')
  const root = st.isFile() ? path.dirname(abs) : abs
  if (root === '/' || root === path.parse(root).root) throw new Error('refusing to attach a filesystem root')
  return root
}

/** Resolve a user-supplied folder or file plus optional extra paths into a sandboxed workspace. */
export function normalizeWorkspace(input: string, extraFiles: string[] = []): WorkspaceRef {
  const abs = path.resolve(expandHome(input))
  if (!existsSync(abs)) throw new Error(`workspace not found: ${abs}`)
  const st = statSync(abs)
  const pointedFile = st.isFile() ? abs : null
  const root = resolveWorkspaceRoot(input)
  const files: string[] = []
  const seen = new Set<string>()
  const addRel = (rel: string) => {
    const n = rel.split(path.sep).join('/').replace(/^\.\//, '')
    if (!n || n === '.' || n.startsWith('../') || n === '..' || seen.has(n)) return
    try {
      resolveInside(root, n)
    } catch {
      return
    }
    seen.add(n)
    files.push(n)
  }
  if (pointedFile) addRel(path.relative(root, pointedFile))
  for (const raw of extraFiles) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const candidate = path.isAbsolute(expandHome(trimmed))
      ? path.resolve(expandHome(trimmed))
      : path.resolve(root, trimmed)
    addRel(path.relative(root, candidate))
  }
  return { root, files }
}

export function resolveInside(root: string, rel = '.'): string {
  const target = path.resolve(root, rel)
  const prefix = root.endsWith(path.sep) ? root : root + path.sep
  if (target !== root && !target.startsWith(prefix)) throw new Error('path escapes the workspace')
  return target
}

function isTextFile(file: string): boolean {
  const ext = path.extname(file).toLowerCase()
  if (TEXT_EXT.has(ext)) return true
  const base = path.basename(file)
  return base === 'Makefile' || base === 'Dockerfile' || base === 'CMakeLists.txt'
}

export function listTree(root: string, rel = '.', max = MAX_TREE): string[] {
  const dir = resolveInside(root, rel)
  const out: string[] = []
  const walk = (current: string) => {
    if (out.length >= max) return
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      return
    }
    entries.sort()
    for (const name of entries) {
      if (out.length >= max) return
      if (name.startsWith('.') && name !== '.env.example') continue
      if (SKIP_DIRS.has(name)) continue
      const full = path.join(current, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      const relative = path.relative(root, full)
      if (st.isDirectory()) {
        out.push(relative + '/')
        walk(full)
      } else if (st.isFile() && isTextFile(full) && st.size <= MAX_FILE_BYTES) {
        out.push(relative)
      }
    }
  }
  if (statSync(dir).isFile()) return [path.relative(root, dir) || path.basename(dir)]
  walk(dir)
  return out
}

export function readWorkspaceFile(root: string, rel: string, startLine?: number, endLine?: number): string {
  const full = resolveInside(root, rel)
  if (!existsSync(full) || !statSync(full).isFile()) throw new Error(`file not found: ${rel}`)
  if (statSync(full).size > MAX_FILE_BYTES) throw new Error(`file too large: ${rel}`)
  const raw = readFileSync(full, 'utf8')
  if (startLine == null && endLine == null) return raw.slice(0, MAX_FILE_BYTES)
  const lines = raw.split('\n')
  const from = Math.max(1, startLine ?? 1)
  const to = Math.min(lines.length, endLine ?? lines.length)
  return lines
    .slice(from - 1, to)
    .map((l, i) => `${from + i}|${l}`)
    .join('\n')
}

export function matchGlob(file: string, glob: string): boolean {
  const f = file.replace(/\\/g, '/')
  const g = glob.replace(/\\/g, '/').trim()
  if (!g) return true
  const re = g
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::GLOBSTAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::GLOBSTAR::/g, '.*')
  return new RegExp(`^${re}$`).test(f) || new RegExp(`(^|/)${re}$`).test(f)
}

export function grepWorkspace(root: string, pattern: string, rel = '.', glob?: string): string[] {
  let re: RegExp
  try {
    re = new RegExp(pattern, 'i')
  } catch {
    throw new Error('invalid grep pattern')
  }
  const files = listTree(root, rel, 400).filter((f) => !f.endsWith('/'))
  const filtered = glob ? files.filter((f) => matchGlob(f, glob)) : files
  const hits: string[] = []
  for (const file of filtered) {
    if (hits.length >= MAX_GREP_HITS) break
    let text: string
    try {
      text = readWorkspaceFile(root, file)
    } catch {
      continue
    }
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (hits.length >= MAX_GREP_HITS) break
      if (re.test(lines[i]!)) hits.push(`${file}:${i + 1}:${lines[i]!.slice(0, 200)}`)
    }
  }
  return hits
}

export function buildWorkspaceBriefing(ref: WorkspaceRef): string {
  const normalized = normalizeWorkspace(ref.root, ref.files)
  const root = normalized.root
  const extra = normalized.files
  const tree = listTree(root)
  const preferred = extra.length ? extra : tree.filter((f) => !f.endsWith('/')).slice(0, 12)
  const chunks: string[] = [
    `Workspace root: ${root}`,
    `File tree (${tree.length} entries, truncated):\n${tree.slice(0, MAX_TREE).join('\n')}`,
  ]
  let used = chunks.join('\n').length
  for (const rel of preferred) {
    if (used >= MAX_BRIEF_CHARS) break
    try {
      const body = readWorkspaceFile(root, rel).slice(0, 4000)
      const block = `\n--- ${rel} ---\n${body}`
      if (used + block.length > MAX_BRIEF_CHARS) break
      chunks.push(block)
      used += block.length
    } catch {
      /* skip unreadable */
    }
  }
  return chunks.join('\n')
}

export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = []
  const fence = /```tool\s*\n([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = fence.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1] || '{}') as ToolCall
      if (parsed && (parsed.name === 'list_dir' || parsed.name === 'read_file' || parsed.name === 'grep')) {
        calls.push(parsed)
      }
    } catch {
      /* ignore malformed */
    }
  }
  const xml = /<tool\s+name="(list_dir|read_file|grep)">([\s\S]*?)<\/tool>/gi
  while ((m = xml.exec(text)) !== null) {
    const name = m[1] as ToolCall['name']
    const inner = m[2] || ''
    const pathMatch = /<path>([\s\S]*?)<\/path>/i.exec(inner)
    const patternMatch = /<pattern>([\s\S]*?)<\/pattern>/i.exec(inner)
    const globMatchXml = /<glob>([\s\S]*?)<\/glob>/i.exec(inner)
    calls.push({
      name,
      path: pathMatch?.[1]?.trim(),
      pattern: patternMatch?.[1]?.trim(),
      glob: globMatchXml?.[1]?.trim(),
    })
  }
  return calls
}

export function runTool(root: string, call: ToolCall): string {
  try {
    if (call.name === 'list_dir') {
      const entries = listTree(root, call.path || '.')
      return `list_dir ${call.path || '.'}\n${entries.join('\n') || '(empty)'}`
    }
    if (call.name === 'read_file') {
      if (!call.path) return 'read_file error: path required'
      return `read_file ${call.path}\n${readWorkspaceFile(root, call.path, call.startLine, call.endLine)}`
    }
    if (call.name === 'grep') {
      if (!call.pattern) return 'grep error: pattern required'
      const hits = grepWorkspace(root, call.pattern, call.path || '.', call.glob)
      return `grep ${call.pattern}\n${hits.join('\n') || '(no matches)'}`
    }
    return `unknown tool ${String((call as { name: string }).name)}`
  } catch (err) {
    return `tool error: ${err instanceof Error ? err.message : String(err)}`
  }
}

export function stripToolBlocks(text: string): string {
  return text
    .replace(/```tool\s*\n[\s\S]*?```/gi, '')
    .replace(/<tool\s+name="[^"]+">[\s\S]*?<\/tool>/gi, '')
    .trim()
}

export const WORKSPACE_TOOL_PROMPT = `You have tools on a local workspace attached to this session.
When you need a file, list, or search, emit a tool block and stop — the runtime will call you again with results.

\`\`\`tool
{"name":"read_file","path":"relative/path.ts"}
\`\`\`

Tools: list_dir (optional path), read_file (path, optional startLine/endLine), grep (pattern, optional path, optional glob like "*.ts").
Paths are relative to the workspace root. Do not ask the human to paste files. After you have enough context, answer without a tool block.`
