/**
 * server.js — HTTP 服务与 SSE 网关
 *
 * 职责：
 * 1. 托管前端静态资源（dist/ 或 public/）
 * 2. 暴露 REST / SSE API，把浏览器请求转给 Agent
 * 3. 工具审批暂停时，用 pendingSessions 暂存状态，等 /api/chat/approve 恢复
 *
 * 学习顺序：/api/config → prepareChatBody → /api/chat/stream → runStreamToSse → /api/chat/approve
 */

require("dotenv").config()
const crypto = require("crypto")
const fs = require("fs")
const express = require("express")
const path = require("path")
const { createDefaultAgent } = require("./tools")
const { DEFAULTS } = require("./agent")
const { SYSTEM_PROMPT } = require("./prompts")

const app = express()
const BASE_PORT = Number(process.env.PORT) || 3000
/** 用户点「允许/拒绝」之前，暂停态最多保留 15 分钟 */
const SESSION_TTL_MS = 15 * 60 * 1000

/** 全局单例 Agent（所有请求共享工具注册与 model 配置） */
const agent = createDefaultAgent({ systemPrompt: SYSTEM_PROMPT })

/**
 * 审批暂停会话：sessionId → { messages, assistantMsg, trace, round, ... }
 * 模型要调工具但用户未开「自动执行」时，agent.runStream 返回 paused，状态存这里
 */
/** @type {Map<string, object>} */
const pendingSessions = new Map()

setInterval(() => {
  const now = Date.now()
  for (const [id, s] of pendingSessions) {
    if (now - s.createdAt > SESSION_TTL_MS) pendingSessions.delete(id)
  }
}, 60_000)

app.use(express.json({ limit: "1mb" }))

const distDir = path.join(__dirname, "dist")
const publicDir = path.join(__dirname, "public")
/** 优先使用 React 构建产物，否则回退到旧版 public/ */
const staticDir =
  fs.existsSync(path.join(distDir, "index.html")) ? distDir : publicDir

app.use(express.static(staticDir))

/**
 * GET /api/config — 前端启动时拉取：模型名、是否有 Key、工具列表、默认提示词
 */
app.get("/api/config", (_req, res) => {
  res.json({
    model: agent.model,
    basePath: DEFAULTS.basePath,
    hasApiKey: Boolean(process.env.DEEPSEEK_API_KEY),
    tools: agent.listTools(),
    defaultSystemPrompt: SYSTEM_PROMPT
  })
})

/**
 * 解析聊天请求体，拼出 agent 需要的 messages 与选项
 * @returns {{ error?: string, chatMessages?, systemPrompt?, autoApproveTools? }}
 */
function prepareChatBody(req) {
  const { message, messages, systemPrompt, autoApproveTools } = req.body

  if (!message?.trim() && (!messages || messages.length === 0)) {
    return { error: "请输入消息" }
  }

  const history = Array.isArray(messages) ? messages : []
  const chatMessages = message?.trim()
    ? [...history, { role: "user", content: message.trim() }]
    : history

  if (systemPrompt !== undefined) {
    agent.systemPrompt = systemPrompt
  }

  return {
    chatMessages,
    systemPrompt: agent.systemPrompt,
    autoApproveTools: Boolean(autoApproveTools)
  }
}

/** 设置 SSE 响应头，开始流式推送 */
function startSse(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders?.()
}

/**
 * 调用 agent.runStream，把每个事件写成 SSE：data: {...}\n\n
 * 若 paused → 存 session 并发送 approval_required / paused
 * 若完成 → 发送 done（含完整 messages 供前端同步 chatHistory）
 */
async function runStreamToSse(res, runOptions, startedAt) {
  const result = await agent.runStream(null, runOptions, (ev) => writeSse(res, ev))

  if (result.paused) {
    const sessionId = crypto.randomUUID()
    pendingSessions.set(sessionId, {
      ...result.pendingApproval,
      systemPrompt: runOptions.systemPrompt,
      autoApproveTools: !runOptions.requireToolApproval,
      createdAt: Date.now()
    })

    writeSse(res, {
      type: "approval_required",
      sessionId,
      pending: result.pendingApproval.pending,
      reply: result.content
    })
    writeSse(res, {
      type: "paused",
      sessionId,
      messages: result.messages.filter((m) => m.role !== "system")
    })
    return
  }

  const clientMessages = result.messages.filter((m) => m.role !== "system")
  writeSse(res, {
    type: "done",
    reply: result.content,
    trace: result.trace,
    messages: clientMessages,
    durationMs: Date.now() - (startedAt || Date.now())
  })
}

