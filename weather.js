/**
 * weather.js — 天气工具实现（Open-Meteo，无需 API Key）
 *
 * 流程：城市名 → 地理编码拿经纬度 → 预报 API 拿当前天气 → 格式化成中文文本
 * 被 tools.js 的 getWeather 工具调用，返回值会作为 role:tool 消息给模型阅读
 */

const https = require("https")

const WMO_ZH = {
  0: "晴",
  1: "大部晴朗",
  2: "局部多云",
  3: "阴",
  45: "雾",
  48: "雾凇",
  51: "小毛毛雨",
  53: "毛毛雨",
  55: "大毛毛雨",
  56: "冻毛毛雨",
  57: "冻毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  66: "冻雨",
  67: "冻雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  77: "雪粒",
  80: "小阵雨",
  81: "阵雨",
  82: "大阵雨",
  85: "小阵雪",
  86: "大阵雪",
  95: "雷暴",
  96: "雷暴伴小冰雹",
  99: "雷暴伴大冰雹"
}

function wmoToZh(code) {
  return WMO_ZH[code] ?? `天气码 ${code}`
}

/** 兼容 Node 16（无全局 fetch）与较新版本 */
function fetchJson(url) {
  if (typeof fetch === "function") {
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error(`天气服务请求失败 (${res.status})`)
      return res.json()
    })
  }
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = ""
        res.on("data", (chunk) => {
          body += chunk
        })
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error(`天气服务请求失败 (${res.statusCode})`))
            return
          }
          try {
            resolve(JSON.parse(body))
          } catch (err) {
            reject(err)
          }
        })
      })
      .on("error", reject)
  })
}

/**
 * @param {string} city
 * @returns {Promise<string>}
 */
async function getWeather(city) {
  const name = String(city || "").trim()
  if (!name) throw new Error("请提供城市名")

  const geoUrl =
    "https://geocoding-api.open-meteo.com/v1/search?" +
    new URLSearchParams({
      name,
      count: "1",
      language: "zh",
      format: "json"
    })

  const geo = await fetchJson(geoUrl)
  const place = geo.results?.[0]
  if (!place) {
    throw new Error(`未找到城市「${name}」，请尝试更具体的名称（如 上海、北京市）`)
  }

  const { latitude, longitude, name: placeName, country, admin1 } = place
  const label = [placeName, admin1, country].filter(Boolean).join("，")

  const weatherUrl =
    "https://api.open-meteo.com/v1/forecast?" +
    new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current:
        "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
      timezone: "auto",
      wind_speed_unit: "kmh"
    })

  const forecast = await fetchJson(weatherUrl)
  const c = forecast.current
  if (!c) throw new Error("未能获取当前天气数据")

  const temp = c.temperature_2m
  const feels = c.apparent_temperature
  const humidity = c.relative_humidity_2m
  const wind = c.wind_speed_10m
  const condition = wmoToZh(c.weather_code)
  const time = c.time ? c.time.replace("T", " ") : ""

  return [
    `${label} 实时天气（数据来源：Open-Meteo）`,
    `观测时间：${time}`,
    `天气：${condition}`,
    `气温：${temp}℃（体感 ${feels}℃）`,
    `湿度：${humidity}%`,
    `风速：${wind} km/h`
  ].join("\n")
}

module.exports = { getWeather }
