import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react"

interface Props {
  busy: boolean
  canSend: boolean
  onSend: (text: string) => void
  onStop: () => void
}

export function Composer({ busy, canSend, onSend, onStop }: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!busy) inputRef.current?.focus()
  }, [busy])

  const submit = () => {
    const el = inputRef.current
    if (!el) return
    const text = el.value.trim()
    if (!text || busy || !canSend) return
    onSend(text)
    el.value = ""
    el.style.height = "auto"
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const onInput = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  return (
    <footer className="composer">
      <form className="composer-form" onSubmit={onSubmit}>
        <div className="composer-box">
          <textarea
            ref={inputRef}
            className="composer-input"
            rows={1}
            placeholder="输入消息，开始对话…"
            autoComplete="off"
            disabled={!canSend}
            onKeyDown={onKeyDown}
            onInput={onInput}
          />
          <div className="composer-actions">
            {busy && (
              <button
                type="button"
                className="btn btn-stop"
                onClick={onStop}
                title="停止生成"
              >
                停止
              </button>
            )}
            <button
              type="submit"
              className="btn btn-send"
              disabled={busy || !canSend}
              aria-label="发送消息"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 19V5M5 12l7-7 7 7"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <p className="composer-hint">Enter 发送 · Shift+Enter 换行</p>
      </form>
    </footer>
  )
}
