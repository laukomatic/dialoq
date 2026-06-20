# Dialoq — Agent Instructions

## Vision
Dialogue-based note-taking. One continuous BlockNote editor surface serves as both chat and notes. Free-form writing → AI asks proactive questions → the document evolves into structured, searchable notes in-place. The inbox IS the document.

## Stack
- **Desktop/Mobile**: Tauri v2 (Rust backend, React/TypeScript frontend)
- **Editor**: BlockNote (`@blocknote/core` + `@blocknote/react`) — block-based rich text
- **Sync**: Yjs CRDT (`yjs` + `y-websocket` for transport)
- **Rust Yjs**: `yrs` crate for CRDT persistence and sync coordination in the backend
- **AI**: LM Studio local API (`http://localhost:1234/v1`) primary; OpenCode API as cloud fallback
- **Package manager**: pnpm

## Architecture
```
src-tauri/    Rust backend — AI orchestration, Yjs sync, file I/O, CRDT persistence
src/          React frontend — single BlockNote surface, Tauri IPC bridge
```
- AI calls are proxied/coordinated through Rust, not called directly from the frontend
- The Yjs document lives in Rust; the frontend binds via `yrs` ↔ `yjs` interop
- No separate chat panel — AI responses are inserted as BlockNote blocks into the same document

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
- **Cargo not in PATH**: After installing Rust, restart the terminal or add `%USERPROFILE%\.cargo\bin` to PATH manually
- LM Studio must be running and serving before `pnpm tauri dev` (AI features fail gracefully if unreachable)
- Vite dev server runs on port 1420 (fixed in `vite.config.ts`); Tauri expects this
- Tauri v2 android requires `ANDROID_HOME` set and NDK 26+ — verify with `pnpm tauri android init`
- `y-websocket` needs a sync server URL; set via env `SYNC_SERVER_URL` (use local `y-websocket` for dev: `npx y-websocket`)
- `src-tauri/src/lib.rs` uses `dialoq_lib` as the lib name (required on Windows to avoid name conflict with the binary `dialoq.exe`)

## Sync: y-websocket vs. y-sweet
- **y-websocket** (chosen): Simple open-source WebSocket provider. You run the server yourself. No built-in persistence — you handle document storage on the server side via `yrs`. Good for your own-server setup.
- **y-sweet**: Batteries-included Yjs sync by the Yjs team. Built-in auth, persistence, and hosting. Also self-hostable but more opinionated. Overkill for starting out.

Decision: we use `y-websocket` now because you have your own server and it keeps the initial implementation simple. If auth or managed persistence becomes needed, `y-sweet` is the upgrade path.
