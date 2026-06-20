import { useEffect, useState, useCallback, useRef } from "react";
import * as Y from "yjs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@blocknote/core/fonts/inter.css";
import { ChatPanel } from "./components/ChatPanel";
import { CanvasPanel } from "./components/CanvasPanel";
import { StreamBar } from "./components/StreamBar";
import "./App.css";

const defaultNotes = [
  "welcome", "thoughts", "project-ideas", "notes-archive",
  "reference", "journal", "ai-concepts",
];

const AI_NAME = "Dialoq";
const NOTE_EXCLUDE = new Set(["messages", "archived", "tags"]);
const TS_SLUG_RE = /^\d{4}-\d{2}-\d{2}-\d{4}$/;

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

function isTimestampSlug(name: string): boolean {
  return TS_SLUG_RE.test(name);
}

function collectNotesContext(doc: Y.Doc): { context: string; noteIds: string[] } {
  const archived = new Set((doc.getArray("archived") as Y.Array<string>).toArray());
  const tagMap = doc.getMap("tags") as Y.Map<string[]>;
  const ids = Array.from(doc.share.keys()).filter(
    (k) => !NOTE_EXCLUDE.has(k) && !archived.has(k)
  );
  const parts: string[] = [];
  for (const id of ids) {
    try {
      const frag = doc.getXmlFragment(id);
      const text = frag.toString();
      const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
      const tags = tagMap.get(id);
      const tagStr = tags && tags.length > 0 ? ` [${tags.join(", ")}]` : "";
      parts.push(`- \`${id}\`${tagStr}: ${preview || "(empty)"}`);
    } catch {
      parts.push(`- \`${id}\`: (empty)`);
    }
  }
  return { context: parts.join("\n"), noteIds: ids };
}

function buildChatMessages(messages: Y.Array<Y.Map<unknown>>): { role: string; content: string }[] {
  const result: { role: string; content: string }[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages.get(i);
    if (!m) continue;
    const sender = m.get("sender") as string | undefined;
    const html = m.get("html") as string | undefined;
    if (!sender || !html) continue;
    const role = sender === AI_NAME ? "assistant" : "user";
    result.push({ role, content: html });
  }
  return result;
}

function App() {
  const [doc, setDoc] = useState<Y.Doc>(createDocWithDefaults);
  const [streamName, setStreamName] = useState(streamSlug);
  const loading = useRef(false);
  const aiBusy = useRef(false);

  const [aiStreamingText, setAiStreamingText] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);

  const chatMessages = doc.getArray("messages") as Y.Array<Y.Map<unknown>>;

  useEffect(() => {
    invoke<string[]>("list_streams")
      .then((streams) => {
        if (streams.length > 0) {
          loadStream(streams[0]);
        }
      })
      .catch(() => {});
  }, []);

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
    setHighlightedNodeIds([]);
  }, []);

  // Ctrl+N for new chat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        createNewChat();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [createNewChat]);

  const handleAIChat = useCallback(async (_userText: string) => {
    if (aiBusy.current) return;
    aiBusy.current = true;
    setIsAiLoading(true);
    setAiStreamingText("");

    let unlistenToken: (() => void) | undefined;
    try {
      const { context, noteIds } = collectNotesContext(doc);
      const messages = buildChatMessages(chatMessages);
      // Suggest title if stream name is still a timestamp slug and we have at least 2 user messages
      const userMsgCount = messages.filter((m) => m.role === "user").length;
      const suggestTitle = isTimestampSlug(streamName) && userMsgCount >= 1;

      unlistenToken = await listen<string>("ai:token", (event) => {
        setAiStreamingText((prev) => prev + event.payload);
      });

      const result = await invoke<{
        chat_html: string;
        actions: Record<string, unknown>[];
        read_note_ids: string[];
        suggested_title: string | null;
      }>("chat_complete_stream", {
        messages,
        notesContext: context,
        knownNoteIds: noteIds,
        suggestTitle,
      });

      // Apply mutations to Y.Doc
      const tagMap = doc.getMap("tags") as Y.Map<string[]>;
      const archivedArr = doc.getArray("archived") as Y.Array<string>;

      for (const action of result.actions) {
        const a = action as Record<string, unknown>;
        if (a.CreateNote) {
          const { note_id, title, content, tags } = a.CreateNote as {
            note_id: string; title: string; content: string; tags?: string[];
          };
          const frag = doc.getXmlFragment(note_id);
          const insert = new Y.XmlElement("paragraph");
          insert.setAttribute("content", `${title}\n\n${content}`);
          frag.insert(0, [insert]);
          if (tags && tags.length > 0) {
            tagMap.set(note_id, tags);
          }
        } else if (a.UpdateNote) {
          const { note_id, content } = a.UpdateNote as { note_id: string; content: string };
          try {
            const existing = doc.getXmlFragment(note_id);
            const insert = new Y.XmlElement("paragraph");
            insert.setAttribute("content", content);
            existing.insert(0, [insert]);
          } catch {
            const frag = doc.getXmlFragment(note_id);
            const insert = new Y.XmlElement("paragraph");
            insert.setAttribute("content", content);
            frag.insert(0, [insert]);
          }
        } else if (a.ArchiveNote) {
          const { note_id } = a.ArchiveNote as { note_id: string };
          if (!archivedArr.toArray().includes(note_id)) {
            archivedArr.push([note_id]);
          }
        } else if (a.TagNote) {
          const { note_id, tags } = a.TagNote as { note_id: string; tags: string[] };
          if (tags && tags.length > 0) {
            tagMap.set(note_id, tags);
          }
        }
      }

      // Apply suggested title
      if (result.suggested_title) {
        setStreamName(result.suggested_title);
      }

      // Add AI response to chat
      const chatText = result.chat_html || "Done.";
      const aiMsg = new Y.Map<unknown>();
      aiMsg.set("sender", AI_NAME);
      aiMsg.set("html", chatText);
      aiMsg.set("timestamp", Date.now());
      chatMessages.push([aiMsg]);

      // Highlight read notes
      if (result.read_note_ids.length > 0) {
        setHighlightedNodeIds(result.read_note_ids);
        setTimeout(() => setHighlightedNodeIds([]), 2000);
      }
    } catch (err) {
      console.error("AI chat error:", err);
      const errMsg = new Y.Map<unknown>();
      errMsg.set("sender", AI_NAME);
      errMsg.set("html", `\u26a0\ufe0f Sorry, I encountered an error: ${err}`);
      errMsg.set("timestamp", Date.now());
      chatMessages.push([errMsg]);
    } finally {
      unlistenToken?.();
      aiBusy.current = false;
      setIsAiLoading(false);
      setAiStreamingText("");
    }
  }, [doc, chatMessages, streamName]);

  return (
    <div className="app-container">
      <StreamBar />
      <CanvasPanel doc={doc} highlightedNodeIds={highlightedNodeIds} />
      <ChatPanel
        messages={chatMessages}
        userName="You"
        aiName={AI_NAME}
        onSendMessage={handleAIChat}
        aiStreamingText={aiStreamingText}
        isAiLoading={isAiLoading}
      />
    </div>
  );
}

export default App;
