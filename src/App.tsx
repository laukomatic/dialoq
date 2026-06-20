import * as Y from "yjs";
import "@blocknote/core/fonts/inter.css";
import { ChatPanel } from "./components/ChatPanel";
import { CanvasPanel } from "./components/CanvasPanel";
import "./App.css";

// One Y.Doc per stream. Each stream has two fragments:
//   "chat"   → chronological dialogue
//   "canvas" → AI-structured notes, mind map data
const doc = new Y.Doc();
const chatFragment = doc.getXmlFragment("chat");
const canvasFragment = doc.getXmlFragment("canvas");

function App() {
  return (
    <div className="app-layout">
      <ChatPanel fragment={chatFragment} />
      <CanvasPanel fragment={canvasFragment} />
    </div>
  );
}

export default App;
