# Brief: Slice 1, EPUB parsing

Jira: epic SCRUM-13; stories SCRUM-5, SCRUM-24, SCRUM-25, SCRUM-26, SCRUM-27.

## Goal

Open a Project Gutenberg EPUB from disk and turn it into chapters → paragraphs → words, each word
with a stable ID (`book:chapter:paragraph:word`, decision 5), delivered to the renderer through the
typed IPC API. Slices 2 (reader view), 3 (generation) and 6 (library) all build on this data
model and these IDs, so getting them right matters more than the UI.

## Context

Read first: `CLAUDE.md`, `docs/decisions.md` (5, 7, 8, 11, 16, 17), `docs/architecture.md`,
`docs/agent-log.md`, and the "How word times are derived" section of
`docs/spikes/kokoro-timestamps.md`.

- The repo is a bare Electron Forge + Vite + React skeleton. `src/preload/preload.ts` exposes
  nothing yet, `src/shared/ipc.ts` doesn't exist, and `src/renderer/App.tsx` is a placeholder.
- The spike's `tokenizeSource` (`spikes/kokoro/lib/normalize.mts`) splits on whitespace and after
  em dashes, and keeps punctuation attached (`“Is`, `ever)?”`). Slice 3 maps Kokoro's spoken words
  back to these source words, so slice 1 must split text **the same way**. Port it into
  `src/shared/`; don't import from `spikes/`, and leave the spike's files alone.
- Decision 16: yauzl + htmlparser2, **in main or a worker only**. That means the XHTML/OPF parsing
  code lives under `src/main/` (e.g. `src/main/epub/`), not `src/shared/`, which the renderer can
  import. Only types, the tokenizer and the word-ID helpers go in `src/shared/`. (SCRUM-24 says
  "`src/shared/` or main". Ignore the `src/shared/` option for the parser.)
- Use htmlparser2 with `xmlMode: true` for `container.xml` and the OPF. Don't add a separate XML
  library.
- `docs/design.md` is a placeholder: **don't invent visual design.** The renderer part of this
  slice is a throwaway debug view.

## Decisions taken in this brief

Propose them as an addition to decision 5 in your PR. Don't edit `docs/decisions.md` yourself.

1. **Chapter = spine item.** `chapter` in the ID is the 0-based index of a linear spine item (skip
   `linear="no"`). True chapter titles from the nav doc (EPUB 3) or NCX (EPUB 2) are attached as
   labels where a TOC entry points at a spine item; a spine item may have no title. Gutenberg
   splits files at arbitrary points, so "spine item" is the only unit that's both stable and easy
   to get.
2. **Book ID = first 16 hex characters of the SHA-256 of the EPUB file's bytes.** Not
   `dc:identifier`, which is a URL containing colons that would break the ID format. All the other
   ID parts are indices, so if the file changes they would point at different words anyway, and a
   content hash makes that explicit. (Note in the PR: Gutenberg regenerates its files from time to
   time, so a re-downloaded book gets a new ID. Slice 6 will have to deal with that.)
3. **Paragraph = block.** `paragraph` is the 0-based index of a non-empty block in the chapter:
   `p`, `h1`–`h6`, `blockquote`/`div`/`li` text not inside a child block, and so on. Headings count,
   because they're read aloud. Blocks with no words are dropped before numbering.
4. **Word** = the 0-based index within the block, after tokenizing. IDs are built and parsed only
   through helpers in `src/shared/` (`wordId(...)`, `parseWordId(...)`). Nothing else concatenates
   or splits ID strings.
5. **IPC is per chapter.** `openBook()` returns metadata and a chapter list; `getChapter(bookId,
index)` returns one chapter's blocks. A long novel is hundreds of thousands of words, which is too
   much for a single structured-clone payload, and slices 2 and 3 work one chapter at a time anyway.
   Keep parsed books in a `Map` in main for now (SQLite is slice 6). Words cross IPC as plain text
   plus flags. The renderer derives IDs with the shared helper; full ID strings aren't sent.
