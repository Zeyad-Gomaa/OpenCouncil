import { describe, expect, it } from 'vitest'
import { parseArgs } from '../cli.js'

describe('headless CLI parsing', () => {
  it('recognizes non-server commands and JSON output', () => {
    expect(parseArgs(['council', 'list', '--json'])).toMatchObject({
      command: 'council',
      subcommand: 'list',
      json: true,
    })
  })

  it('rejects unknown options and invalid ports', () => {
    expect(() => parseArgs(['--wat'])).toThrow(/unknown option/)
    expect(() => parseArgs(['--port', 'abc'])).toThrow(/invalid port/)
  })

  it('leaves host and port unset when no flag is passed, so env config still applies', () => {
    const args = parseArgs([])
    expect(args.host).toBeUndefined()
    expect(args.port).toBeUndefined()
  })

  it('reports host and port only when explicitly given', () => {
    expect(parseArgs(['--host', '0.0.0.0', '--port', '9000'])).toMatchObject({ host: '0.0.0.0', port: 9000 })
    expect(parseArgs(['8080'])).toMatchObject({ port: 8080 })
  })
})
