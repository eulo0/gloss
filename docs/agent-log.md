# Agent log

One entry per agent session, newest first. Use it to improve the next brief.

### 2026-10-17 · slice 1

**Date:** 2026-10-17

**Slice:** 1, EPUB parsing (`feat/epub-parsing`)

**What I asked:** Parse a Gutenberg EPUB into chapters → blocks → words with stable IDs, served per
chapter over typed IPC, with fixtures, an ID snapshot, a debug view and a War and Peace timing.

**What went wrong:** Gutenberg has no "EPUB3, no images" file. EPUB 3 always has images, and the
no-images files are EPUB 2, so the fixtures are Carol EPUB 3 (641 KB) and Blake EPUB 2. "Chapter = spine item" (brief decision 1) turned out wrong for real files. Gutenberg packs many
chapters into each file: Carol's EPUB 3 has ~26k of ~29k words in one spine item, and Pride and
Prejudice shows 6 "chapters" of ~20k words. The human saw this in the debug view, so chapters now
start at each top-level TOC entry's anchor (P&P: 61 chapters, Carol: the 5 staves). Ebookmaker's
"linked image" pages (an image plus a "back" link) leaked a word "back" and are now dropped.
No-images files replace each image with `<span id="img_…">Illustration:</span>`, which the brief
didn't mention; those spans are skipped. Drop caps are drawn as an image whose alt text is the
missing letter (`<img alt="M"/>R. BENNET`), so skipping images lost letters; a single-capital alt
(or placeholder text) is now kept. P&P puts illustration captions inside chapter headings and the
TOC labels ("Piling up the fire. CHAPTER XI."), so `.caption` is skipped. A first attempt titled
every chapter from its opening heading, which drops subtitles a TOC label has ("Stave One" →
"One"), and changed a test to accept that; review caught it. Now the TOC label is kept unless it is
the heading, or the heading after a whole sentence. A plain "ends with the heading" check isn't
enough: "Stave One" ends with "One". Titles over 80 characters are cut (Carol's first "chapter"
is a long note listing other Gutenberg editions). P&P (24 MB) is too big for a fixture, so a test
uses its real markup. I couldn't drive the native file dialog, so the human
does every in-app check (`npm start` and the packaged app). Prettier turned a ` ` escape in a
test into a literal invisible character. A bug from the foundation commit came up: packages had no
renderer (Forge's `outDir` resolved against `root: 'src/renderer'`), so the packaged app would have
opened blank. It's fixed here in its own `fix(build)` commit. CI's `package` job only checks that
packaging succeeds, so it never saw this.

**What I'd brief differently:** Check fixture availability on gutenberg.org before naming a
format. Look at how a few real EPUBs are split (including a long novel) before fixing the chapter unit; a
brief decision that the agent flags as doubtful in the code should be settled before the PR. Say up front how
in-app checks are done when a native dialog is in the way (e.g. a dev-only path override, or the
human does them). List the Gutenberg markup quirks to expect (image placeholders, drop caps,
captions in headings) and say which source wins for chapter titles. Changing an existing test's
expected value needs a reason in the PR. Consider a CI step that lists the packaged asar and fails if
`.vite/renderer/main_window/index.html` is missing.

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
