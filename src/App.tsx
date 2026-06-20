import * as Y from "yjs";
import "@blocknote/core/fonts/inter.css";
import { ChatPanel } from "./components/ChatPanel";
import { CanvasPanel } from "./components/CanvasPanel";
import "./App.css";

const doc = new Y.Doc();
const chatMessages = doc.getArray("messages") as Y.Array<Y.Map<unknown>>;

// Create the inbox fragment so it appears as a graph node immediately.
doc.getXmlFragment("inbox");

function App() {
  return (
    <div className="app-container">
      <CanvasPanel doc={doc} />
      <ChatPanel messages={chatMessages} userName="You" />
    </div>
  );
}

export default App;
