const messagesEl = document.getElementById("messages")
const inputEl = document.getElementById("input")
const formEl = document.getElementById("chatForm")
const sendBtn = document.getElementById("sendBtn")
const stopBtn = document.getElementById("stopBtn")
const clearBtn = document.getElementById("clearBtn")
const systemPromptEl = document.getElementById("systemPrompt")
const autoApproveEl = document.getElementById("autoApprove")
const statusEl = document.getElementById("status")
const metaEl = document.getElementById("meta")
const toolListEl = document.getElementById("toolList")
const toolCountEl = document.getElementById("toolCount")
const durationEl = document.getElementById("duration")

let chatHistory = []
let defaultSystemPrompt = ""
let busy = false
let abortController = null
let renderScheduled = false

if (typeof marked !== "undefined") {
  marked.setOptions({ breaks: true, gfm: true })
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function renderMarkdown(text) {
  if (!text) return ""
  if (typeof marked === "undefined") return escapeHtml(text)
  const raw = marked.parse(text)
  if (typeof DOMPurify !== "undefined") return DOMPurify.sanitize(raw)
  return raw
}

function highlightCode(root) {
  if (typeof hljs === "undefined" || !root) return
  root.querySelectorAll("pre code").forEach((block) => {
    hljs.highlightElement(block)
  })
}

function getAutoApprove() {
  return autoApproveEl?.checked ?? false
}

async function loadConfig() {
  try {
    const res = await fetch("/api/config")
    const data = await res.json()

    defaultSystemPrompt =
      "你是一个助手，必要时可以调用工具。回答简洁友好，使用中文，可使用 Markdown 格式。"
    systemPromptEl.value = defaultSystemPrompt

    if (data.hasApiKey) {
      statusEl.textContent = "已连接 · 流式 · 工具确认"
      statusEl.className = "status ok"
    } else {
      statusEl.textContent = "未配置 API Key"
      statusEl.className = "status warn"
    }

    metaEl.innerHTML = `<dt>模型</dt><dd>${escapeHtml(data.model)}</dd>`
    toolCountEl.textContent = String(data.tools.length)
    toolListEl.innerHTML = data.tools
      .map(
        (t) => `
      <li>
        <strong>${escapeHtml(t.name)}</strong>
        <p>${escapeHtml(t.description)}</p>
      </li>`
      )
      .join("")

    sendBtn.disabled = !data.hasApiKey
  } catch {
    statusEl.textContent = "无法连接服务，请先运行 npm run ui"
    statusEl.className = "status warn"
  }
}

function removeWelcome() {
  messagesEl.querySelector(".welcome")?.remove()
}

function appendUser(text) {
  removeWelcome()
  const el = document.createElement("div")
  el.className = "msg user"
  el.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`
  messagesEl.appendChild(el)
  scrollBottom()
}

function createAssistantMessage() {
  removeWelcome()
  const el = document.createElement("div")
  el.className = "msg assistant"
  el.innerHTML = `
    <div class="agent-timeline" aria-label="Agent 执行步骤"></div>
    <div class="bubble markdown-body"></div>
  `
  messagesEl.appendChild(el)
  scrollBottom()
  return {
    root: el,
    bubble: el.querySelector(".bubble"),
    timelineEl: el.querySelector(".agent-timeline"),
    rawText: "",
    trace: [],
    steps: new Map(),
    approvalSessionId: null
  }
}

const STEP_ICON = {
  model: "◆",
  approval: "◇",
  tool: "⚙",
  reply: "✦"
}

function upsertTimelineStep(state, step) {
  state.steps.set(step.id, { ...state.steps.get(step.id), ...step })
  renderTimeline(state)
}

function renderTimeline(state) {
  const steps = Array.from(state.steps.values())
  if (!steps.length) {
    state.timelineEl.innerHTML = ""
    return
  }

  state.timelineEl.innerHTML = `
    <div class="timeline-title">Agent 执行链路</div>
    <ol class="timeline-list">
      ${steps
        .map((s) => {
          const icon = STEP_ICON[s.kind] || "•"
          const detail =
            s.kind === "approval" && s.status === "pending" && s.meta?.pending
              ? buildApprovalBlock(state, s)
              : s.detail
                ? `<div class="timeline-detail">${escapeHtml(s.detail)}</div>`
                : ""
          return `
        <li class="timeline-item status-${s.status}" data-step-id="${escapeHtml(s.id)}">
          <span class="timeline-dot" aria-hidden="true"></span>
          <div class="timeline-content">
            <div class="timeline-head">
              <span class="timeline-icon">${icon}</span>
              <span class="timeline-label">${escapeHtml(s.title)}</span>
              <span class="timeline-badge">${statusLabel(s.status)}</span>
            </div>
            ${detail}
          </div>
        </li>`
        })
        .join("")}
    </ol>`

  const hasPending = steps.some(
    (s) => s.kind === "approval" && s.status === "pending"
  )
  if (hasPending && state.approvalSessionId) bindApprovalButtons(state)
  scrollBottom()
}

function statusLabel(status) {
  const map = {
    pending: "待确认",
    active: "进行中",
    done: "完成",
    rejected: "已拒绝",
    error: "失败"
  }
  return map[status] || status
}

function buildApprovalBlock(state, step) {
  const pending = step.meta?.pending || []
  const sid = state.approvalSessionId
  const list = pending
    .map(
      (p) =>
        `<li><code>${escapeHtml(p.name)}</code> ${escapeHtml(JSON.stringify(p.args))}</li>`
    )
    .join("")

  return `
    <div class="timeline-detail">模型请求调用以下工具：</div>
    <ul class="approval-tools">${list}</ul>
    <div class="approval-actions">
      <button type="button" class="btn btn-approve" data-session="${escapeHtml(sid)}" data-approved="true">允许执行</button>
      <button type="button" class="btn btn-reject" data-session="${escapeHtml(sid)}" data-approved="false">拒绝</button>
    </div>`
}

function bindApprovalButtons(state) {
  state.timelineEl.querySelectorAll(".approval-actions button").forEach((btn) => {
    btn.onclick = () => {
      const sessionId = btn.dataset.session
      const approved = btn.dataset.approved === "true"
      if (sessionId) resolveApproval(state, sessionId, approved)
    }
  })
}

function scheduleMarkdownRender(state) {
  if (renderScheduled) return
  renderScheduled = true
  requestAnimationFrame(() => {
    renderScheduled = false
    state.bubble.innerHTML = renderMarkdown(state.rawText)
    highlightCode(state.bubble)
    scrollBottom()
  })
}

function appendError(text) {
  const el = document.createElement("div")
  el.className = "msg assistant error"
  el.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`
  messagesEl.appendChild(el)
  scrollBottom()
}

function scrollBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight
}

