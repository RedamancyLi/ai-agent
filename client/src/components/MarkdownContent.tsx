import { useEffect, useMemo, useRef } from "react"
import hljs from "highlight.js"
import { renderMarkdownHtml } from "../lib/markdown"

interface Props {
  content: string
  className?: string
}

export function MarkdownContent({ content, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(() => renderMarkdownHtml(content), [content])

  useEffect(() => {
    if (!ref.current) return
    ref.current.querySelectorAll("pre code").forEach((block) => {
      hljs.highlightElement(block as HTMLElement)
    })
  }, [html])

  return (
    <div
      ref={ref}
      className={`markdown-body ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
