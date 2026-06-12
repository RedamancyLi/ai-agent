import { useEffect, useRef } from "react"
import type { MessageItem } from "../types"
import { AssistantMessage } from "./AssistantMessage"
import { Composer } from "./Composer"

const CHIPS = [
  { label: "🌤 查天气", prompt: "上海天气怎么样？" },
  { label: "📈 蓝色光标", prompt: "查询蓝色光标今天的走势" },
  { label: "📈 贵州茅台", prompt: "查询贵州茅台股票实时行情" },
  { label: "📊 苹果股票", prompt: "AAPL 股票现在多少钱？" },
  { label: "🔢 计算器", prompt: "计算 (12+8)*3" }
]

interface Props {
  messages: MessageItem[]
  busy: boolean
  canSend: boolean
  durationMs: number | null
  onSend: (text: string) => void
  onStop: () => void
  onApprove: (assistantId: string, sessionId: string, approved: boolean) => void
}

export function ChatPanel({
  messages,
  busy,
  canSend,
  durationMs,
  onSend,
  onStop,
  onApprove
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, busy])

  return (
    <main className="chat">
      <header className="chat-header">
        <div className="chat-header-inner">
          <div className="chat-header-title">
            <h2>对话</h2>
            <span className="chat-header-sub">多轮上下文 · 工具可视化</span>
          </div>
          {durationMs != null && (
            <span className="duration-pill">
              {(durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </header>

      <div className="messages scroll-thin">
        <div className="messages-inner">
          {messages.length === 0 ? (
            <div className="welcome-hero">
              <div className="welcome-orb" aria-hidden="true" />
              <h3 className="welcome-title">有什么可以帮你？</h3>
              <p className="welcome-desc">
                支持查天气、股票行情、时间与计算，并可视化 Agent 工具调用过程。
              </p>
              <div className="welcome-chips">
                {CHIPS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    className="chip"
                    disabled={busy}
                    onClick={() => onSend(c.prompt)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) =>
              m.type === "user" ? (
                <div key={m.id} className="msg-row user">
                  <div className="msg-body">
                    <span className="msg-label">你</span>
                    <div className="bubble user-bubble">{m.content}</div>
                  </div>
                  <div className="avatar avatar-user" aria-hidden="true">
                    你
                  </div>
                </div>
              ) : (
                <AssistantMessage
                  key={m.id}
                  item={m}
                  busy={busy}
                  onApprove={onApprove}
                />
              )
            )
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <Composer
        busy={busy}
        canSend={canSend}
        onSend={onSend}
        onStop={onStop}
      />
    </main>
  )
}
