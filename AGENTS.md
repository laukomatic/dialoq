# Dialoq — Agent Instructions

Dialogue-based note-taking. Floating chat + full-screen ReactFlow graph canvas. Conversation → AI structures notes on a spatial canvas. Each stream is a self-contained Y.Doc (messages + note graph).

## Stack

- **Desktop**: Tauri v2 (Rust backend, React/TypeScript frontend)
- **Editor**: `@blocknote/mantine` `BlockNoteView` backed by Y.XmlFragment collaboration
- **Graph**: `@xyflow/react` ReactFlow — 2D spatial graph with custom note nodes
- **Layout**: `d3-force` force-directed layout — clusters linked notes together
- **Data**: Yjs CRDT (`yjs`) — one Y.Doc per stream
- **AI**: LM Studio local API (`http://localhost:1234/v1`) — OpenAI-compatible SSE with function calling
- **Package manager**: pnpm

## Architecture

```
src-tauri/src/
  lib.rs     — Tauri commands (save/load/list streams, chat_complete_stream)
  ai.rs      — OpenAI-compatible HTTP client (SSE streaming, tool calls, SSE→Tauri events)
  agent.rs   — tool definitions, system prompt builder, hybrid response parser
  main.rs    — #[cfg_attr(not(debug_assertions), windows_subsystem = "windows")] entry
src/
  App.tsx               — Y.Doc state, auto-save (1s debounce), handleAIChat, Ctrl+N
  components/
    ChatPanel.tsx       — textarea input, Y.Array messages, streaming AI display
    CanvasPanel.tsx     — ReactFlow graph, NoteNode, d3 layout, search dropdown, Ctrl+K
    NoteNode.tsx        — custom node: shows content preview, smart expand by relevance
    StreamBar.tsx       — returns null (no top bar)
  utils/
    links.ts            — [[wikilink]] regex parser + HTML pill renderer
    layout.ts           — d3-force simulation → positioned nodes for ReactFlow
  assets/
    digitalMindNotes.ts — 20 seed notes from Obsidian vault (used in createDocWithDefaults)
```

### Data model

One Y.Doc per stream with:
- `Y.Array` `"messages"` — entries `{ sender, html, timestamp }`
- `Y.XmlFragment` per note — BlockNote-editable rich text, one per note ID
- `Y.Array` `"archived"` — note IDs hidden from graph and AI context
- `Y.Map` `"tags"` — maps note ID to `string[]` (max 5 tags per note)

### Persistence

Rust commands at `src-tauri/src/lib.rs`:
- `save_stream(name, data: Vec<u8>)` — binary Yjs update at `%APPDATA%/com.matic.dialoq/streams/{name}.ydoc`
- `load_stream(name) -> Vec<u8>`
- `list_streams() -> Vec<String>` — newest first

Lib crate named `dialoq_lib` (required on Windows to avoid bin name conflict `dialoq.exe`).

### AI agent flow

1. User types → `ChatPanel.send()` pushes `{ sender: "You", html: text, timestamp }` to Y.Array → calls `onSendMessage`
2. `App.tsx handleAIChat`:
   - Collects non-archived notes context (`collectNotesContext`) from Y.XmlFragments
   - Calls `invoke("chat_complete_stream", { messages, notesContext, knownNoteIds, suggestTitle })`
3. Rust `chat_complete_stream`:
   - Prepends system prompt (`agent.rs system_prompt()`) with tool definitions
   - Calls `ai::stream_chat()` → SSE POST to LM Studio `/v1/chat/completions`
   - Emits each content token as `ai:token` Tauri event (frontend displays progressively)
   - Accumulates `tool_calls` (function calling), falls back to text `[CREATE: id]`/`[UPDATE: id]`
   - Returns `AgentResponse { chat_html, actions, read_note_ids, suggested_title }`
4. Frontend:
   - Applies actions to Y.Doc: `CreateNote` (with optional tags), `UpdateNote`, `ArchiveNote`, `TagNote`
   - If `suggested_title` is set, updates stream name (replaces timestamp slug)
   - Adds AI message `{ sender: "Dialoq", html, timestamp }` to Y.Array
   - Highlights `read_note_ids` on graph (2s blue glow)

### AI tools defined (`agent.rs`)

| Tool | Parameters | Effect |
|------|-----------|--------|
| `create_note` | `note_id`, `title`, `content?`, `tags?` (max 5) | New Y.XmlFragment node |
| `update_note` | `note_id`, `content` | Overwrites fragment content |
| `archive_note` | `note_id` | Adds to archived array, hidden from graph/context |
| `tag_note` | `note_id`, `tags` (max 5) | Sets tags on note in Y.Map |

Hybrid parser: tries OpenAI function calling first. If no `tool_calls` in response, falls back to parsing `[CREATE: id]`, `[UPDATE: id]`, `[ARCHIVE: id]`, `[TAG: id]tags[/TAG]`, `[TITLE: ...]` from text.

### AI config

Defaults in `ai.rs`:
- `api_url: "http://localhost:1234/v1"`
- `model: "google/gemma-4-e4b"` (swap to `google/gemma-4-31b-qat` for larger model)
- `api_key: None`

To change model, edit `src-tauri/src/ai.rs:17`.

## Commands

All commands must run from project root.

```bash
pnpm tauri dev          # Full app (Rust + Vite hot-reload)
pnpm dev                # Frontend-only Vite on port 1420
pnpm tauri build        # Production build
pnpm typecheck          # tsc --noEmit (strict, noUnusedLocals, noUnusedParameters)
cargo clippy            # Rust lint (no ESLint configured)
```

Quality order: `pnpm typecheck` → `cargo clippy` → `cargo test` (no frontend tests yet).

## Key conventions

- Chat input is plain textarea — no BlockNote in chat area
- Note content is Y.XmlFragment-backed BlockNote; the `@blocknote/mantine` `BlockNoteView` (not `@blocknote/react` `BlockNoteViewRaw`)
- Tauri commands are the only Rust↔frontend boundary (`#[tauri::command]`)
- Saving notes as text previews: use `extractFragmentText()` which recursively walks Y.XmlFragment tree extracting `Y.XmlText` nodes (not `frag.toString()` which returns Yjs XML)
- Search: `Ctrl+K` focuses search, list shows all note names with connection counts, clicking pans to node
- New chat: `Ctrl+N`
- Graph layout: `d3-force` runs 150 ticks on node/edge changes, positions normalize to viewport
- Relevance/focus: clicking a node sets `focusId`; focused node + neighbors show content, distant notes dim to title-only
- All styling in `App.css` (no CSS modules)

## Gotchas

- **CWD must be project root** for all pnpm and cargo commands
- **Cargo not in PATH** after install: add `%USERPROFILE%\.cargo\bin`
- **LM Studio must be running** at `http://localhost:1234/v1` before `pnpm tauri dev`; AI errors fail gracefully
- **Vite port 1420** is fixed (Tauri expects this); dev on network requires `TAURI_DEV_HOST` env
- **Saved streams are at `%APPDATA%\com.matic.dialoq\streams\*.ydoc`**; to reset the app, delete these files
- **TypeScript strict**: `noUnusedLocals` and `noUnusedParameters` are on — prefix unused params with `_`
- **y-sweet sync not yet implemented** — planned for multi-device sync, not wired up currently
