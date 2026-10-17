# EPUB fixtures

Real Project Gutenberg EPUBs used by the parser tests (`src/main/epub/*.test.ts`). Tests read them
from disk and never fetch anything. Synthetic edge cases are built in memory in the tests instead.

| File                        | Book                                                  | Ebook # | Source URL                                          | Downloaded | Format                          |
| --------------------------- | ----------------------------------------------------- | ------- | --------------------------------------------------- | ---------- | ------------------------------- |
| `pg46.epub3.images.epub`    | Charles Dickens, _A Christmas Carol in Prose_ (prose) | 46      | https://www.gutenberg.org/ebooks/46.epub3.images    | 2026-10-17 | EPUB 3.0, nav doc + NCX, images |
| `pg1934.epub.noimages.epub` | William Blake, _Songs of Innocence and of Experience_ | 1934    | https://www.gutenberg.org/ebooks/1934.epub.noimages | 2026-10-17 | EPUB 2.0, NCX, no images        |

Both are public domain in the USA (the OPF's `dc:rights` says "Public domain in the USA.") and are
redistributed here with Project Gutenberg's licence boilerplate intact, as the files were
downloaded.

Why these variants: Gutenberg serves EPUB 3 only with images and its no-images files only as
EPUB 2. Carol's EPUB 3 is 641 KB, a little over the brief's ~500 KB target, and covers the nav-doc
TOC. Blake's EPUB 3 is 36 MB of plate scans, so the no-images EPUB 2 (122 KB) is used. It covers
NCX, `<br>` poetry lines, `linear="yes"` and the no-images `Illustration:` placeholders.

Gutenberg regenerates its files from time to time. Don't re-download these: the ID snapshot tests
depend on these exact bytes (the book ID is a hash of the file).
