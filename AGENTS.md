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
- `y-sweet` needs a sync server URL; set via env `SWEET_SERVER_URL` (use local `y-sweet` for dev: `npx y-sweet serve`)
- `src-tauri/src/lib.rs` uses `dialoq_lib` as the lib name (required on Windows to avoid name conflict with the binary `dialoq.exe`)

## Sync: y-sweet (chosen over y-websocket)
- **y-sweet** (chosen): Built-in auth, persistence, and sync by the Yjs/Jamsocket team. Self-hostable. Required because notes are private — y-websocket has zero access control (anyone with the URL can read/write).
- **y-websocket**: Simple open-source WebSocket provider. No auth, no built-in persistence. Only suitable for public/unauthenticated use cases.

Client: `@y-sweet/client` on the frontend. Server: `y-sweet` (self-hosted or Jamsocket cloud).
