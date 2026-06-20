import { useState, useEffect, useRef, useCallback } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import * as Y from "yjs";
import "@blocknote/mantine/style.css";

type ChatPanelProps = {
  messages: Y.Array<Y.Map<unknown>>;
  userName: string;
};

type MessageData = {
  sender: string;
  html: string;
  timestamp: number;
};

function readMessage(map: Y.Map<unknown>): MessageData {
  return {
    sender: (map.get("sender") as string) ?? "unknown",
    html: (map.get("html") as string) ?? "",
    timestamp: (map.get("timestamp") as number) ?? 0,
  };
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatPanel({ messages, userName }: ChatPanelProps) {
  const [items, setItems] = useState<MessageData[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  // Keep local state synced with the Yjs array.
  useEffect(() => {
    const sync = () => setItems(messages.toArray().map(readMessage));
    sync();
    messages.observe(sync);
    return () => messages.unobserve(sync);
  }, [messages]);

  // Auto-scroll to latest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  return (
    <div className="panel chat-panel">
      <div className="panel-header">Chat</div>

      <div className="chat-messages">
        {items.length === 0 && (
          <div className="chat-empty">
            Start the conversation. Type a message below.
          </div>
        )}
        {items.map((msg, i) => (
          <div
            key={i}
            className={`chat-bubble ${
              msg.sender === userName ? "chat-bubble--user" : "chat-bubble--ai"
            }`}
          >
            <div className="chat-bubble__meta">
              <span className="chat-bubble__sender">{msg.sender}</span>
              <span className="chat-bubble__time">{formatTime(msg.timestamp)}</span>
            </div>
            <div
              className="chat-bubble__text"
              dangerouslySetInnerHTML={{ __html: msg.html }}
            />
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <ChatInput messages={messages} userName={userName} />
    </div>
  );
}

// Separate component so the input editor only mounts once ([] deps).
function ChatInput({ messages, userName }: { messages: Y.Array<Y.Map<unknown>>; userName: string }) {
  const inputEditor = useCreateBlockNote(
    {
      initialContent: [{ type: "paragraph", content: "" }],
      animations: false,
      trailingBlock: false,
    },
    []
  );

  const send = useCallback(() => {
    const blocks = inputEditor.document;
    // Don't send empty messages.
    if (blocks.length === 0) return;
    const firstBlock = blocks[0];
    if (
      blocks.length === 1 &&
      firstBlock.type === "paragraph" &&
      (!firstBlock.content || firstBlock.content.length === 0)
    )
      return;

    const html = inputEditor.blocksToHTMLLossy(blocks);

    const msg = new Y.Map<unknown>();
    msg.set("sender", userName);
    msg.set("html", html);
    msg.set("timestamp", Date.now());
    messages.push([msg]);

    // Clear the input editor — replace all blocks with one empty paragraph.
    inputEditor.replaceBlocks(
      blocks.map((b) => b.id),
      [{ type: "paragraph", content: "" }]
    );
  }, [inputEditor, messages, userName]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter or Cmd+Enter to send — Enter alone stays in the editor for multiline.
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-input-area">
      <div className="chat-input-editor" onKeyDown={onKeyDown}>
        <BlockNoteView
          editor={inputEditor}
          formattingToolbar={false}
          sideMenu={false}
        />
      </div>
      <button className="chat-send-btn" onClick={send}>
        Send
      </button>
    </div>
  );
}
