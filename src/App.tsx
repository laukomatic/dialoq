import { useEffect } from "react";
import * as Y from "yjs";
import { invoke } from "@tauri-apps/api/core";
import "@blocknote/core/fonts/inter.css";
import { ChatPanel } from "./components/ChatPanel";
import { CanvasPanel } from "./components/CanvasPanel";
import "./App.css";

const STREAM_NAME = "default";
const doc = new Y.Doc();
const chatMessages = doc.getArray("messages") as Y.Array<Y.Map<unknown>>;

const defaultNotes = [
  "inbox", "ideas", "projects", "project-alpha", "project-beta",
  "research", "personal", "learning", "meetings",
];

function App() {
  // Load saved stream on mount, create defaults if new.
  useEffect(() => {
    invoke<number[]>("load_stream", { name: STREAM_NAME })
      .then((data) => {
        if (data && data.length > 0) {
          Y.applyUpdate(doc, new Uint8Array(data));
        } else {
          createDefaults();
        }
      })
      .catch(() => {
        createDefaults();
      });
  }, []);

  // Save to disk on every change (debounced to 1s).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const update = Y.encodeStateAsUpdate(doc);
        invoke("save_stream", {
          name: STREAM_NAME,
          data: Array.from(update),
        });
      }, 1000);
    };

    doc.on("update", save);
    return () => {
      clearTimeout(timer);
      doc.off("update", save);
    };
  }, []);

  return (
    <div className="app-container">
      <CanvasPanel doc={doc} />
      <ChatPanel messages={chatMessages} userName="You" />
    </div>
  );
}

function createDefaults() {
  for (const name of defaultNotes) {
    doc.getXmlFragment(name);
  }
}

export default App;
