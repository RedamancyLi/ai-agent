/**
 * stocks.js — 股票行情工具实现
 *
 * 数据源：东方财富公开接口（无需 Key）
 * 支持：A 股代码/中文名、美股 ticker、港股代码
 *
 * 入口：getStockQuote(symbol, market) — 被 tools.js 注册为 getStockQuote 工具
 * 学习时可先看 getStockQuote 末尾的分支逻辑，再回头看 parse* / fetchEastMoneyQuote
 */

const https = require("https")

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

/** @param {string} url */
function fetchText(url) {
  if (typeof fetch === "function") {
    return fetch(url, { headers: UA }).then(async (res) => {
      if (!res.ok) throw new Error(`行情请求失败 (${res.status})`)
      return res.text()
    })
  }
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: UA }, (res) => {
        let body = ""
        res.on("data", (c) => {
          body += c
        })
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`行情请求失败 (${res.statusCode})`))
            return
          }
          resolve(body)
        })
      })
      .on("error", reject)
  })
}

function fetchJson(url) {
  return fetchText(url).then((t) => JSON.parse(t))
}

/**
 * @param {string} secid
 */
function priceScaleForSecid(secid) {
  if (/^(0|1)\.\d{6}$/.test(secid)) return 100
  return 1000
}

/**
 * @param {string} input
 */
function parseAshareSymbol(input) {
  const raw = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s/g, "")
  if (!raw) return null

  let code = raw
  let market = ""

  if (/^sh(\d{6})$/.test(raw)) {
    code = raw.slice(2)
    market = "SH"
  } else if (/^sz(\d{6})$/.test(raw)) {
    code = raw.slice(2)
    market = "SZ"
  } else if (/^(\d{6})$/.test(raw)) {
    code = raw
    market = code.startsWith("6") ? "SH" : "SZ"
  } else {
    return null
  }

  const secidPrefix = market === "SH" ? "1" : "0"
  return {
    secid: `${secidPrefix}.${code}`,
    market,
    code,
    label: `${market}${code}`
  }
}

/**
 * @param {string} input
 */
function parseUsSymbol(input) {
  const sym = String(input || "")
    .trim()
    .toUpperCase()
    .replace(/\.(US|NASDAQ|NYSE)$/i, "")
  if (!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(sym)) return null
  return {
    secid: `105.${sym}`,
    market: "US",
    code: sym,
    label: sym
  }
}

/**
 * @param {string} input 如 0700.HK、00700
 */
function parseHkSymbol(input) {
  const raw = String(input || "").trim()
  let code = raw.toUpperCase().replace(/\.HK$/i, "")
  if (!/^\d{4,5}$/.test(code)) return null
  code = code.padStart(5, "0")
  return {
    secid: `116.${code}`,
    market: "HK",
    code,
    label: `HK${code}`
  }
}

/**
 * @param {string} keyword
 */
async function searchAshareByName(keyword) {
  const url =
    "https://searchapi.eastmoney.com/api/suggest/get?" +
    new URLSearchParams({ input: keyword, type: "14", count: "8" })

  const data = await fetchJson(url)
  const list = data?.QuotationCodeTable?.Data
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`未找到与「${keyword}」相关的 A 股，请提供 6 位代码（如 600519）`)
  }
  const hit = list[0]
  const code = hit.Code
  const market =
    hit.MarketType === "1" || String(hit.SecurityTypeName || "").includes("沪")
      ? "SH"
      : "SZ"
  const secidPrefix = market === "SH" ? "1" : "0"
  return {
    secid: `${secidPrefix}.${code}`,
    market,
    code,
    name: hit.Name,
    label: `${market}${code}`
  }
}

/**
 * @param {{ secid: string, market: string, code: string, label: string, name?: string }} info
 */
