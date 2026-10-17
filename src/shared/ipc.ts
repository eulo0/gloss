// The typed IPC contract between renderer and main (decision 11). The preload exposes exactly
// these functions as `window.gloss`; nothing else crosses the bridge.
import type { GetChapterResult, OpenBookResult } from './book';

export const IPC_CHANNELS = {
  openBook: 'gloss:open-book',
  getChapter: 'gloss:get-chapter',
} as const;

export interface GlossApi {
  /** Main shows the file dialog, then parses the chosen EPUB. The renderer never sends a path. */
  openBook(): Promise<OpenBookResult>;
  /** One chapter of a book opened in this session. Derive word IDs with `wordId`. */
  getChapter(bookId: string, index: number): Promise<GetChapterResult>;
}

declare global {
  interface Window {
    gloss: GlossApi;
  }
}
