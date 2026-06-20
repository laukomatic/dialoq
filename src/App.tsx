import { useEffect, useState, useCallback, useRef } from "react";
import * as Y from "yjs";
import { invoke } from "@tauri-apps/api/core";
import "@blocknote/core/fonts/inter.css";
import { ChatPanel } from "./components/ChatPanel";
import { CanvasPanel } from "./components/CanvasPanel";
import { StreamBar } from "./components/StreamBar";
import "./App.css";

const defaultNotes = [
  "inbox", "ideas", "projects", "project-alpha", "project-beta",
  "research", "personal", "learning", "meetings",
];

function streamSlug(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function createDocWithDefaults(): Y.Doc {
  const d = new Y.Doc();
  for (const name of defaultNotes) {
    d.getXmlFragment(name);
  }
  return d;
}

function App() {
  const [doc, setDoc] = useState<Y.Doc>(createDocWithDefaults);
  const [streamName, setStreamName] = useState(streamSlug);
  const loading = useRef(false);

  const chatMessages = doc.getArray("messages") as Y.Array<Y.Map<unknown>>;

  // On mount: load most recent stream, or create a fresh one.
  useEffect(() => {
    invoke<string[]>("list_streams")
      .then((streams) => {
        if (streams.length > 0) {
          loadStream(streams[0]);
        }
      })
      .catch(() => {});
  }, []);

  // Save current stream on every Y.Doc change.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const name = streamName;

    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const update = Y.encodeStateAsUpdate(doc);
        invoke("save_stream", { name, data: Array.from(update) });
      }, 1000);
    };

    doc.on("update", save);
    return () => {
      clearTimeout(timer);
      doc.off("update", save);
    };
  }, [doc, streamName]);

  const loadStream = useCallback((name: string) => {
    if (loading.current) return;
    loading.current = true;
    invoke<number[]>("load_stream", { name })
      .then((data) => {
        if (data && data.length > 0) {
          const d = new Y.Doc();
          Y.applyUpdate(d, new Uint8Array(data));
          setDoc(d);
          setStreamName(name);
        }
      })
      .catch(() => {})
      .finally(() => {
        loading.current = false;
      });
  }, []);

  const createNewChat = useCallback(() => {
    const slug = streamSlug();
    setDoc(createDocWithDefaults());
    setStreamName(slug);
  }, []);

  return (
    <div className="app-container">
      <StreamBar
        streamName={streamName}
        onNewChat={createNewChat}
        onSwitchStream={loadStream}
      />
      <CanvasPanel doc={doc} />
      <ChatPanel messages={chatMessages} userName="You" />
    </div>
  );
}

export default App;