function setBusy(value) {
  busy = value
  stopBtn.classList.toggle("hidden", !value)
  const hasKey = statusEl.className === "status ok"
  sendBtn.disabled = value || !hasKey
  if (autoApproveEl) autoApproveEl.disabled = value
}

function handleStreamEvent(assistant, ev) {
  if (ev.type === "delta" && ev.content) {
    assistant.rawText += ev.content
    scheduleMarkdownRender(assistant)
  } else if (ev.type === "timeline" && ev.step) {
    upsertTimelineStep(assistant, ev.step)
    if (ev.step.kind === "approval" && ev.step.status === "pending") {
      bindApprovalButtons(assistant)
    }
  } else if (ev.type === "tool_result") {
    assistant.trace.push({
      name: ev.name,
      args: ev.args,
      result: ev.result,
      error: ev.error
    })
  } else if (ev.type === "approval_required") {
    assistant.approvalSessionId = ev.sessionId
    if (ev.reply && !assistant.rawText) {
      assistant.rawText = ev.reply
      scheduleMarkdownRender(assistant)
    }
    let targetId = "approval-pending"
    for (const [id, s] of assistant.steps) {
      if (s.kind === "approval" && s.status === "pending") {
        targetId = id
        break
      }
    }
    upsertTimelineStep(assistant, {
      id: targetId,
      kind: "approval",
      title: "等待授权",
      status: "pending",
      detail: "",
      meta: { pending: ev.pending }
    })
  } else if (ev.type === "error") {
    assistant.bubble.innerHTML = escapeHtml(ev.error)
    assistant.root.classList.add("error")
  } else if (ev.type === "done") {
    chatHistory = ev.messages
    assistant.rawText = ev.reply || assistant.rawText
    assistant.trace = ev.trace || assistant.trace
    assistant.bubble.innerHTML = renderMarkdown(assistant.rawText)
    highlightCode(assistant.bubble)
    if (ev.durationMs != null) {
      durationEl.textContent = `耗时 ${(ev.durationMs / 1000).toFixed(1)}s`
      durationEl.classList.remove("hidden")
    }
  } else if (ev.type === "paused") {
    chatHistory = ev.messages || chatHistory
  }

  return ev.type
}

