# Architecture

## Planned data flow

```
EPUB file (main shows the open dialog; the renderer never sends a path)
  → parse (main: yauzl + htmlparser2, src/main/epub/), kept in memory per session
  → chapters (one per top-level TOC entry) → paragraphs (blocks) → words, each with a stable ID
    (book:chapter:paragraph:word, built only by src/shared/wordId.ts)
  → renderer: openBook() → BookSummary (metadata + chapter list); getChapter(id, n) → one chapter
  → Kokoro worker (utilityProcess): text + voice → raw audio + spoken-word timestamps
  → map spoken words back to source word IDs ("Mr." → "Mister")
  → ffmpeg-static → Opus/MP3  +  chNN.json timing (Media-Overlays-style: text position, audio, start, end)
  → cached in userData, keyed by hash(text, voice settings)
  → served to the renderer via gloss-media://
  → player (renderer): <audio> currentTime → binary search timings
  → non-React highlight loop toggles a class on [data-word-id]
```

Process model: main owns windows, IPC, protocol, SQLite and AI calls; the renderer is sandboxed and
uses only the typed preload API (`src/shared/ipc.ts`); `src/workers/` hosts all CPU-heavy work.

## Slice roadmap

| #   | Slice               | Summary                                                         |
| --- | ------------------- | --------------------------------------------------------------- |
| 0   | Spike               | Done: `kokoro-js` + timestamped export gives word timestamps    |
| 1   | EPUB parsing        | Parse a Gutenberg EPUB into chapters/paragraphs/words with IDs  |
| 2   | Reader view         | Render the text; design tokens, themes (needs `docs/design.md`) |
| 3   | Generation pipeline | Kokoro worker, ffmpeg → Opus, timing JSON, cache, queue         |
| 4   | Playback and sync   | Player, `gloss-media://`, highlight loop                        |
| 5   | Focus view          | The Focus tab                                                   |
| 6   | Library             | better-sqlite3, library, progress, Gutenberg browsing           |
| 7   | Margin assistant    | AI notes in the margin, safeStorage key, streaming              |
