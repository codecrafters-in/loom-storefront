import { useMemo, useState } from 'react'
import { Icon } from './ui/index.jsx'

/**
 * A small markdown renderer.
 *
 * Deliberately not a library. The admin docs are our own files in a known
 * subset — headings, fences, tables, lists, blockquotes, links, inline code and
 * bold — and a parser for exactly that is a hundred lines against a hundred
 * kilobytes of dependency that would ship inside the back office.
 *
 * Code fences get a copy button, because half of what these pages contain is
 * meant to be pasted into an AI or a terminal.
 */
export default function Markdown({ source }) {
  const blocks = useMemo(() => parse(source || ''), [source])
  return <div className="max-w-3xl">{blocks.map((b, i) => <Block key={i} block={b} />)}</div>
}

function parse(src) {
  const lines = src.split('\n')
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const body = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++])
      i += 1
      out.push({ type: 'code', lang, text: body.join('\n') })
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    if (heading) {
      out.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      i += 1
      continue
    }

    if (/^\s*[-*]{3,}\s*$/.test(line)) {
      out.push({ type: 'rule' })
      i += 1
      continue
    }

    // A table is a header row, a separator, then rows.
    if (line.startsWith('|') && lines[i + 1] && /^\|[\s|:-]+\|$/.test(lines[i + 1].trim())) {
      const rows = []
      const header = cells(line)
      i += 2
      while (i < lines.length && lines[i].startsWith('|')) rows.push(cells(lines[i++]))
      out.push({ type: 'table', header, rows })
      continue
    }

    if (line.startsWith('> ')) {
      const body = []
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''))
      out.push({ type: 'quote', text: body.join(' ') })
      continue
    }

    const bullet = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(line)
    if (bullet) {
      const ordered = /\d/.test(bullet[1])
      const items = []
      while (i < lines.length) {
        const m = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(lines[i])
        if (!m) break
        items.push(m[2])
        i += 1
      }
      out.push({ type: 'list', ordered, items })
      continue
    }

    if (!line.trim()) {
      i += 1
      continue
    }

    // Paragraph. The guard below stops at anything that starts another block,
    // but a line can start with one of those characters without opening one —
    // a bare `|` outside a table, a `#hashtag` with no space, a single
    // backtick. Those match no branch above and are refused here, so without
    // the forward-progress check the loop never advances: the tab hangs and
    // then the heap dies. Consume one line unconditionally if nothing else did.
    const startedAt = i
    const para = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|>\s|```)/.test(lines[i]) &&
      !/^\s*([-*]|\d+\.)\s/.test(lines[i])
    ) {
      para.push(lines[i++])
    }
    if (i === startedAt) para.push(lines[i++])
    out.push({ type: 'p', text: para.join(' ') })
  }

  return out
}

const cells = (row) => row.split('|').slice(1, -1).map((c) => c.trim())

function Block({ block }) {
  switch (block.type) {
    case 'heading': {
      const size = { 1: 'text-display-md mt-0', 2: 'text-xl mt-12', 3: 'text-[17px] mt-9', 4: 'text-[15px] mt-7' }[block.level]
      const Tag = `h${Math.min(block.level, 6)}`
      return <Tag className={`font-display font-medium ${size} mb-3 scroll-mt-24`}>{inline(block.text)}</Tag>
    }
    case 'p':
      return <p className="mb-4 text-[14px] leading-relaxed text-muted">{inline(block.text)}</p>
    case 'code':
      return <CodeBlock {...block} />
    case 'rule':
      return <hr className="my-10 border-line" />
    case 'quote':
      return (
        <blockquote className="mb-4 border-s-2 border-accent bg-accent-soft/40 py-3 ps-4 text-[14px] leading-relaxed text-muted">
          {inline(block.text)}
        </blockquote>
      )
    case 'list':
      return block.ordered ? (
        <ol className="mb-4 list-decimal space-y-2 ps-5 text-[14px] leading-relaxed text-muted">
          {block.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
        </ol>
      ) : (
        <ul className="mb-4 list-disc space-y-2 ps-5 text-[14px] leading-relaxed text-muted">
          {block.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
        </ul>
      )
    case 'table':
      return (
        <div className="mb-5 overflow-x-auto rounded-xs border border-line">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-sunken/40 text-start">
                {block.header.map((h, i) => <th key={i} className="p-2.5 font-medium">{inline(h)}</th>)}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {r.map((c, k) => <td key={k} className="p-2.5 align-top text-muted">{inline(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    default:
      return null
  }
}

function CodeBlock({ text, lang }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — the text is selectable anyway */
    }
  }
  return (
    <div className="relative mb-5 rounded-xs border border-line bg-sunken/50">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">{lang || 'text'}</span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-accent">
          <Icon name={copied ? 'check' : 'package'} size={12} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 text-[12px] leading-relaxed">
        <code className="font-mono">{text}</code>
      </pre>
    </div>
  )
}

/** Inline: `code`, **bold**, [text](url). Rendered in that precedence order. */
function inline(text) {
  const parts = []
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('`')) {
      parts.push(
        <code key={m.index} className="rounded-xs bg-sunken px-1.5 py-0.5 font-mono text-[12px] text-ink">
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('**')) {
      parts.push(<strong key={m.index} className="font-medium text-ink">{token.slice(2, -2)}</strong>)
    } else {
      const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(token)
      const href = link[2]
      const internal = href.endsWith('.md')
      parts.push(
        <a
          key={m.index}
          href={internal ? `/admin/docs/${href.replace(/\.md$/, '').toLowerCase()}` : href}
          target={internal ? undefined : '_blank'}
          rel={internal ? undefined : 'noreferrer'}
          className="text-accent link-underline"
        >
          {link[1]}
        </a>,
      )
    }
    last = m.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
