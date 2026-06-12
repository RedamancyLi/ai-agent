/**
 * agent.js — AI Agent 核心（本项目的「心脏」）
 *
 * 职责：
 * 1. 调用大模型 API（DeepSeek，兼容 OpenAI Chat Completions）
 * 2. 维护对话 messages 数组（system / user / assistant / tool）
 * 3. 实现「工具循环」：模型返回 tool_calls → 本地执行 → 结果写回 messages → 再问模型
 * 4. 支持流式输出（SSE 用）与「执行工具前需用户审批」
 *
 * 学习顺序建议：
 *   registerTool → _buildMessages → run → _executeToolCalls → runStream → _parseStreamResponse
 */

require("dotenv").config()
const { Configuration, OpenAIApi } = require("openai")
const { SYSTEM_PROMPT } = require("./prompts")

/** 默认配置（可被 .env 或构造函数 options 覆盖） */
const DEFAULTS = {
  apiKey: process.env.DEEPSEEK_API_KEY,
  basePath: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
  model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  systemPrompt: SYSTEM_PROMPT,
  /** 单轮对话里，模型最多连续「推理→调工具」几轮，防止死循环 */
  maxToolRounds: 10
}

/**
 * 创建 OpenAI 兼容客户端（实际请求发到 DeepSeek）
 * @param {{ apiKey?: string, basePath?: string }} [opts]
 * @returns {OpenAIApi}
 */
function createClient({ apiKey, basePath } = {}) {
  const key = apiKey ?? DEFAULTS.apiKey
  if (!key) {
    throw new Error("缺少 API Key：请在 .env 中设置 DEEPSEEK_API_KEY")
  }
  const configuration = new Configuration({
    apiKey: key,
    basePath: basePath ?? DEFAULTS.basePath
  })
  return new OpenAIApi(configuration)
}

/**
 * Agent 类：把「模型 + 工具 + 消息历史」编排在一起
 */
class Agent {
  /**
   * @param {object} [options]
   * @param {OpenAIApi} [options.client] 可注入 mock 客户端，便于测试
   * @param {string} [options.model]
   * @param {string} [options.systemPrompt]
   * @param {number} [options.maxToolRounds]
   */
  constructor(options = {}) {
    this.client = options.client ?? createClient(options)
    this.model = options.model ?? DEFAULTS.model
    this.systemPrompt = options.systemPrompt ?? DEFAULTS.systemPrompt
    this.maxToolRounds = options.maxToolRounds ?? DEFAULTS.maxToolRounds

    /** 发给 API 的 tools 定义（OpenAI 格式），模型靠它决定调什么、参数 schema 是什么 */
    this.tools = []

    /** 工具名 → 真正执行的 async 函数（只有服务端代码能跑，模型看不到实现） */
    this.handlers = new Map()
  }

