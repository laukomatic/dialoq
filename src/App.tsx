import * as Y from "yjs";
import "@blocknote/core/fonts/inter.css";
import { ChatPanel } from "./components/ChatPanel";
import { CanvasPanel } from "./components/CanvasPanel";
import "./App.css";

const doc = new Y.Doc();
const chatMessages = doc.getArray("messages") as Y.Array<Y.Map<unknown>>;

// Create fragments — each becomes a node on the graph.
// The canvas adds seed edges to show how they relate.
// When users type [[wikilinks]], the scanner adds dynamic edges.
const notes = [
  "inbox", "ideas", "projects", "project-alpha", "project-beta",
  "research", "personal", "learning", "meetings",
];
for (const name of notes) {
  doc.getXmlFragment(name);
}

function App() {
  return (
    <div className="app-container">
      <CanvasPanel doc={doc} />
      <ChatPanel messages={chatMessages} userName="You" />
    </div>
  );
}

export default App;
