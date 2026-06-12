export const THEME_STORAGE_KEY = "agent-studio-theme"

export const THEMES = [
  {
    id: "midnight",
    label: "午夜蓝",
    desc: "默认深色 · 蓝紫强调",
    swatch: ["#090b10", "#6ea8fe", "#b794f6"]
  },
  {
    id: "light",
    label: "晨光",
    desc: "浅色界面 · 清爽阅读",
    swatch: ["#f4f6fb", "#2563eb", "#7c3aed"]
  },
  {
    id: "forest",
    label: "森绿",
    desc: "深色 · 青绿强调",
    swatch: ["#0a100e", "#3dd68c", "#5ce1c0"]
  },
  {
    id: "sunset",
    label: "暮光",
    desc: "深色 · 暖橙玫瑰",
    swatch: ["#120c10", "#ff9f6b", "#f472b6"]
  }
] as const

export type ThemeId = (typeof THEMES)[number]["id"]

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id))

export function isThemeId(value: string): value is ThemeId {
  return THEME_IDS.has(value)
}

export const DEFAULT_THEME: ThemeId = "midnight"

export function getStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw && isThemeId(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute("data-theme", theme)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
  document.documentElement.style.colorScheme =
    theme === "light" ? "light" : "dark"
}

const HLJS_DARK =
  "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github-dark.min.css"
const HLJS_LIGHT =
  "https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/github.min.css"

export function applyHighlightTheme(theme: ThemeId) {
  let link = document.getElementById("hljs-theme") as HTMLLinkElement | null
  if (!link) {
    link = document.createElement("link")
    link.id = "hljs-theme"
    link.rel = "stylesheet"
    document.head.appendChild(link)
  }
  link.href = theme === "light" ? HLJS_LIGHT : HLJS_DARK
}
