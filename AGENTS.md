# Dialoq — Agent Instructions

## Vision
Dialogue-based note-taking. One continuous BlockNote editor surface serves as both chat and notes. Free-form writing → AI asks proactive questions → the document evolves into structured, searchable notes in-place. The inbox IS the document.

## Stack
- **Desktop/Mobile**: Tauri v2 (Rust backend, React/TypeScript frontend)
- **Editor**: BlockNote (`@blocknote/core` + `@blocknote/react`) — block-based rich text
- **Sync**: Yjs CRDT (`yjs` + `@y-sweet/client` for transport)
- **Rust Yjs**: `yrs` crate for CRDT persistence and sync coordination in the backend
- **AI**: LM Studio local API (`http://localhost:1234/v1`) primary; OpenCode API as cloud fallback
- **Package manager**: pnpm

## Architecture
```
src-tauri/    Rust backend — AI orchestration, Yjs sync, file I/O, CRDT persistence
src/          React frontend — dual-panel layout (chat + graph canvas)
  components/
    ChatPanel.tsx     — custom chat UI (rich text BlockNote input, message bubbles)
    CanvasPanel.tsx   — ReactFlow graph + BlockNote note editor (collapsible)
  utils/
    links.ts          — [[wikilink]] parser and HTML renderer
```
- **Chat panel**: Custom chat with Yjs-backed messages (Y.Array<Y.Map>). BlockNote editor for rich-text input. Messages stored as HTML, rendered with wikilink pill styling.
- **Canvas panel**: ReactFlow graph (nodes = notes, edges = wikilinks). Click node → open BlockNote editor in detail panel. Collapsible with toggle button.
- **Wikilinks**: `[[note-id|Title]]` syntax (Obsidian/Logseq standard). AI writes them as plain text. Link scanner extracts them from all Y.Doc fragments to build graph edges.
- One Y.Doc per stream with multiple named fragments (one per note) + Y.Array for chat messages.
- AI calls are proxied/coordinated through Rust, not called directly from the frontend

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

## Environment & Gotchas
- **All commands MUST run from project root**: `pnpm tauri dev`, `pnpm dev`, etc. use CWD — Tauri does not auto-detect the project. Always `cd` to the project root first.
- **Cargo not in PATH**: After installing Rust, restart the terminal or add `%USERPROFILE%\.cargo\bin` to PATH manually
- LM Studio must be running and serving before `pnpm tauri dev` (AI features fail gracefully if unreachable)
- Vite dev server runs on port 1420 (fixed in `vite.config.ts`); Tauri expects this
- Tauri v2 android requires `ANDROID_HOME` set and NDK 26+ — verify with `pnpm tauri android init`
- `y-sweet` needs a sync server URL; set via env `SWEET_SERVER_URL` (use local `y-sweet` for dev: `npx y-sweet serve`)
- `src-tauri/src/lib.rs` uses `dialoq_lib` as the lib name (required on Windows to avoid name conflict with the binary `dialoq.exe`)

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