function writeSse(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

/**
 * POST /api/chat/stream — 主聊天接口（流式）
 * body: { message, messages?, systemPrompt?, autoApproveTools? }
 */
app.post("/api/chat/stream", async (req, res) => {
  const prepared = prepareChatBody(req)
  if (prepared.error) {
    return res.status(400).json({ error: prepared.error })
  }

  startSse(res)
  const started = Date.now()

  try {
    await runStreamToSse(
      res,
      {
        messages: prepared.chatMessages,
        systemPrompt: prepared.systemPrompt,
        requireToolApproval: !prepared.autoApproveTools
      },
      started
    )
  } catch (err) {
    console.error(err)
    writeSse(res, {
      type: "error",
      error: err.message || "请求失败，请检查 API Key 与网络"
    })
  }

  res.end()
})

/**
 * POST /api/chat/approve — 用户允许或拒绝工具后，从暂停处继续
 * body: { sessionId, approved: boolean }
 */
app.post("/api/chat/approve", async (req, res) => {
  const { sessionId, approved } = req.body
  if (!sessionId) {
    return res.status(400).json({ error: "缺少 sessionId" })
  }

  const session = pendingSessions.get(sessionId)
  if (!session) {
    return res.status(404).json({ error: "授权会话已过期，请重新提问" })
  }
  pendingSessions.delete(sessionId)

  startSse(res)
  const started = Date.now()

  try {
    await runStreamToSse(
      res,
      {
        systemPrompt: session.systemPrompt,
        requireToolApproval: !session.autoApproveTools,
        resume: {
          messages: session.messages,
          trace: session.trace,
          assistantMsg: session.assistantMsg,
          approved: Boolean(approved),
          round: session.round
        }
      },
      started
    )
  } catch (err) {
    console.error(err)
    writeSse(res, {
      type: "error",
      error: err.message || "继续执行失败"
    })
  }

  res.end()
})

/**
 * POST /api/chat — 非流式一次性接口（备用，UI 主要用 stream）
 */
app.post("/api/chat", async (req, res) => {
  try {
    const prepared = prepareChatBody(req)
    if (prepared.error) {
      return res.status(400).json({ error: prepared.error })
    }

    const started = Date.now()
    const result = await agent.run(null, {
      messages: prepared.chatMessages,
      systemPrompt: prepared.systemPrompt,
      trace: true
    })

    const clientMessages = result.messages.filter((m) => m.role !== "system")

    res.json({
      reply: result.content,
      trace: result.trace,
      messages: clientMessages,
      durationMs: Date.now() - started
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      error: err.message || "请求失败，请检查 API Key 与网络"
    })
  }
})

/** SPA 路由：非 /api 请求返回 index.html（仅 React 构建模式） */
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next()
  if (staticDir !== distDir) return next()
  res.sendFile(path.join(distDir, "index.html"))
})

/** 端口被占用时自动尝试下一个端口 */
function startServer(port, attemptsLeft = 10) {
  const server = app.listen(port, () => {
    const uiKind = staticDir === distDir ? "React 构建" : "静态 public"
    console.log(`Agent UI (${uiKind}): http://localhost:${port}`)
    if (port !== BASE_PORT) {
      console.log(
        `提示: 端口 ${BASE_PORT} 已被占用（可能上次未关闭），已自动改用 ${port}`
      )
      console.log(`若要固定端口，可先结束占用进程，或设置 PORT=${port}`)
    }
  })

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 1) {
      startServer(port + 1, attemptsLeft - 1)
      return
    }
    if (err.code === "EADDRINUSE") {
      console.error(
        `端口 ${BASE_PORT}～${port} 均被占用。请关闭占用进程，或在 .env 中设置 PORT=其他端口`
      )
      console.error("Windows 查看占用: netstat -ano | findstr :3000")
    } else {
      console.error(err.message || err)
    }
    process.exit(1)
  })
}

startServer(BASE_PORT)
