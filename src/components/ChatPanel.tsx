import { useState, useEffect, useRef, useCallback } from "react";
import * as Y from "yjs";

type ChatPanelProps = {
  messages: Y.Array<Y.Map<unknown>>;
  userName: string;
};

type MessageData = {
  sender: string;
  text: string;
  timestamp: number;
};

// Reads a Y.Map into a plain JS object for rendering.
function readMessage(map: Y.Map<unknown>): MessageData {
  return {
    sender: (map.get("sender") as string) ?? "unknown",
    text: (map.get("text") as string) ?? "",
    timestamp: (map.get("timestamp") as number) ?? 0,
  };
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatPanel({ messages, userName }: ChatPanelProps) {
  const [items, setItems] = useState<MessageData[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Keep local state in sync with the Yjs array.
  useEffect(() => {
    const sync = () => setItems(messages.toArray().map(readMessage));
    sync();
    messages.observe(sync);
    return () => messages.unobserve(sync);
  }, [messages]);

  // Auto-scroll to the latest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    const msg = new Y.Map<unknown>();
    msg.set("sender", userName);
    msg.set("text", text);
    msg.set("timestamp", Date.now());
    messages.push([msg]);
    setInput("");
  }, [input, messages, userName]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

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
            <div className="chat-bubble__text">{msg.text}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          className="chat-input"
          placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
        />
        <button className="chat-send-btn" onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}
