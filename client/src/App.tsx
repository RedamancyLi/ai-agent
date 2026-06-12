import { ChatPanel } from "./components/ChatPanel"
import { Sidebar } from "./components/Sidebar"
import { useChat } from "./hooks/useChat"
import { useTheme } from "./hooks/useTheme"

export default function App() {
  const { theme, setTheme } = useTheme()
  const {
    config,
    messages,
    systemPrompt,
    setSystemPrompt,
    autoApprove,
    setAutoApprove,
    busy,
    durationMs,
    sendMessage,
    approveTools,
    stopGeneration,
    clearChat
  } = useChat()

  return (
    <div className="app">
      <Sidebar
        config={config}
        theme={theme}
        onThemeChange={setTheme}
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
        autoApprove={autoApprove}
        onAutoApproveChange={setAutoApprove}
        onClear={clearChat}
      />
      <ChatPanel
        messages={messages}
        busy={busy}
        canSend={config?.hasApiKey ?? false}
        durationMs={durationMs}
        onSend={sendMessage}
        onStop={stopGeneration}
        onApprove={approveTools}
      />
    </div>
  )
}
