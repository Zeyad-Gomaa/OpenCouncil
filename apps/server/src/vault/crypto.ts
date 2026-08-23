/** AES-256-GCM vault for provider API keys at rest. */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12

let cachedKey: Buffer | null = null

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'opencouncil.vault.v1', 32)
}

/** Called once at app bootstrap with the configured master secret. */
export function initVault(secret: string): void {
  cachedKey = deriveKey(secret)
}

/** Test seam: prime the key directly. */
export function setVaultKeyForTests(secret: string): void {
  initVault(secret)
}

function getKey(): Buffer {
  if (!cachedKey) {
    throw new Error('vault: not initialized — call initVault() before encrypt/decrypt')
  }
  return cachedKey
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':')
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('vault: malformed ciphertext')
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}
