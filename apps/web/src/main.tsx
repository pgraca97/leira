import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import "./i18n"
import { App } from "./App"
import { startAnalytics } from "./analytics"
import { loadConfig } from "./lib/config"

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Root element not found")

void startAnalytics(loadConfig)

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
)
