/** Only explicit web links (and email links) are accepted from model output. */
export function safeUrl(raw: string, image = false): string | null {
  if (Array.from(raw).some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return null
  try {
    const url = new URL(raw)
    if (url.username || url.password) return null
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
    if (!image && url.protocol === 'mailto:') return url.href
  } catch {
    /* malformed or relative URL */
  }
  return null
}
