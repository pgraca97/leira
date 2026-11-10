import { AppHeader } from "./components/AppHeader"
import { Editor } from "./editor/Editor"

export function App() {
  return (
    <div className="flex h-full flex-col">
      <AppHeader />
      <div className="min-h-0 flex-1">
        <Editor />
      </div>
    </div>
  )
}
