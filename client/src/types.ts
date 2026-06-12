/**
 * types.ts — 前后端共享的类型定义
 *
 * StreamEvent 与 server.js writeSse 发出的 JSON 字段一一对应
 * ChatMessage 与 agent 使用的 OpenAI messages 格式一致（发给 API 的历史）
 */

export type StepStatus =
  | "pending"
  | "active"
  | "done"
  | "rejected"
  | "error"

/** Timeline 步骤类型：推理 / 审批 / 工具 / 最终回复 */
export type StepKind = "model" | "approval" | "tool" | "reply"

export interface TimelineStep {
  id: string
  kind: StepKind
  title: string
  status: StepStatus
  detail?: string
  meta?: {
    pending?: PendingTool[]
    args?: Record<string, unknown>
    result?: string
  }
}

/** 等待用户审批的工具调用 */
export interface PendingTool {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolInfo {
  name: string
  description: string
}

/** GET /api/config 响应 */
export interface AppConfig {
  model: string
  hasApiKey: boolean
  tools: ToolInfo[]
  defaultSystemPrompt?: string
}

/** 与后端同步的多轮对话（不含 system，发请求时由服务端注入） */
export interface ChatMessage {
  role: string
  content?: string
  tool_calls?: unknown[]
}

export interface UserItem {
  type: "user"
  id: string
  content: string
}

/** UI 展示的助手消息（含流式文本 + 执行链路 steps） */
export interface AssistantItem {
  type: "assistant"
  id: string
  rawText: string
  steps: TimelineStep[]
  approvalSessionId: string | null
  isError?: boolean
}

export type MessageItem = UserItem | AssistantItem

/** SSE 事件联合类型 — 见 README「SSE 事件表」 */
export type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "timeline"; step: TimelineStep }
  | { type: "tool_result"; name: string; args: Record<string, unknown>; result: string; error: string | null }
  | { type: "approval_required"; sessionId: string; pending: PendingTool[]; reply?: string }
  | { type: "paused"; sessionId: string; messages: ChatMessage[] }
  | { type: "done"; reply: string; messages: ChatMessage[]; trace: unknown[]; durationMs: number }
  | { type: "error"; error: string }
