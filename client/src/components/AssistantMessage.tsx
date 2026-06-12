import type { AssistantItem } from "../types"
import { AgentTimeline } from "./AgentTimeline"
import { MarkdownContent } from "./MarkdownContent"

interface Props {
  item: AssistantItem
  busy: boolean
  onApprove: (assistantId: string, sessionId: string, approved: boolean) => void
}

export function AssistantMessage({ item, busy, onApprove }: Props) {
  return (
    <div className={`msg-row assistant${item.isError ? " error" : ""}`}>
      <div className="avatar avatar-ai" aria-hidden="true">
        AI
      </div>
      <div className="msg-body">
        <span className="msg-label">助手</span>
        <div className="msg-card">
          <AgentTimeline
            item={item}
            busy={busy}
            onApprove={(sid, ok) => onApprove(item.id, sid, ok)}
          />
          <div className="bubble assistant-bubble">
            {item.isError ? (
              <span>{item.rawText}</span>
            ) : item.rawText ? (
              <MarkdownContent content={item.rawText} />
            ) : (
              <span className="typing-inline">
                <span />
                <span />
                <span />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
