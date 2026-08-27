/** Best-effort cleanup of LLM-authored Mermaid so parse failures are rarer. */

const DIAGRAM_START =
  /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|erDiagram|gantt|pie|gitGraph|mindmap|timeline|journey|C4Context|quadrantChart|sankey-beta|xychart-beta|block-beta|packet-beta)\b/i

export function sanitizeMermaid(input: string): string {
  let text = input.replace(/^\uFEFF/, '').trim()
  if (!text) return text

  text = text
    .replace(/^```(?:mermaid)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  text = text.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'")
  text = text.replace(/<br\s*\/?>/gi, '<br/>')
  text = text.replace(/\t/g, '    ')

  const lines = text.split('\n')
  const firstCode = lines.find((l) => l.trim() && !l.trim().startsWith('%%'))
  if (firstCode && !DIAGRAM_START.test(firstCode.trim())) {
    lines.unshift('flowchart TD')
  }

  const sanitized = lines.map((line) => {
    const trimmed = line.trim()
    if (trimmed === 'end') return line
    // `end` is reserved (subgraph terminator). Models often use it as a node id.
    return line.replace(/(^|[\s;])end(?=\s*(\[|\(|\{|-->|---|==>|-.->))/g, '$1endNode')
  })

  return sanitized.join('\n').trim()
}

export function isMermaidErrorSvg(svg: string): boolean {
  return (
    /syntax error in text/i.test(svg) || /class="error-icon"/i.test(svg) || /aria-roledescription="error"/i.test(svg)
  )
}

/** Remove leftover mermaid parse-error nodes that it injects onto document.body. */
export function cleanupMermaidDom(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll('svg[aria-roledescription="error"]').forEach((el) => {
    const host = el.parentElement
    if (host && host !== document.body && host.childElementCount <= 2 && host.parentElement === document.body) {
      host.remove()
    } else {
      el.remove()
    }
  })
  document.querySelectorAll('[id^="dmermaid"], [id^="mermaid_"]').forEach((el) => {
    if (el.parentElement === document.body) el.remove()
  })
}
