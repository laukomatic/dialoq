import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

type StreamBarProps = {
  streamName: string;
  onNewChat: () => void;
  onSwitchStream: (name: string) => void;
};

function fmtStreamName(slug: string): string {
  // "2026-06-20-1530" → "Jun 20, 15:30"
  const parts = slug.split("-");
  if (parts.length >= 4) {
    const [, m, d, hh, mm] = parts;
    return `${months[parseInt(m) - 1] ?? m} ${parseInt(d)}, ${hh}:${mm}`;
  }
  return slug;
}

const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function StreamBar({ streamName, onNewChat, onSwitchStream }: StreamBarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="stream-bar">
        <span className="stream-bar-title">{fmtStreamName(streamName)}</span>
        <div className="stream-bar-actions">
          <button className="stream-bar-btn" onClick={onNewChat} title="New chat">
            + New
          </button>
          <button
            className="stream-bar-btn"
            onClick={() => setOpen(true)}
            title="Search chats"
          >
            Search
          </button>
        </div>
      </div>

      {open && (
        <StreamSearch
          current={streamName}
          onSelect={(name) => {
            onSwitchStream(name);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function StreamSearch({
  current,
  onSelect,
  onClose,
}: {
  current: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const [streams, setStreams] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    invoke<string[]>("list_streams").then(setStreams).catch(() => setStreams([]));
  }, []);

  const filtered = streams.filter((s) =>
    s.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="stream-search-overlay" onClick={onClose}>
      <div className="stream-search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="stream-search-header">
          <input
            className="stream-search-input"
            placeholder="Search streams..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button className="stream-search-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="stream-search-list">
          {filtered.map((name) => (
            <div
              key={name}
              className={`stream-search-item ${name === current ? "stream-search-item--active" : ""}`}
              onClick={() => onSelect(name)}
            >
              <span className="stream-search-item-name">{fmtStreamName(name)}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="stream-search-empty">No streams found</div>
          )}
        </div>
      </div>
    </div>
  );
}
