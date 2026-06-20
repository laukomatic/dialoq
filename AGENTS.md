# Dialoq — Agent Instructions

## Vision
Dialogue-based note-taking. Custom floating chat + full-screen ReactFlow graph canvas. Free-form conversation → AI structures notes on the spatial canvas. Each chat stream is a self-contained Y.Doc (messages + note graph).

## Stack
- **Desktop/Mobile**: Tauri v2 (Rust backend, React/TypeScript frontend)
- **Editor**: BlockNote (`@blocknote/core` + `@blocknote/react` + `@blocknote/mantine`) — block-based rich text for notes
- **Graph canvas**: ReactFlow (`@xyflow/react`) — 2D spatial graph, nodes = notes, edges = wikilinks
- **Sync**: Yjs CRDT (`yjs` + `@y-sweet/client` for transport)
- **Rust Yjs**: `yrs` crate for CRDT persistence and sync coordination in the backend
- **AI**: LM Studio local API (`http://localhost:1234/v1`) primary; OpenCode API as cloud fallback
- **Package manager**: pnpm

## Architecture
```
src-tauri/
  src/
    lib.rs    — Tauri commands (save/load/list streams, chat_complete_stream)
    ai.rs     — OpenAI-compatible API client (SSE streaming, tool calls)
    agent.rs  — AI agent logic (tool definitions, system prompt, response parser)
    main.rs   — Binary entry
src/
  components/
    ChatPanel.tsx     — custom chat UI (textarea input, Yjs-backed message bubbles)
    CanvasPanel.tsx   — ReactFlow full-screen graph + floating BlockNote editor
    StreamBar.tsx     — top bar (stream title, new chat, search/switch streams)
  utils/
    links.ts          — [[wikilink]] parser and HTML renderer
```
- **Chat panel**: Yjs-backed messages (Y.Array<Y.Map<{sender, html, timestamp}>). Textarea input, Enter to send. Messages stored as HTML, rendered with wikilink pill styling. Floating semi-transparent window at bottom center — no BlockNote in chat area.
- **Canvas panel**: Full-screen ReactFlow graph (dark space-themed). Nodes = Y.Doc fragments. Edges = seed relationships + wikilinks. Click node → floating BlockNote editor opens centered. Nodes/edges auto-update from fragment changes and `[[wikilinks]]`.
- **Wikilinks**: `[[note-id|Title]]` syntax (Obsidian/Logseq standard). Regex parser in `src/utils/links.ts`. Link scanner extracts from all Y.Doc fragments to build graph edges. Rendered as blue pills in chat messages.
- **Stream lifecycle**: Every launch = fresh empty stream (timestamp slug `YYYY-MM-DD-HHmm`). `+ New` creates fresh. `Search` opens modal to list/switch past streams. Auto-saves on every Y.Doc change (1s debounce) via Tauri IPC.
- **Persistence**: Three Rust Tauri commands: `save_stream(name, Vec<u8>)`, `load_stream(name) -> Vec<u8>`, `list_streams() -> Vec<String>`. Files at `%APPDATA%/com.matic.dialoq/streams/{name}.ydoc` (platform app-data dir). Binary Yjs update format.
- One Y.Doc per stream with multiple named fragments (one per note) + Y.Array for chat messages.

## AI Agent System

### Flow
1. User sends message → ChatPanel calls `onSendMessage(text)`
2. App.tsx `handleAIChat`:
   a. Collects notes context (fragment names + content previews)
   b. Builds conversation history from Y.Array
   c. Calls `invoke("chat_complete_stream", { messages, notesContext, knownNoteIds })`
3. Rust `chat_complete_stream` command:
   a. Prepends system prompt (with tool definitions) to messages
   b. Calls `ai::stream_chat()` → SSE request to LM Studio / OpenCode API
   c. Streams content tokens to frontend via `ai:token` Tauri events
   d. Parses response (function calls or text-based commands)
   e. Returns `AgentResponse { chat_html, actions, read_note_ids }`
4. Frontend:
   a. Listens to `ai:token` events for progressive display
   b. Applies `actions` (CreateNote, UpdateNote) to Y.Doc fragments
   c. Adds AI chat message to Y.Array
   d. Highlights `read_note_ids` nodes on ReactFlow canvas (2s glow)

### AI Backend (`src-tauri/src/ai.rs`)
- `AiConfig`: `api_url` (default `http://localhost:1234/v1`), `model`, `api_key`
- `stream_chat()`: SSE streaming with `reqwest`, emits `ai:token` events, accumulates `tool_calls`
- `chat_completion()`: Non-streaming fallback
- Supports OpenAI function calling (`tools` parameter)

