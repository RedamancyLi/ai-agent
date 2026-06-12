/**
 * tools.js — 工具注册中心
 *
 * 职责：创建带默认工具的 Agent 实例（供 server.js 与 CLI 使用）
 *
 * 每个工具 = 两部分：
 * 1. spec（name / description / parameters）→ 发给模型，决定「调什么、参数长什么样」
 * 2. handler（async 函数）→ 在 Node 里真实执行，结果以 role:tool 消息回传给模型
 *
 * 学习要点：description 和 parameters 写得好不好，直接影响模型会不会正确调用工具
 */

const { Agent } = require("./agent")
const { getWeather } = require("./weather")
const { getStockQuote } = require("./stocks")

/**
 * 创建已注册 4 个工具的 Agent
 * @param {object} [options] 传给 Agent 构造函数，如 systemPrompt、model
 * @returns {Agent}
 */
function createDefaultAgent(options = {}) {
  const agent = new Agent(options)

  // —— 工具 1：天气（真实 API，见 weather.js）——
  agent.registerTool(
    {
      name: "getWeather",
      description: "查询某个城市的实时天气（真实数据，支持中英文城市名）",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市名，如 上海、北京" }
        },
        required: ["city"]
      }
    },
    async ({ city }) => getWeather(city)
  )

  // —— 工具 2：股票（东方财富等，见 stocks.js）——
  agent.registerTool(
    {
      name: "getStockQuote",
      description:
        "【股票必选】查询实时行情/走势/股价。A股：6位代码或中文名（如蓝色光标、300058、贵州茅台）；美股：AAPL；港股：0700.HK。用户问股票时必须调用。",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "股票代码或名称，如 600519、贵州茅台、AAPL、TSLA"
          },
          market: {
            type: "string",
            enum: ["auto", "ashare", "us", "hk"],
            description:
              "市场：auto 自动识别，ashare A 股，us 美股，hk 港股"
          }
        },
        required: ["symbol"]
      }
    },
    async ({ symbol, market }) => getStockQuote(symbol, market)
  )

  // —— 工具 3：时间（纯本地，无外部 API）——
  agent.registerTool(
    {
      name: "getCurrentTime",
      description: "获取指定时区的当前时间",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "IANA 时区，如 Asia/Shanghai，默认本地"
          }
        }
      }
    },
    async ({ timezone }) => {
      const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
      const now = new Date().toLocaleString("zh-CN", {
        timeZone: tz,
        dateStyle: "full",
        timeStyle: "medium"
      })
      return `${tz} 当前时间：${now}`
    }
  )

  // —— 工具 4：计算器（注意安全：仅允许数字与 +-*/()）——
  agent.registerTool(
    {
      name: "calculator",
      description: "计算简单数学表达式，仅支持 + - * / 和括号",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "例如 (1+2)*3" }
        },
        required: ["expression"]
      }
    },
    async ({ expression }) => {
      const safe = /^[\d\s+\-*/().]+$/.test(expression)
      if (!safe) throw new Error("表达式仅允许数字与 +-*/()")
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${expression})`)()
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("计算结果无效")
      }
      return String(value)
    }
  )

  return agent
}

module.exports = { createDefaultAgent }
