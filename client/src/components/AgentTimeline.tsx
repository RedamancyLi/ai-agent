import type { AssistantItem, TimelineStep } from "../types"

const STEP_ICON: Record<string, string> = {
  model: "推理",
  approval: "授权",
  tool: "工具",
  reply: "回复"
}

const STATUS_LABEL: Record<string, string> = {
  pending: "待确认",
  active: "进行中",
  done: "完成",
  rejected: "已拒绝",
  error: "失败"
}

interface Props {
  item: AssistantItem
  busy: boolean
  onApprove: (sessionId: string, approved: boolean) => void
}

function ApprovalBlock({
  step,
  sessionId,
  busy,
  onApprove
}: {
  step: TimelineStep
  sessionId: string | null
  busy: boolean
  onApprove: (sessionId: string, approved: boolean) => void
}) {
  const pending = step.meta?.pending ?? []
  if (!sessionId) return null

  return (
    <div className="timeline-approval">
      <p className="timeline-approval-title">模型请求调用以下工具</p>
      <ul className="approval-tools">
        {pending.map((p) => (
          <li key={p.id}>
            <code>{p.name}</code>
            <span className="approval-args">
              {JSON.stringify(p.args)}
            </span>
          </li>
        ))}
      </ul>
      <div className="approval-actions">
        <button
          type="button"
          className="btn btn-approve"
          disabled={busy}
          onClick={() => onApprove(sessionId, true)}
        >
          允许执行
        </button>
        <button
          type="button"
          className="btn btn-reject"
          disabled={busy}
          onClick={() => onApprove(sessionId, false)}
        >
          拒绝
        </button>
      </div>
    </div>
  )
}

export function AgentTimeline({ item, busy, onApprove }: Props) {
  if (!item.steps.length) return null

  const pendingStep = item.steps.find(
    (s) => s.kind === "approval" && s.status === "pending"
  )

  return (
    <div className="agent-timeline" aria-label="Agent 执行步骤">
      <div className="timeline-header">
        <span className="timeline-header-label">执行链路</span>
        <span className="timeline-header-count">{item.steps.length} 步</span>
      </div>

      <div className="timeline-track">
        {item.steps.map((s, i) => (
          <div
            key={s.id}
            className={`timeline-pill status-${s.status}`}
            title={s.detail || s.title}
          >
            <span className="timeline-pill-idx">{i + 1}</span>
            <span className="timeline-pill-kind">
              {STEP_ICON[s.kind] ?? s.kind}
            </span>
            <span className="timeline-pill-status">
              {STATUS_LABEL[s.status] ?? s.status}
            </span>
          </div>
        ))}
      </div>

      {pendingStep?.meta?.pending && (
        <ApprovalBlock
          step={pendingStep}
          sessionId={item.approvalSessionId}
          busy={busy}
          onApprove={onApprove}
        />
      )}

      {item.steps
        .filter((s) => !(s.kind === "approval" && s.status === "pending"))
        .filter((s) => s.detail && s.status !== "done")
        .slice(-1)
        .map((s) => (
          <p key={s.id} className="timeline-footnote">
            {s.title}：{s.detail}
          </p>
        ))}
    </div>
  )
}
