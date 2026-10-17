// Book data model shared by main and renderer (docs/briefs/01-epub-parsing.md).
// Word IDs are not stored here: derive them with `wordId` from ./wordId.

export interface Word {
  /** Source text, punctuation attached ("“Is", "ever)?”"). */
  text: string;
  /** Present only when the whole word is inside i/em/cite. */
  em?: true;
}

export interface Block {
  kind: 'heading' | 'paragraph';
  /** 1–6, headings only. */
  level?: number;
  words: Word[];
}

export interface Chapter {
  /**
   * 0-based index. A chapter starts at each top-level TOC entry (plus an untitled one for any text
   * before the first); without a usable TOC, one per linear spine item.
   */
  index: number;
  title: string | null;
  blocks: Block[];
}

export interface ChapterSummary {
  index: number;
  title: string | null;
  wordCount: number;
}

export interface BookSummary {
  /** First 16 hex characters of the SHA-256 of the EPUB file. */
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  chapters: ChapterSummary[];
}

export type BookErrorReason = 'cancelled' | 'not-epub' | 'malformed' | 'too-large' | 'not-found';

export interface BookError {
  ok: false;
  reason: BookErrorReason;
  /** For logs, not for display. */
  message: string;
}

export type OpenBookResult = { ok: true; book: BookSummary } | BookError;

export type GetChapterResult = { ok: true; chapter: Chapter } | BookError;
