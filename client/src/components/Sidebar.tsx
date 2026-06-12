import type { ThemeId } from "../lib/theme"
import type { AppConfig } from "../types"
import { ThemeSwitcher } from "./ThemeSwitcher"

const TOOL_META: Record<string, { icon: string; tag: string }> = {
  getWeather: { icon: "🌤", tag: "天气" },
  getStockQuote: { icon: "📈", tag: "股票" },
  getCurrentTime: { icon: "🕐", tag: "时间" },
  calculator: { icon: "🔢", tag: "计算" }
}

interface Props {
  config: AppConfig | null
  theme: ThemeId
  onThemeChange: (theme: ThemeId) => void
  systemPrompt: string
  onSystemPromptChange: (v: string) => void
  autoApprove: boolean
  onAutoApproveChange: (v: boolean) => void
  onClear: () => void
}

export function Sidebar({
  config,
  theme,
  onThemeChange,
  systemPrompt,
  onSystemPromptChange,
  autoApprove,
  onAutoApproveChange,
  onClear
}: Props) {
  const hasKey = config?.hasApiKey ?? false
  const statusClass = config === null ? "loading" : hasKey ? "ok" : "warn"
  const statusText =
    config === null
      ? "检测中…"
      : hasKey
        ? "在线 · 流式就绪"
        : "未配置 API Key"

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">
            ✦
          </span>
          <div>
            <h1>Agent Studio</h1>
            <p className="brand-sub">DeepSeek · 工具编排</p>
          </div>
        </div>
        <div className={`status-strip ${statusClass}`}>
          <span className="status-dot" aria-hidden="true" />
          <span className="status-text">{statusText}</span>
          {config?.model && (
            <span className="status-model">{config.model}</span>
          )}
        </div>
      </header>

      <div className="sidebar-body scroll-thin">
        <details className="side-fold side-fold-theme" open>
          <summary className="side-fold-title">
            <span>界面风格</span>
            <span className="side-fold-chevron" aria-hidden="true" />
          </summary>
          <div className="side-fold-body side-fold-theme-body">
            <ThemeSwitcher theme={theme} onChange={onThemeChange} />
          </div>
        </details>

        <details className="side-fold side-fold-prompt" open>
          <summary className="side-fold-title">
            <span>系统提示词</span>
            <span className="side-fold-chevron" aria-hidden="true" />
          </summary>
          <div className="prompt-editor">
            <textarea
              className="sidebar-textarea scroll-thin"
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              placeholder="定义助手行为、工具使用规则…"
              spellCheck={false}
            />
            <div className="prompt-editor-footer">
              <span>支持 Markdown 说明 · 修改后对新对话生效</span>
              <span className="prompt-char-count">{systemPrompt.length} 字</span>
            </div>
          </div>
        </details>

        <details className="side-fold">
          <summary className="side-fold-title">
            <span>工具策略</span>
            <span className="side-fold-chevron" aria-hidden="true" />
          </summary>
          <div className="side-fold-body">
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => onAutoApproveChange(e.target.checked)}
              />
              <span className="toggle-switch" aria-hidden="true" />
              <span>自动执行工具</span>
            </label>
            <p className="toggle-hint">关闭后，调用工具前需你确认</p>
          </div>
        </details>

        <details className="side-fold side-fold-tools" open>
          <summary className="side-fold-title">
            <span className="side-fold-title-left">
              已注册工具
              <span className="badge">{config?.tools.length ?? 0}</span>
            </span>
            <span className="side-fold-chevron" aria-hidden="true" />
          </summary>
          <ul className="tool-grid scroll-thin">
            {config?.tools.map((t) => {
              const meta = TOOL_META[t.name] ?? { icon: "⚙", tag: "工具" }
              return (
                <li
                  key={t.name}
                  className="tool-card"
                  title={t.description}
                >
                  <span className="tool-card-icon" aria-hidden="true">
                    {meta.icon}
                  </span>
                  <div className="tool-card-text">
                    <div className="tool-card-name">
                      <code>{t.name}</code>
                      <span className="tool-card-tag">{meta.tag}</span>
                    </div>
                    <p>{t.description}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </details>
      </div>

      <footer className="sidebar-footer">
        <button type="button" className="btn btn-clear" onClick={onClear}>
          清空对话
        </button>
      </footer>
    </aside>
  )
}
