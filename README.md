# Gloss

A personal Windows desktop app for reading [Project Gutenberg](https://www.gutenberg.org/) books with
audiobook-quality text-to-speech (local Kokoro) and word-by-word highlighting, plus an AI "margin"
assistant. Built with Electron, React and TypeScript.

> Status: project foundation only. No reader features yet; see [docs/architecture.md](docs/architecture.md)
> for the slice roadmap.

## Requirements

- Windows 10/11
- Node.js 22 LTS or newer (developed on Node 26) and npm 10+

## Run

```bash
npm install
npm start
```

This opens the Electron window in development mode (Vite dev server + hot reload). The first run
downloads the Electron binary.

## Develop

| Command             | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `npm start`         | Run the app in development                         |
| `npm run lint`      | ESLint                                             |
| `npm run format`    | Prettier (write); `npm run format:check` to verify |
| `npm run typecheck` | `tsc --noEmit`                                     |
| `npm test`          | Vitest unit tests                                  |
| `npm run check`     | lint + typecheck + test (run before every commit)  |

## Package

```bash
npm run package   # unpacked app in out/
npm run make      # Windows installer (Squirrel) in out/make/
```

## Docs

- [CLAUDE.md](CLAUDE.md): rules for AI agents working in this repo
- [docs/decisions.md](docs/decisions.md): architectural decisions and why
- [docs/architecture.md](docs/architecture.md): data flow and slice roadmap
- [docs/design.md](docs/design.md): design direction (spec to come)

The app name lives in `src/shared/appInfo.ts`; also update `package.json` (`name`, `productName`) and
the `<title>` in `src/renderer/index.html` to rename it.
