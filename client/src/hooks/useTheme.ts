import { useCallback, useEffect, useState } from "react"
import {
  applyHighlightTheme,
  applyTheme,
  DEFAULT_THEME,
  getStoredTheme,
  type ThemeId
} from "../lib/theme"

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(() => getStoredTheme())

  useEffect(() => {
    applyTheme(theme)
    applyHighlightTheme(theme)
  }, [theme])

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next)
  }, [])

  return { theme, setTheme, defaultTheme: DEFAULT_THEME }
}
