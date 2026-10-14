# Decisions

Each decision is numbered as in the original brief. To change one, propose it first; don't silently diverge.

1. **Electron + Electron Forge (Vite + TypeScript template).** Consistent Chromium behaviour on Windows and an all-JS stack.
2. **TTS: Kokoro, run locally.** Try `kokoro-js` first; fall back to a Python sidecar only if it can't provide word timestamps (decided in slice 0). Offline, free, audiobook-quality voices.
3. **Generate audio once, cache forever.** Per chapter: `chNN.mp3` (constant bitrate) or `.opus`, plus `chNN.json` with word timings. Generated on first open, then ahead in the background; "Prepare whole book" option. Cache keys hash text and voice settings. Generation is slow; replays should be instant and stable.
4. **Timing JSON modelled on EPUB 3 Media Overlays** (text position, audio file, start, end). Keeps a SMIL export possible later.
5. **Every source word has a stable ID** (book → chapter → paragraph → word). Kokoro's spoken words are mapped back to these IDs, handling cases like "Mr." read as "Mister".
6. **Storage: better-sqlite3** for library, progress and notes; media in `app.getPath('userData')`. Simple, synchronous, local.
7. **Security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; the renderer reaches main only through a typed preload API. Standard Electron hardening.
8. **CPU-heavy work (Kokoro) runs in a `utilityProcess` or worker thread**, never on the main or renderer thread, so the UI never stutters.
9. **UI: React + TypeScript (strict).** CSS variables for theme tokens + CSS Modules; Zustand for app state. Word highlighting during playback is a non-React loop toggling a class on `[data-word-id]` elements, never React state, to avoid re-rendering paragraphs ~60×/sec.
10. **Design lives in the repo.** Direction: combined "Marginalia + Lamplight", with Page and Focus tabs, light and dark themes, and a single amber highlight on the spoken word. Source of truth: `docs/design.md` plus screenshots in `docs/design/`. Tokens are defined once as CSS variables in `src/renderer/styles/tokens.css`; components never use raw hex; fonts are bundled via @fontsource (offline; nothing from Google Fonts at runtime). Agents can't open the claude.ai canvas link, so the repo copy is authoritative.
11. **Typed IPC contract in `src/shared/ipc.ts`;** preload exposes only those functions. One reviewable surface between renderer and main.
12. **Media served via a custom `gloss-media://` protocol** (`protocol.handle`), not `file://` paths. Works with sandbox/CSP and keeps file access controlled.
13. **Audio pipeline: Kokoro → raw audio → ffmpeg-static → Opus.** The generation queue lives in a utilityProcess: current chapter first, cancellable, progress reported over IPC.
14. **AI assistant calls run in the main process.** API key stored with `safeStorage`; responses streamed to the renderer. The key never reaches the renderer.
15. **better-sqlite3 with Forge's auto-unpack-natives plugin;** plain SQL with numbered migrations. Native modules must be unpacked from asar to load.
16. **EPUB parsing: yauzl + htmlparser2,** in main/worker only. Small, streaming, no DOM needed.
17. **Testing: Vitest (+ React Testing Library); Playwright e2e later.** Logging: electron-log.
18. **CI: GitHub Actions; pure-TS checks on Linux, packaging on Windows; Dependabot with grouped updates; audit is informational.** Why: agents write most of the code, so every pull request must pass the same checks they run locally (`npm run check`). Linux runners are fast and cheap for lint, typecheck and tests; Windows minutes are spent once per run, on `package`, where native-module and path problems show up. Grouped Dependabot updates keep dependency churn to a few pull requests a week. `npm audit` shows in the run but isn't required, so a new advisory doesn't block unrelated work. See `docs/ci.md`.

## Foundation-commit notes (not part of the original list)

- **Linting is ESLint + Prettier, not Forge's default oxlint/oxfmt.** The current Forge template ships oxlint/oxfmt with no ESLint config; the brief asked for ESLint and Prettier, so those replaced them.
