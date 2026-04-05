'use client'
import { useEffect, useRef, useCallback } from 'react'

interface RichTextareaProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  rows?: number
  className?: string
}

// Extract only bold formatting from clipboard HTML.
// Converts <b>, <strong>, and inline font-weight:bold spans to <strong>.
// Strips all other HTML tags, preserving text content and line breaks.
function extractBoldHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const el = node as Element
    const children = Array.from(el.childNodes).map(walk).join('')
    const tag = el.tagName.toLowerCase()
    const style = el.getAttribute('style') || ''
    const isBold =
      tag === 'b' ||
      tag === 'strong' ||
      /font-weight\s*:\s*(bold|[6-9]\d\d|1000)/i.test(style)

    if (isBold && children.trim()) return `<strong>${children}</strong>`
    if (tag === 'br') return '<br>'
    if (tag === 'p' || tag === 'div') return children ? children + '<br>' : ''
    return children
  }

  return walk(doc.body)
    .replace(/(<br\s*\/?>\s*){2,}/g, '<br>')  // collapse consecutive <br>
    .replace(/^(<br\s*\/?>)+|(<br\s*\/?>)+$/g, '')  // trim leading/trailing <br>
}

export function RichTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className = '',
}: RichTextareaProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isFocused = useRef(false)
  const lastValue = useRef(value)

  // Sync value prop → innerHTML only when the element is not focused.
  // This prevents cursor jumping while the admin is typing.
  useEffect(() => {
    if (!ref.current || isFocused.current) return
    if (value === lastValue.current) return
    ref.current.innerHTML = value || ''
    lastValue.current = value
  }, [value])

  const emit = useCallback(() => {
    if (!ref.current) return
    const html = ref.current.innerHTML
    lastValue.current = html
    onChange(html)
  }, [onChange])

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault()
      const html = e.clipboardData.getData('text/html')
      const plain = e.clipboardData.getData('text/plain')

      const insertHtml = html
        ? extractBoldHtml(html)
        : plain
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>')

      document.execCommand('insertHTML', false, insertHtml)
      emit()
    },
    [emit]
  )

  const handleBold = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault() // keep focus in the editor
      document.execCommand('bold')
      ref.current?.focus()
      emit()
    },
    [emit]
  )

  const minHeight = `${rows * 1.6}rem`

  return (
    <div className="w-full">
      {/* Minimal toolbar — Bold only */}
      <div className="flex items-center gap-1 px-2 py-1 border border-b-0 rounded-t-md bg-gray-50 border-input">
        <button
          type="button"
          onMouseDown={handleBold}
          className="px-2 py-0.5 text-sm font-bold text-gray-700 hover:bg-gray-200 rounded transition-colors select-none"
          title="Bold (Ctrl+B)"
        >
          B
        </button>
      </div>

      {/* contentEditable area */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => { isFocused.current = true }}
        onBlur={() => { isFocused.current = false }}
        onInput={emit}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        style={{ minHeight }}
        className={[
          'w-full px-3 py-2 text-sm border border-input rounded-b-md bg-background',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0',
          'leading-relaxed',
          // placeholder via CSS — only when div is empty
          '[&:empty]:before:content-[attr(data-placeholder)]',
          '[&:empty]:before:text-muted-foreground',
          '[&:empty]:before:pointer-events-none',
          className,
        ].join(' ')}
      />
    </div>
  )
}
