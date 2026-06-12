/**
 * sse.ts — 前端消费 Server-Sent Events（SSE）
 *
 * 服务端格式：每行 `data: {"type":"delta",...}\n\n`
 * 本模块用 fetch + ReadableStream 读取（POST 流式，不是 EventSource GET）
 */

import type { StreamEvent } from "../types"

/**
 * 从 Response 体逐块读取，按 \n\n 切分事件，解析 data: JSON
 * @returns 最后一个事件的 type（如 done / paused / error）
 */
export async function consumeSseStream(
  res: Response,
  onEvent: (ev: StreamEvent) => void
): Promise<string | null> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error("无法读取响应流")

  const decoder = new TextDecoder()
  let buffer = ""
  let lastType: string | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split("\n\n")
    buffer = parts.pop() || ""

    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "))
      if (!line) continue
      try {
        const ev = JSON.parse(line.slice(6)) as StreamEvent
        onEvent(ev)
        lastType = ev.type
      } catch {
        /* 忽略畸形片段 */
      }
    }
  }

  return lastType
}

/**
 * POST 请求并处理 SSE 流
 * @param signal AbortSignal — 用户点「停止」时 abort
 */
export async function postSse(
  url: string,
  body: unknown,
  signal: AbortSignal,
  onEvent: (ev: StreamEvent) => void
): Promise<string | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error || `请求失败 (${res.status})`)
  }

  return consumeSseStream(res, onEvent)
}
