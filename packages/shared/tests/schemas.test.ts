import { describe, expect, it } from 'vitest'
import { providerCreateSchema, councilCreateSchema, sessionCreateSchema } from '@opencouncil/shared'

describe('schemas', () => {
  it('accepts a valid provider', () => {
    const r = providerCreateSchema.parse({
      name: 'OpenAI',
      protocol: 'openai_compatible',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-x',
    })
    expect(r.name).toBe('OpenAI')
  })

  it('rejects bad protocol', () => {
    expect(() => providerCreateSchema.parse({ name: 'x', protocol: 'nope' })).toThrow()
  })

  it('council moderator must be in memberIds', () => {
    expect(() =>
      councilCreateSchema.parse({
        name: 'C',
        strategy: 'debate',
        rounds: 2,
        memberIds: ['11111111-1111-4111-8111-111111111111'],
        moderatorMemberId: '22222222-2222-4222-8222-222222222222',
      }),
    ).toThrow(/moderator/)
  })

  it('session topic length enforced', () => {
    expect(() => sessionCreateSchema.parse({ councilId: '11111111-1111-4111-8111-111111111111', topic: '' })).toThrow()
  })
})