  /**
   * 列出已注册工具（给 /api/config 和前端侧边栏展示，不含 handler）
   * @returns {{ name: string, description: string, parameters: object }[]}
   */
  listTools() {
    return this.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters
    }))
  }

  /**
   * 注册一个可被模型调用的工具
   *
   * @param {{ name: string, description: string, parameters: object }} spec
   *   - name: 工具唯一名，模型 tool_calls 里会出现
   *   - description: 写给模型看的说明，直接影响「会不会调、何时调」
   *   - parameters: JSON Schema，描述参数结构（如 city: string）
   * @param {Function} handler async (args, context) => string | object
   *   - args: 模型生成的参数对象
   *   - context: { toolCall, messages } 扩展用
   * @returns {Agent} 支持链式调用 agent.registerTool(...).registerTool(...)
   */
  registerTool(spec, handler) {
    const { name, description, parameters } = spec
    if (!name || typeof handler !== "function") {
      throw new Error("registerTool 需要 name 与 handler")
    }
    this.handlers.set(name, handler)

    const idx = this.tools.findIndex((t) => t.function.name === name)
    const entry = {
      type: "function",
      function: { name, description, parameters }
    }
    if (idx >= 0) this.tools[idx] = entry
    else this.tools.push(entry)
    return this
  }

  /**
   * 移除工具（同时从 API 定义和本地 handler 删除）
   * @param {string} name
   */
  unregisterTool(name) {
    this.handlers.delete(name)
    this.tools = this.tools.filter((t) => t.function.name !== name)
    return this
  }

  /**
   * 从 assistant 消息里解析出「待执行的工具列表」（给 UI 审批展示用）
   * @param {object} msg 含 tool_calls 的 assistant 消息
   * @returns {{ id: string, name: string, args: object }[]}
   */
  _pendingToolsFromMessage(msg) {
    return (msg.tool_calls || []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments || "{}")
    }))
  }

  /**
   * 用户拒绝执行工具时：为每个 tool_call 写入一条 role:tool 的「拒绝」结果
   * 这样下一轮模型会知道「用户不让调」，从而改口回答或换方案
   *
   * @param {object} msg 带 tool_calls 的 assistant 消息
   * @param {object[]} messages 会被原地 push
   * @param {Function} [onEvent] 流式事件回调（timeline / tool_rejected）
   */
  async _rejectToolCalls(msg, messages, onEvent) {
    for (const toolCall of msg.tool_calls) {
      const name = toolCall.function.name
      const args = JSON.parse(toolCall.function.arguments || "{}")
      onEvent?.({ type: "tool_rejected", name, args })
      onEvent?.({
        type: "timeline",
        step: {
          id: `tool-${toolCall.id}`,
          kind: "tool",
          title: name,
          status: "rejected",
          detail: "用户拒绝执行",
          meta: { args }
        }
      })
      // OpenAI 协议要求：每个 tool_call 都必须有对应 tool 消息，且 tool_call_id 对齐
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: "用户拒绝执行此工具调用"
      })
    }
  }

  /**
   * 执行 assistant 消息里的全部 tool_calls（Agent 循环的核心一步）
   *
   * 流程：找 handler → 执行 → 结果写入 messages（role: tool）→ 发事件给前端
   *
   * @param {object} msg assistant 消息，含 tool_calls[]
   * @param {object[]} messages 对话历史，执行后会 push tool 消息
   * @param {object[]} trace 工具调用记录（给 CLI trace: true 或调试）
   * @param {Function} [onEvent] 流式事件：tool_start / tool_result / timeline
   */
  async _executeToolCalls(msg, messages, trace, onEvent) {
    for (const toolCall of msg.tool_calls) {
      const name = toolCall.function.name
      const handler = this.handlers.get(name)
      if (!handler) {
        throw new Error(`模型调用了未注册的工具: ${name}`)
      }
      const args = JSON.parse(toolCall.function.arguments || "{}")
      onEvent?.({ type: "tool_start", name, args })
      onEvent?.({
        type: "timeline",
        step: {
          id: `tool-${toolCall.id}`,
          kind: "tool",
          title: name,
          status: "active",
          detail: "执行中…",
          meta: { args }
        }
      })

      let result
      let error
      try {
        result = await handler(args, { toolCall, messages })
      } catch (err) {
        error = err.message || String(err)
        result = `错误: ${error}`
      }
      const content =
        typeof result === "string" ? result : JSON.stringify(result)

      trace.push({
        round: trace.length + 1,
        name,
        args,
        result: content,
        error: error || null
      })
      onEvent?.({
        type: "tool_result",
        name,
        args,
        result: content,
        error: error || null
      })
      onEvent?.({
        type: "timeline",
        step: {
          id: `tool-${toolCall.id}`,
          kind: "tool",
          title: name,
          status: error ? "error" : "done",
          detail: error ? content : content.slice(0, 120),
          meta: { args, result: content }
        }
      })

      // 工具结果必须以 role: tool 追加，模型下一轮才能「看到」真实数据
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content
      })
    }
  }

  /**
   * 解析 SSE 流式响应（OpenAI stream 格式：每行 data: {...}）
   *
   * 难点：流式下 tool_calls 是分片到达的，需要按 index 拼成完整对象
   *
   * @param {object} stream axios 流，stream.data 是 Node Readable
   * @param {Function} [onEvent] 收到文字片段时发 { type: 'delta', content }
   * @returns {Promise<{ message: object, content: string }>}
   *   message: 完整的 assistant 消息（含 content 和可选的 tool_calls）
   */
  _parseStreamResponse(stream, onEvent) {
    return new Promise((resolve, reject) => {
      let buffer = ""
      let content = ""
      /** 按 tool_calls[].index 累积，因为 name/arguments 可能分多包到达 */
      const toolCallsByIndex = {}

      stream.data.on("data", (chunk) => {
        buffer += chunk.toString()
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith("data: ")) continue
          const payload = trimmed.slice(6)
          if (payload === "[DONE]") continue

          let json
          try {
            json = JSON.parse(payload)
          } catch {
            continue
          }

          const delta = json.choices?.[0]?.delta
          if (!delta) continue

          if (delta.content) {
            content += delta.content
            onEvent?.({ type: "delta", content: delta.content })
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const i = tc.index ?? 0
              if (!toolCallsByIndex[i]) {
                toolCallsByIndex[i] = {
                  id: "",
                  type: "function",
                  function: { name: "", arguments: "" }
                }
              }
              const acc = toolCallsByIndex[i]
              if (tc.id) acc.id = tc.id
              if (tc.function?.name) acc.function.name += tc.function.name
              if (tc.function?.arguments) {
                acc.function.arguments += tc.function.arguments
              }
            }
          }
        }
      })

      stream.data.on("end", () => {
        const tool_calls = Object.keys(toolCallsByIndex).length
          ? Object.values(toolCallsByIndex)
          : undefined
        const message = {
          role: "assistant",
          content: content || null,
          ...(tool_calls?.length ? { tool_calls } : {})
        }
        resolve({ message, content })
      })

      stream.data.on("error", reject)
    })
  }

  /**
   * 发起一次「流式」Chat Completion，并解析为完整 assistant 消息
   *
   * @param {object[]} messages 当前完整上下文
   * @param {boolean} requestTools 是否带上 tools / tool_choice: auto
   * @param {Function} [onEvent] 仅转发 delta 给上层（runStream 里再转发给 SSE）
   */
  async _streamCompletion(messages, requestTools, onEvent) {
    const stream = await this.client.createChatCompletion(
      {
        model: this.model,
        messages,
        stream: true,
        ...(requestTools ? { tools: this.tools, tool_choice: "auto" } : {})
      },
      { responseType: "stream" }
    )
    return this._parseStreamResponse(stream, onEvent)
  }

  /**
   * 组装发给模型的 messages 数组
   *
   * 两种入口：
   * - CLI / 简单场景：userInput 字符串 → [system, user]
   * - Web 多轮：options.messages 已有历史 → 前面补 system（若还没有）
   *
   * @param {string} [userInput]
   * @param {{ messages?: object[], systemPrompt?: string }} options
   * @returns {object[]}
   */
  _buildMessages(userInput, options) {
    if (options.messages?.length) {
      const hasSystem = options.messages.some((m) => m.role === "system")
      if (hasSystem) return [...options.messages]
      return [
        {
          role: "system",
          content: options.systemPrompt ?? this.systemPrompt
        },
        ...options.messages
      ]
    }
    return [
      {
        role: "system",
        content: options.systemPrompt ?? this.systemPrompt
      },
      { role: "user", content: userInput }
    ]
  }

  /**
   * 非流式运行 Agent（适合 CLI：node agent.js "问题"）
   *
   * 标准工具循环：
   *   loop:
   *     调模型 → push assistant
   *     若无 tool_calls → 返回最终文本
   *     若有 → _executeToolCalls → 继续 loop
   *
   * @param {string} [userInput] 单轮问题时使用；多轮时传 null，用 options.messages
   * @param {{ messages?: object[], systemPrompt?: string, trace?: boolean }} [options]
   * @returns {Promise<string|{ content: string, messages: object[], trace: object[] }>}
   */
  async run(userInput, options = {}) {
    const messages = this._buildMessages(userInput, options)
    const trace = []
    const requestTools = this.tools.length > 0

    for (let round = 0; round < this.maxToolRounds; round++) {
      const res = await this.client.createChatCompletion({
        model: this.model,
        messages,
        ...(requestTools ? { tools: this.tools, tool_choice: "auto" } : {})
      })

      const msg = res.data.choices[0].message
      messages.push(msg)

      if (!msg.tool_calls?.length) {
        if (options.trace) {
          return { content: msg.content, messages, trace }
        }
        return msg.content
      }

      await this._executeToolCalls(msg, messages, trace, null)
    }

    throw new Error(`工具调用超过上限（${this.maxToolRounds} 轮）`)
  }

  /**
   * 流式运行 Agent（Web UI / SSE 使用）
   *
   * 与 run() 相同循环，但：
   * - 用 _streamCompletion 逐字输出
   * - 通过 onEvent 推送 delta、timeline 等给 server.js → 前端
   * - requireToolApproval: true 时，遇到 tool_calls 会 paused，等 /api/chat/approve
   * - options.resume: 用户点「允许/拒绝」后，从暂停处继续
   *
   * @param {string} [userInput]
   * @param {object} options
   * @param {object[]} [options.messages] 多轮历史
   * @param {string} [options.systemPrompt]
   * @param {boolean} [options.requireToolApproval] 是否执行前需用户确认
   * @param {object} [options.resume] 审批恢复：{ messages, trace, assistantMsg, approved, round }
   * @param {Function} onEvent (ev) => void 流式事件回调
   * @returns {Promise<{
   *   content: string,
   *   messages: object[],
   *   trace: object[],
   *   paused: boolean,
   *   pendingApproval?: object
   * }>}
   */
  async runStream(userInput, options = {}, onEvent) {
    const requestTools = this.tools.length > 0
    let messages
    let trace
    let startRound = 0

    // —— 分支 A：从「用户审批」恢复，不再重新 buildMessages ——
    if (options.resume) {
      const { messages: msgs, trace: tr, assistantMsg, approved, round } =
        options.resume
      messages = msgs
      trace = tr
      startRound = round

      onEvent?.({
        type: "timeline",
        step: {
          id: `approval-${startRound - 1}`,
          kind: "approval",
          title: "工具授权",
          status: approved ? "done" : "rejected",
          detail: approved ? "已允许执行" : "已拒绝"
        }
      })

      if (approved) {
        await this._executeToolCalls(assistantMsg, messages, trace, onEvent)
      } else {
        await this._rejectToolCalls(assistantMsg, messages, onEvent)
      }
    } else {
      // —— 分支 B：全新对话 ——
      messages = this._buildMessages(userInput, options)
      trace = []
    }

    for (let round = startRound; round < this.maxToolRounds; round++) {
      onEvent?.({
        type: "timeline",
        step: {
          id: `model-${round}`,
          kind: "model",
          title: "模型推理",
          status: "active",
          detail: round === 0 ? "分析你的问题…" : "根据工具结果继续推理…"
        }
      })

      const { message: msg, content: streamed } = await this._streamCompletion(
        messages,
        requestTools,
        (ev) => {
          if (ev.type === "delta") onEvent?.(ev)
        }
      )
      messages.push(msg)

      onEvent?.({
        type: "timeline",
        step: {
          id: `model-${round}`,
          kind: "model",
          title: "模型推理",
          status: "done",
          detail: msg.tool_calls?.length
            ? "请求调用工具"
            : streamed
              ? "生成最终回复"
              : "完成"
        }
      })

      // 没有工具调用 → 模型已给出最终自然语言回复
      if (!msg.tool_calls?.length) {
        onEvent?.({
          type: "timeline",
          step: {
            id: `reply-${round}`,
            kind: "reply",
            title: "助手回复",
            status: "done",
            detail: "已完成"
          }
        })
        return {
          content: msg.content || streamed || "",
          messages,
          trace,
          paused: false
        }
      }

      const pending = this._pendingToolsFromMessage(msg)

      // 需要人工审批 → 暂停，server 存 session，前端显示允许/拒绝
      if (options.requireToolApproval) {
        onEvent?.({
          type: "timeline",
          step: {
            id: `approval-${round}`,
            kind: "approval",
            title: "等待授权",
            status: "pending",
            detail: `共 ${pending.length} 个工具待确认`,
            meta: { pending }
          }
        })
        return {
          content: msg.content || streamed || "",
          messages,
          trace,
          paused: true,
          pendingApproval: {
            assistantMsg: msg,
            messages,
            trace,
            round: round + 1,
            pending
          }
        }
      }

      // 自动执行工具，然后 for 循环进入下一轮模型推理
      await this._executeToolCalls(msg, messages, trace, onEvent)
    }

    throw new Error(`工具调用超过上限（${this.maxToolRounds} 轮）`)
  }
}

module.exports = { Agent, createClient, DEFAULTS }

// 直接运行此文件时：node agent.js "你的问题"
if (require.main === module) {
  const { createDefaultAgent } = require("./tools")
  const agent = createDefaultAgent()
  const input = process.argv.slice(2).join(" ") || "上海天气怎么样？"
  agent
    .run(input, { trace: true })
    .then((out) => {
      if (out.trace?.length) {
        console.log("--- 工具调用 ---")
        for (const t of out.trace) {
          console.log(`${t.name}(${JSON.stringify(t.args)}) => ${t.result}`)
        }
        console.log("--- 回复 ---")
      }
      console.log(out.content ?? out)
    })
    .catch((err) => {
      console.error(err.message || err)
      process.exit(1)
    })
}
