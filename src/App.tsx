import * as Y from "yjs";
import "@blocknote/core/fonts/inter.css";
import { ChatPanel } from "./components/ChatPanel";
import { CanvasPanel } from "./components/CanvasPanel";
import "./App.css";

const doc = new Y.Doc();
const chatMessages = doc.getArray("messages") as Y.Array<Y.Map<unknown>>;
const canvasFragment = doc.getXmlFragment("canvas");

function App() {
  return (
    <div className="app-layout">
      <ChatPanel messages={chatMessages} userName="You" />
      <CanvasPanel fragment={canvasFragment} doc={doc} />
    </div>
  );
}

export default App;
