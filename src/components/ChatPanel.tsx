import { useState, useEffect, useRef, useCallback } from "react";
import * as Y from "yjs";
import { renderWikilinksInHtml } from "../utils/links";

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
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setItems(messages.toArray().map(readMessage));
    sync();
    messages.observe(sync);
    return () => messages.unobserve(sync);
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items.length]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    const msg = new Y.Map<unknown>();
    msg.set("sender", userName);
    msg.set("html", text);
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
    <div className="chat-floating">
      <div className="chat-messages">
        {items.length === 0 && (
          <div className="chat-empty">Start the conversation.</div>
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
              dangerouslySetInnerHTML={{
                __html: renderWikilinksInHtml(msg.html),
              }}
            />
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          className="chat-input"
          placeholder="Type a message... (Enter to send)"
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
