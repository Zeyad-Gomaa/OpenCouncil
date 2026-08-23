import { beforeAll, describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, setVaultKeyForTests } from '../vault/crypto.js'

beforeAll(() => {
  setVaultKeyForTests('test-master-secret-123')
})

describe('vault', () => {
  it('roundtrips a secret', () => {
    const enc = encryptSecret('sk-super-secret-key')
    expect(enc).not.toContain('sk-super-secret-key')
    expect(decryptSecret(enc)).toBe('sk-super-secret-key')
  })

  it('produces unique ciphertexts (random IV)', () => {
    const a = encryptSecret('same-plain')
    const b = encryptSecret('same-plain')
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe('same-plain')
    expect(decryptSecret(b)).toBe('same-plain')
  })

  it('rejects malformed ciphertext', () => {
    expect(() => decryptSecret('garbage')).toThrow()
  })

  it('tamper detection via GCM tag', () => {
    const enc = encryptSecret('valuable')
    const tampered = `${enc.slice(0, -4)}AAAA`
    expect(() => decryptSecret(tampered)).toThrow()
  })
})