### Agent Logic (`src-tauri/src/agent.rs`)
- **Tool definitions**: `create_note(note_id, title, content)`, `update_note(note_id, content)`
- **System prompt**: Informs AI about current notes, tools, and rules (always confirm actions)
- **Hybrid parser**: Tries function calling first, falls back to text-based `[CREATE: id]` / `[UPDATE: id]` parsing
- Returns `AgentResponse { chat_html, actions: Vec<AgentAction>, read_note_ids }`

### Tools defined
- `create_note(note_id, title, content)` — new Y.XmlFragment node on canvas
- `update_note(note_id, content)` — overwrites existing note content

### Node highlight
- When AI responds, `read_note_ids` are sent to `CanvasPanel`
- Affected nodes get a blue glow + border animation (2s, auto-clears)

## Commands

### Prerequisites (Windows)
- Rust + Cargo (installed via rustup.rs — ensure `~/.cargo/bin` is in PATH)
- Node.js LTS + pnpm (`npm install -g pnpm`)
- Tauri CLI: `cargo install tauri-cli --version "^2.0"`
- Android: Android Studio + SDK 34+ + NDK 26+, then `pnpm tauri android init`

### Development
```bash
pnpm tauri dev           # Full app (Rust + frontend hot-reload)
pnpm dev                 # Frontend-only Vite server (port 1420)
pnpm tauri android dev   # Android (requires SDK setup)
```

### Build
```bash
pnpm tauri build         # Production desktop build
```

### Quality (run in this order)
```bash
pnpm typecheck           # tsc --noEmit (frontend)
pnpm lint                # Not yet configured — add ESLint
cargo clippy             # Rust lint
cargo test               # Rust unit tests
pnpm test                # Not yet configured — add Vitest
```

## Key Conventions
- AI prompt templates and model configs live in `src-tauri/`, not the frontend
- AI_API_URL reads from env/config, never hardcoded — defaults to `http://localhost:1234/v1` (LM Studio) with fallback to OpenCode API
- All editor state is Yjs-native; BlockNote's built-in Yjs binding is the sole state management
- Tauri commands (`#[tauri::command]`) are the only Rust↔frontend boundary
- Chat panel uses plain textarea, NOT BlockNote — block-level formatting (headings, lists) is intentionally excluded from chat

## Environment & Gotchas
- **All commands MUST run from project root**: `pnpm tauri dev`, `pnpm dev`, etc. use CWD — Tauri does not auto-detect the project. Always `cd` to the project root first.
- **Cargo not in PATH**: After installing Rust, restart the terminal or add `%USERPROFILE%\.cargo\bin` to PATH manually
- LM Studio must be running and serving before `pnpm tauri dev` (AI features fail gracefully if unreachable)
- Vite dev server runs on port 1420 (fixed in `vite.config.ts`); Tauri expects this
- Tauri v2 android requires `ANDROID_HOME` set and NDK 26+ — verify with `pnpm tauri android init`
- `y-sweet` needs a sync server URL; set via env `SWEET_SERVER_URL` (use local `y-sweet` for dev: `npx y-sweet serve`)
- `src-tauri/src/lib.rs` uses `dialoq_lib` as the lib name (required on Windows to avoid name conflict with the binary `dialoq.exe`)
- BlockNote editor uses `@blocknote/mantine` `BlockNoteView`, NOT `@blocknote/react` `BlockNoteViewRaw` — the latter has no built-in slash menu/toolbar

## Sync: y-sweet (chosen over y-websocket)
- **y-sweet** (chosen): Built-in auth, persistence, and sync by the Yjs/Jamsocket team. Self-hostable. Required because notes are private — y-websocket has zero access control (anyone with the URL can read/write).
- **y-websocket**: Simple open-source WebSocket provider. No auth, no built-in persistence. Only suitable for public/unauthenticated use cases.

Client: `@y-sweet/client` on the frontend. Server: `y-sweet` (self-hosted or Jamsocket cloud).

## Future: 3D Graph Canvas (planned, not implemented)

The 2D ReactFlow graph is MVP. A 3D graph would better represent the spatial thinking vision (like Constella's infinite canvas, but in 3D). Key considerations:

- **Library**: `@react-three/fiber` (Three.js for React) + `@react-three/drei` for helpers
- **Node layout**: Force-directed 3D graph (like `three-forcegraph` or `ngraph.forcelayout3d`)
- **Navigation**: Orbit controls (rotate, pan, zoom). Nodes are spheres, edges are lines/curves.
- **Interaction**: Click node → open detail panel (same as current 2D). Hover → show preview card.
- **Performance**: For <1000 nodes, Three.js handles fine. Instanced rendering for >1000.
- **Fallback**: Keep 2D ReactFlow as the default. 3D as an optional view toggle.
- **Challenge**: Text labels in 3D are harder to render cleanly. Use canvas-texture sprites or CSS overlays.
- **Timeline**: Post-MVP, after sync and AI are functional.
