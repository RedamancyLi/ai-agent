import DOMPurify from "dompurify"
import { marked } from "marked"

marked.setOptions({ breaks: true, gfm: true })

export function renderMarkdownHtml(text: string): string {
  if (!text) return ""
  const raw = marked.parse(text, { async: false }) as string
  return DOMPurify.sanitize(raw)
}
