import { THEMES, type ThemeId } from "../lib/theme"

interface Props {
  theme: ThemeId
  onChange: (theme: ThemeId) => void
}

export function ThemeSwitcher({ theme, onChange }: Props) {
  return (
    <div className="theme-switcher" role="radiogroup" aria-label="界面风格">
      <div className="theme-switcher-grid">
        {THEMES.map((t) => {
          const active = theme === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              className={`theme-option${active ? " active" : ""}`}
              title={t.desc}
              onClick={() => onChange(t.id)}
            >
              <span className="theme-swatch" aria-hidden="true">
                {t.swatch.map((c, i) => (
                  <span
                    key={i}
                    className="theme-swatch-dot"
                    style={{ background: c }}
                  />
                ))}
              </span>
              <span className="theme-option-label">{t.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