async function consumeSseStream(res, assistant) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let lastType = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split("\n\n")
    buffer = parts.pop() || ""

    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "))
      if (!line) continue
      let ev
      try {
        ev = JSON.parse(line.slice(6))
      } catch {
        continue
      }
      lastType = handleStreamEvent(assistant, ev)
    }
  }

  return lastType
}

async function runSseRequest(url, body, assistant) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: abortController.signal
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `请求失败 (${res.status})`)
  }

  return consumeSseStream(res, assistant)
}

async function resolveApproval(state, sessionId, approved) {
  if (busy) return
  abortController = new AbortController()
  setBusy(true)

  let approvalId = "approval-pending"
  for (const [id, s] of state.steps) {
    if (s.kind === "approval" && s.status === "pending") {
      approvalId = id
      break
    }
  }
  upsertTimelineStep(state, {
    id: approvalId,
    kind: "approval",
    title: "工具授权",
    status: "active",
    detail: approved ? "正在执行工具…" : "已拒绝，模型将改答…"
  })

  state.timelineEl.querySelectorAll(".approval-actions button").forEach((b) => {
    b.disabled = true
  })

  try {
    const lastType = await runSseRequest(
      "/api/chat/approve",
      { sessionId, approved },
      state
    )

    if (lastType === "paused") {
      bindApprovalButtons(state)
    }

    if (!state.rawText && state.trace.length === 0 && lastType !== "done") {
      state.bubble.textContent = "（无回复内容）"
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      appendError(err.message || "授权请求失败")
    }
  } finally {
    abortController = null
    setBusy(false)
  }
}

async function sendMessage(text) {
  const message = text.trim()
  if (!message || busy) return

  abortController = new AbortController()
  setBusy(true)
  inputEl.value = ""
  autoResizeInput()
  durationEl.classList.add("hidden")

  appendUser(message)
  const assistant = createAssistantMessage()
  let lastType = null

  try {
    lastType = await runSseRequest(
      "/api/chat/stream",
      {
        message,
        messages: chatHistory,
        systemPrompt: systemPromptEl.value.trim() || defaultSystemPrompt,
        autoApproveTools: getAutoApprove()
      },
      assistant
    )

    if (lastType === "paused") {
      abortController = null
      setBusy(false)
      return
    }

    if (!assistant.rawText && assistant.trace.length === 0) {
      assistant.bubble.textContent = "（无回复内容）"
    }
  } catch (err) {
    if (err.name === "AbortError") {
      assistant.bubble.innerHTML +=
        '<p class="stopped-hint"><em>已停止生成</em></p>'
      highlightCode(assistant.bubble)
    } else {
      assistant.root.remove()
      appendError(err.message || "网络错误")
    }
  } finally {
    abortController = null
    if (lastType !== "paused") setBusy(false)
    inputEl.focus()
  }
}

function stopGeneration() {
  abortController?.abort()
  setBusy(false)
}

function autoResizeInput() {
  inputEl.style.height = "auto"
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 160)}px`
}

function clearChat() {
  chatHistory = []
  messagesEl.innerHTML = `
    <div class="welcome">
      <p>对话已清空，继续提问吧。</p>
      <p class="hint">默认需<strong>确认后</strong>才执行工具 · 可勾选侧栏自动执行</p>
    </div>`
  durationEl.classList.add("hidden")
}

formEl.addEventListener("submit", (e) => {
  e.preventDefault()
  sendMessage(inputEl.value)
})

stopBtn.addEventListener("click", stopGeneration)
inputEl.addEventListener("input", autoResizeInput)
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    formEl.requestSubmit()
  }
})

clearBtn.addEventListener("click", clearChat)
document.querySelectorAll(".chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.prompt) sendMessage(btn.dataset.prompt)
  })
})

loadConfig()
inputEl.focus()
