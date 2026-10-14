# Instructions for agents

Gloss: a Windows desktop app (Electron + React + TypeScript) for reading Project Gutenberg books with
local Kokoro TTS and word-by-word highlighting. Read `docs/decisions.md` and `docs/architecture.md`
before starting a slice.

## Commands

- `npm start` run the app
- `npm run lint` / `npm run format` / `npm run typecheck` / `npm test`
- `npm run check` lint + typecheck + test

**Run `npm run check` before saying a task is done.** Report failures honestly, with output.

## CI

A task isn't done until CI passes on the pull request. If it fails, read the logs
(`gh run view --log-failed`) and fix it before reporting back. See `docs/ci.md`.

Tests and CI never touch the network or real TTS. Mock Kokoro, Gutendex and any HTTP calls in tests.

## Layout

| Folder          | Belongs here                                                                        |
| --------------- | ----------------------------------------------------------------------------------- |
| `src/main/`     | Electron main process: window setup, IPC handlers, `gloss-media://`, AI calls       |
| `src/preload/`  | Typed bridge exposed to the renderer (only what `src/shared/ipc.ts` declares)       |
| `src/renderer/` | React UI. No Node/Electron imports                                                  |
| `src/shared/`   | Pure TS used by both sides: types, IPC contract, helpers. Unit-test everything here |
| `src/workers/`  | TTS generation in `utilityProcess` / worker threads                                 |
| `docs/`         | Decisions, architecture, design, briefs, agent log                                  |

## Security rules (decision 7)

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Never weaken these.
- The renderer talks to main only through the typed preload API. Do not expose `ipcRenderer` or
  generic channels.
- Serve media via the `gloss-media://` protocol, not `file://`.

## Threading rule (decision 8)

CPU-heavy work (Kokoro, ffmpeg encoding) runs in a `utilityProcess` or worker thread. Never on the
main or renderer thread.

## Conventions

- TypeScript strict mode. No `any` without a comment explaining why.
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Small commits; one slice per branch.
- Prettier formats; ESLint lints. Do not hand-format.
- Do not add dependencies without saying why in your summary. Install a library in the slice that
  first uses it.
- If a decision in `docs/decisions.md` needs to change, propose it; don't silently diverge.
- Design: tokens live in `src/renderer/styles/tokens.css` only; no raw hex values in components
  (see `docs/design.md`).
- Per-word highlighting uses a non-React loop toggling a class on `[data-word-id]`, never React state.