6. **`openBook()` takes no arguments.** Main shows the file dialog. The renderer never sends a file
   path.

If any of these turns out wrong once you're in the code, stop and say why rather than working
around it.

## Scope

- **Shared types** (`src/shared/book.ts` or similar): `BookSummary` (id, title, author, language,
  chapters: `{ index, title | null, wordCount }[]`), `Chapter`
  (`{ index, title, blocks: Block[] }`), `Block` (`{ kind: 'heading' | 'paragraph', level?, words }`),
  `Word` (`{ text, em?: true }`).
- **Shared tokenizer**: the port of `tokenizeSource`, with its tests.
- **Shared word-ID helpers** with tests: round-trip, rejection of malformed IDs, and a book ID
  can't contain `:`.
- **EPUB reader (SCRUM-5)**: yauzl opens the zip; `META-INF/container.xml` → OPF path; OPF →
  metadata (`dc:title`, `dc:creator`, `dc:language`), manifest, spine, TOC. Handle: an OPF in a
  subfolder (hrefs are relative to it), percent-encoded hrefs, hrefs with `#fragment`, `linear="no"`.
  Read entries into memory; never extract to disk. Refuse files over 200 MB and entries that
  inflate past 50 MB (zip-bomb guard).
- **XHTML → blocks (SCRUM-24)**, streaming through htmlparser2:
  - Tokenize each block's **whole text**, not each text node, so `<i>wo</i>rd` stays one word and
    `word<i>s</i> here` splits correctly. Set `em` on a word only if all of it is inside
    `i`/`em`/`cite`. Partial emphasis is dropped (note it in the PR).
  - `<br>` counts as whitespace (poetry lines). `&nbsp;` and other entities are decoded.
  - Skip: `script`, `style`, `head`, images, `span.pagenum` (Gutenberg's page-number markers),
    and the Gutenberg boilerplate. That's `section.pg-boilerplate` / `#pg-header` / `#pg-footer` in
    current files, and as a fallback the text between `*** START OF …` / `*** END OF …` markers in
    older files.
- **Errors** are returned as data, not thrown across IPC:
  `{ ok: false, reason: 'cancelled' | 'not-epub' | 'malformed' | 'too-large' }`, plus a message for
  logs. A non-zip, a zip without `container.xml`, or an OPF pointing at missing files must give
  one of these, never a crash.
- **IPC (SCRUM-27)**: `src/shared/ipc.ts` declares `openBook` and `getChapter`. The preload exposes
  exactly those two functions via `contextBridge`. Each `ipcMain.handle` validates its arguments
  (bookId format, integer index in range).
- **Debug view**: one "Open EPUB" button, the title/author, the chapter list with word counts, and
  the selected chapter's text as plain unstyled blocks. No styling beyond the existing
  `index.css`, no hex values, no design. Put a comment at the top: "Temporary. Replaced in slice 2."
- **Fixtures (SCRUM-26)** in `test/fixtures/epub/` (or similar) plus a `README.md` noting each
  file's source URL, Gutenberg ebook number, download date and public-domain status:
  - 2 real Gutenberg EPUB3 files, the **no-images** variant, each under ~500 KB: a prose book with
    chapters (e.g. _A Christmas Carol_, #46) and one with poetry or unusual markup. Check the ebook
    numbers on gutenberg.org. Downloading them once during development is fine; the tests must
    never fetch them.
  - Synthetic edge-case EPUBs, built in-memory in the tests (see dependencies below) rather than
    committed as binary files: OPF in a subfolder, `%20` in hrefs, `linear="no"`, missing
    `container.xml`, OPF pointing at a missing file, a plain non-EPUB zip, a non-zip, inline
    italics inside a word, `<br>` poetry, `span.pagenum`, old-style `*** START OF` markers.
- **ID stability test**: a snapshot of `BookSummary` plus the first 3 blocks of 2 chapters for each
  real fixture. Re-parsing producing the same IDs is trivial. The snapshot is what catches a future
  parser change that silently shifts IDs (and would orphan cached audio and notes).

### Dependencies (say why in your summary, per CLAUDE.md)

- `yauzl` + `@types/yauzl`: decision 16.
- `htmlparser2`: decision 16.
- `yazl` (dev): builds the synthetic EPUBs in tests; same author as yauzl. If you'd rather commit
  tiny binary fixtures instead, say why.

Nothing else without asking.

## Out of scope

- Visual design, themes, tokens, `[data-word-id]` rendering, highlighting (slices 2 and 4).
- Text normalisation (`Mr.` → Mister). That's slice 3, on top of these words.
- SQLite or any persistence. Gutendex or any network code (slice 6).
- Running the parser in a worker, **unless** the measurement below says it's needed.
- Editing `docs/decisions.md` (propose instead), or the spike's files.
- Images, footnote linking, tables beyond extracting their text.

## Steps

0. Check the preconditions: `main` contains the merged spike (`git log origin/main` shows the
   `docs: … kokoro spike` commits) and `gh auth status` works. If either fails, **stop and report**;
   don't work around it.
1. Work on the existing `feat/epub-parsing` branch. It already has two commits, one updating
   decision 2 (kokoro-js, no Python sidecar) and one adding this brief, so don't create it again or
   reset it. If `main` has moved on since, rebase onto `origin/main`.
2. Shared types, tokenizer port and word-ID helpers, with tests. Commit.
3. Fixtures and their README. Commit.
4. EPUB reader (container → OPF → spine/metadata/TOC) and its error cases, with tests. Commit.
5. XHTML → blocks/words, boilerplate stripping, with tests and the ID snapshot. Commit.
6. IPC contract, handlers, preload. Commit.
7. Debug view. Commit.
8. Measure: download _War and Peace_ (#2600) locally (**don't commit it**) and time `openBook`
   parsing in main. If it blocks the main thread for more than ~200 ms, propose moving parsing into
   a worker thread. Don't do it in this slice without asking. Record the number in the PR.

Small Conventional Commits (`feat:`, `test:`, `chore(deps):` for installs); one slice on this
branch.

## Verify

- `npm run check` passes.
- `npm run package` succeeds (the CI `package` job). **Then launch the packaged app and open a
  fixture.** Forge's Vite plugin may not include runtime `node_modules` in the package, so yauzl
  and htmlparser2 have to be bundled into the main build. A missing module only shows up at
  runtime in the packaged app, not in `npm start`.
- `npx commitlint --from origin/main --to HEAD --verbose`.
- In `npm start` (a hidden or automated Electron window is fine, as in slice 0): open each real
  fixture; chapter list and text appear; a non-EPUB file shows the error, not a crash; no console
  errors.
- **By-eye check for the human** (list it in the PR as a to-do; you can't judge it yourself):
  open 2–3 Gutenberg books of the human's choice and confirm there's no licence boilerplate, no
  page numbers inside sentences, and no words glued together or split apart.

## Done when

- Every Jira story in Scope meets its own "Done when", with the changes in this brief.
- A PR to `main` is open with: what changed, how it was verified (paste the check summary), the
  War and Peace timing, the proposed decision 5 addition (from "Decisions taken in this brief"),
  dependencies added and why, the human by-eye to-do, and the SCRUM keys it covers (SCRUM-13's
  stories, plus SCRUM-20 for the decision 2 commit).
- CI is green on the PR. Use `gh pr checks`; if it fails, `gh run view --log-failed`, fix and push
  again. If you can't check CI, say so plainly. Don't claim it passed.
- `docs/agent-log.md` has a new entry at the top (use its template), including "What I'd brief
  differently".
- This brief (`docs/briefs/01-epub-parsing.md`) is already committed on the branch. Don't edit it;
  if it was wrong, say so in the agent log and the PR.
- `docs/architecture.md`'s data flow is updated if the IPC shape (per-chapter fetch) needs saying
  there.
- Don't transition Jira tickets. List which ones you think are done in your final summary, and the
  human moves them.
