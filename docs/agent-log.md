# Agent log

One entry per agent session, newest first. Use it to improve the next brief.

### 2026-10-17 · slice 1

**Date:** 2026-10-17

**Slice:** 1, EPUB parsing (`feat/epub-parsing`)

**What I asked:** Parse a Gutenberg EPUB into chapters → blocks → words with stable IDs, served per
chapter over typed IPC, with fixtures, an ID snapshot, a debug view and a War and Peace timing.

**What went wrong:** Gutenberg has no "EPUB3, no images" file. EPUB 3 always has images, and the
no-images files are EPUB 2, so the fixtures are Carol EPUB 3 (641 KB) and Blake EPUB 2. In
Carol's EPUB 3, one spine item holds ~26k of ~29k words, and its first TOC title is an editorial
note, so "chapter = spine item" gives coarse chapters there (flagged in the PR, kept as decided).
No-images files replace each image with `<span id="img_…">Illustration:</span>`, which the brief
didn't mention; those spans are skipped. I couldn't drive the native file dialog, so the human
does every in-app check (`npm start` and the packaged app). Prettier turned a ` ` escape in a
test into a literal invisible character.

**What I'd brief differently:** Check fixture availability on gutenberg.org before naming a
format. Look at how one real EPUB 3 is split before fixing the chapter unit. Say up front how
in-app checks are done when a native dialog is in the way (e.g. a dev-only path override, or the
human does them).

### 2026-10-15 · slice 0

**Date:** 2026-10-15

**Slice:** 0, Kokoro word-timestamp spike (`spike/kokoro-timestamps`)

**What I asked:** Find out whether kokoro-js can give word timings, else a Python sidecar; write up
a recommendation in `docs/spikes/kokoro-timestamps.md`.

**What went wrong:** kokoro-js's public API has no timings; the answer was a separate "timestamped"
ONNX export of the same model, which the brief didn't mention. espeak merges words ("of a" → one
group), so mapping needed an alignment step. Local Node is 26, not the 24 in `.nvmrc`. DirectML
crashed on the Iris Xe GPU. RTF numbers were noisy on the laptop.

**What I'd brief differently:** Say whether the model should be bundled or downloaded, and flag
licence checks (espeak-ng is GPL-3.0) as in scope. Ask for a by-ear check step the human does,
since the agent can't listen.

## Template

### YYYY-MM-DD · slice N

**Date:**

**Slice:**

**What I asked:**

**What went wrong:**

**What I'd brief differently:**
