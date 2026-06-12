import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { applyHighlightTheme, applyTheme, getStoredTheme } from "./lib/theme"
import "./index.css"

applyTheme(getStoredTheme())
applyHighlightTheme(getStoredTheme())

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
