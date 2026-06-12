/**
 * useChat.ts — 聊天状态与 SSE 编排（React Hook）
 *
 * 维护两套数据：
 * - messages：UI 列表（user 气泡 + assistant 卡片含 timeline）
 * - chatHistory：发给后端的 OpenAI 格式历史（done/paused 时从服务端同步）
 *
 * 流程：sendMessage → POST /api/chat/stream → handleStreamEvent 更新 UI
 *       若 paused → 用户 approveTools → POST /api/chat/approve
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { postSse } from "../api/sse"
import type {
  AppConfig,
  AssistantItem,
  ChatMessage,
  MessageItem,
  StreamEvent,
  TimelineStep
} from "../types"

const FALLBACK_PROMPT =
  "你是一个 AI 助手。用户问股票时必须调用 getStockQuote，问天气调用 getWeather。禁止谎称没有工具。"

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function useChat() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [systemPrompt, setSystemPrompt] = useState(FALLBACK_PROMPT)
  const [autoApprove, setAutoApprove] = useState(false)
  const [busy, setBusy] = useState(false)
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  /** 启动时拉配置与默认系统提示词 */
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data: AppConfig) => {
        setConfig(data)
        if (data.defaultSystemPrompt) {
          setSystemPrompt(data.defaultSystemPrompt)
        }
      })
      .catch(() =>
        setConfig({
          model: "—",
          hasApiKey: false,
          tools: []
        })
      )
  }, [])

  const updateAssistant = useCallback(
    (id: string, updater: (prev: AssistantItem) => AssistantItem) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.type === "assistant" && m.id === id ? updater(m as AssistantItem) : m
        )
      )
    },
    []
  )

  /** 同 id 的 timeline 步骤合并更新（流式多次推送同一 step） */
  const upsertStep = (steps: TimelineStep[], step: TimelineStep) => {
    const idx = steps.findIndex((s) => s.id === step.id)
    if (idx >= 0) {
      const next = [...steps]
      next[idx] = { ...next[idx], ...step }
      return next
    }
    return [...steps, step]
  }

  /**
   * 处理单条 SSE 事件，更新对应 assistant 消息
   * @returns 事件 type，供 sendMessage 判断是否 paused
   */
  const handleStreamEvent = useCallback(
    (assistantId: string, ev: StreamEvent): string => {
      if (ev.type === "delta") {
        updateAssistant(assistantId, (a) => ({
          ...a,
          rawText: a.rawText + ev.content
        }))
      } else if (ev.type === "timeline") {
        updateAssistant(assistantId, (a) => ({
          ...a,
          steps: upsertStep(a.steps, ev.step)
        }))
      } else if (ev.type === "approval_required") {
        updateAssistant(assistantId, (a) => {
          let targetId = "approval-pending"
          const pending = a.steps.find(
            (s) => s.kind === "approval" && s.status === "pending"
          )
          if (pending) targetId = pending.id
          return {
            ...a,
            approvalSessionId: ev.sessionId,
            rawText: a.rawText || ev.reply || "",
            steps: upsertStep(a.steps, {
              id: targetId,
              kind: "approval",
              title: "等待授权",
              status: "pending",
              meta: { pending: ev.pending }
            })
          }
        })
      } else if (ev.type === "error") {
        updateAssistant(assistantId, (a) => ({
          ...a,
          rawText: ev.error,
          isError: true
        }))
      } else if (ev.type === "done") {
        setChatHistory(ev.messages)
        setDurationMs(ev.durationMs)
        updateAssistant(assistantId, (a) => ({
          ...a,
          rawText: ev.reply || a.rawText
        }))
      } else if (ev.type === "paused") {
        setChatHistory(ev.messages)
      }

      return ev.type
    },
    [updateAssistant]
  )

  const runStream = useCallback(
    async (
      url: string,
      body: Record<string, unknown>,
      assistantId: string
    ): Promise<string | null> => {
      const ac = abortRef.current
      if (!ac) throw new Error("无活动请求")
      return postSse(url, body, ac.signal, (ev) =>
        handleStreamEvent(assistantId, ev)
      )
    },
    [handleStreamEvent]
  )

  /** 用户点击「允许执行 / 拒绝」后继续 */
  const approveTools = useCallback(
    async (assistantId: string, sessionId: string, approved: boolean) => {
      if (busy) return

      abortRef.current = new AbortController()
      setBusy(true)

      updateAssistant(assistantId, (a) => {
        const pending = a.steps.find(
          (s) => s.kind === "approval" && s.status === "pending"
        )
        const approvalId = pending?.id ?? "approval-pending"
        return {
          ...a,
          steps: upsertStep(a.steps, {
            id: approvalId,
            kind: "approval",
            title: "工具授权",
            status: "active",
            detail: approved ? "正在执行工具…" : "已拒绝，模型将改答…"
          })
        }
      })

      let lastType: string | null = null
      try {
        lastType = await runStream(
          "/api/chat/approve",
          { sessionId, approved },
          assistantId
        )
        if (lastType === "paused") return
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setMessages((prev) => [
            ...prev,
            {
              type: "assistant",
              id: uid(),
              rawText: err.message,
              steps: [],
              approvalSessionId: null,
              isError: true
            }
          ])
        }
      } finally {
        abortRef.current = null
        setBusy(false)
      }
    },
    [busy, runStream, updateAssistant]
  )

  /** 发送用户消息，开启新一轮 SSE */
  const sendMessage = useCallback(
    async (text: string) => {
      const message = text.trim()
      if (!message || busy) return

      abortRef.current = new AbortController()
      setBusy(true)
      setDurationMs(null)

      const userId = uid()
      const assistantId = uid()
      setMessages((prev) => [
        ...prev,
        { type: "user", id: userId, content: message },
        {
          type: "assistant",
          id: assistantId,
          rawText: "",
          steps: [],
          approvalSessionId: null
        }
      ])

      let lastType: string | null = null
      try {
        lastType = await runStream(
          "/api/chat/stream",
          {
            message,
            messages: chatHistory,
            systemPrompt: systemPrompt.trim() || FALLBACK_PROMPT,
            autoApproveTools: autoApprove
          },
          assistantId
        )

        if (lastType === "paused") {
          abortRef.current = null
          setBusy(false)
          return
        }

        updateAssistant(assistantId, (a) => {
          if (!a.rawText && a.steps.length === 0) {
            return { ...a, rawText: "（无回复内容）" }
          }
          return a
        })
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          updateAssistant(assistantId, (a) => ({
            ...a,
            rawText: a.rawText + "\n\n*已停止生成*"
          }))
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== assistantId))
          setMessages((prev) => [
            ...prev,
            {
              type: "assistant",
              id: uid(),
              rawText: err instanceof Error ? err.message : "网络错误",
              steps: [],
              approvalSessionId: null,
              isError: true
            }
          ])
        }
      } finally {
        abortRef.current = null
        if (lastType !== "paused") setBusy(false)
      }
    },
    [autoApprove, busy, chatHistory, runStream, systemPrompt, updateAssistant]
  )

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort()
    setBusy(false)
  }, [])

  const clearChat = useCallback(() => {
    setMessages([])
    setChatHistory([])
    setDurationMs(null)
  }, [])

  return {
    config,
    messages,
    systemPrompt,
    setSystemPrompt,
    autoApprove,
    setAutoApprove,
    busy,
    durationMs,
    sendMessage,
    approveTools,
    stopGeneration,
    clearChat
  }
}
