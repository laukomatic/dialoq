# Dialoq

A dialogue-based note-taking application. One continuous BlockNote editor surface serves as both chat and notes. Free-form writing evolves into structured, searchable knowledge via AI-guided dialogue.

Built with Tauri v2, React, BlockNote, and Yjs CRDT sync (y-sweet).

## Development

```bash
pnpm install
pnpm tauri dev          # Desktop app with hot-reload
pnpm tauri android dev  # Android (requires SDK setup)
```

See [AGENTS.md](AGENTS.md) for architecture, conventions, and full command reference.