async function fetchEastMoneyQuote(info) {
  const url =
    "https://push2.eastmoney.com/api/qt/stock/get?" +
    new URLSearchParams({
      secid: info.secid,
      fields: "f43,f44,f45,f46,f47,f48,f57,f58,f60,f169,f170,f86"
    })

  const json = await fetchJson(url)
  const d = json?.data
  if (!d || d.f43 == null) {
    throw new Error(`无法获取 ${info.label} 的行情（可能代码有误或已停牌）`)
  }

  const scale = priceScaleForSecid(info.secid)
  const price = d.f43 / scale
  const open = d.f46 / scale
  const high = d.f44 / scale
  const low = d.f45 / scale
  const prevClose = d.f60 / scale
  const change = d.f169 / scale
  const changePct = d.f170 / 100
  const volume = d.f47
  const amount = d.f48
  const name = d.f58 || info.name || info.code
  const code = d.f57 || info.code
  const time = d.f86
    ? new Date(d.f86 * 1000).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai"
      })
    : "—"

  const sign = change >= 0 ? "+" : ""
  const currency =
    info.market === "US" ? "美元" : info.market === "HK" ? "港元" : "元"

  const lines = [
    `${name}（${info.label || code}）实时行情`,
    `市场：${marketLabel(info.market)} · 数据来源：东方财富`,
    `更新：${time}`,
    `现价：${price.toFixed(2)} ${currency}（${sign}${change.toFixed(2)} / ${sign}${changePct.toFixed(2)}%）`,
    `今开：${open.toFixed(2)} · 昨收：${prevClose.toFixed(2)}`,
    `最高：${high.toFixed(2)} · 最低：${low.toFixed(2)}`
  ]

  if (info.market === "SH" || info.market === "SZ") {
    lines.push(
      `成交量：${formatVolume(volume)} · 成交额：${formatAmount(amount)}`
    )
  }

  return lines.join("\n")
}

function marketLabel(m) {
  const map = { SH: "上交所", SZ: "深交所", US: "美股", HK: "港股" }
  return map[m] || m
}

function formatVolume(v) {
  if (v == null || Number.isNaN(v)) return "—"
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 亿手`
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)} 万手`
  return `${v} 手`
}

function formatAmount(v) {
  if (v == null || Number.isNaN(v)) return "—"
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)} 亿元`
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)} 万元`
  return `${v} 元`
}

/**
 * 查询股票实时行情（供 Agent 工具 handler 调用）
 * @param {string} symbol 代码或中文名
 * @param {string} [market] auto | ashare | us | hk
 * @returns {Promise<string>} 多行中文文本，模型会直接阅读
 */
async function getStockQuote(symbol, market = "auto") {
  const input = String(symbol || "").trim()
  if (!input) throw new Error("请提供股票代码或名称")

  const m = (market || "auto").toLowerCase()

  if (m === "us") {
    const us = parseUsSymbol(input)
    if (!us) throw new Error("美股请提供代码，如 AAPL、TSLA、NVDA")
    return fetchEastMoneyQuote(us)
  }

  if (m === "hk") {
    const hk = parseHkSymbol(input)
    if (!hk) throw new Error("港股请提供代码，如 0700.HK、00700")
    return fetchEastMoneyQuote(hk)
  }

  if (m === "ashare" || m === "cn" || m === "a股") {
    const cn = parseAshareSymbol(input)
    if (cn) return fetchEastMoneyQuote(cn)
    if (/[\u4e00-\u9fa5]/.test(input)) {
      return fetchEastMoneyQuote(await searchAshareByName(input))
    }
    throw new Error("A 股请提供 6 位代码，如 600519、000001")
  }

  const ashare = parseAshareSymbol(input)
  if (ashare) return fetchEastMoneyQuote(ashare)

  const hk = parseHkSymbol(input)
  if (hk) return fetchEastMoneyQuote(hk)

  const us = parseUsSymbol(input)
  if (us) return fetchEastMoneyQuote(us)

  if (/[\u4e00-\u9fa5]/.test(input)) {
    return fetchEastMoneyQuote(await searchAshareByName(input))
  }

  throw new Error(
    "无法识别代码。A 股：600519 / 贵州茅台；美股：AAPL；港股：0700.HK"
  )
}

module.exports = { getStockQuote, parseAshareSymbol }
