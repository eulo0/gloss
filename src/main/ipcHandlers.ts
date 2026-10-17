import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import { performance } from 'node:perf_hooks';
import type { OpenBookResult } from '../shared/book';
import { IPC_CHANNELS } from '../shared/ipc';
import { BookStore, openBookFile } from './books';

const OPEN_OPTIONS: OpenDialogOptions = {
  title: 'Open EPUB',
  properties: ['openFile'],
  filters: [
    { name: 'EPUB books', extensions: ['epub'] },
    { name: 'All files', extensions: ['*'] },
  ],
};

/** Registers the handlers behind `src/shared/ipc.ts`. */
export function registerIpcHandlers(store = new BookStore()): void {
  // openBook takes no arguments; anything the renderer sends is ignored.
  ipcMain.handle(IPC_CHANNELS.openBook, async (event): Promise<OpenBookResult> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const choice = win
      ? await dialog.showOpenDialog(win, OPEN_OPTIONS)
      : await dialog.showOpenDialog(OPEN_OPTIONS);
    if (choice.canceled || choice.filePaths.length === 0) {
      return { ok: false, reason: 'cancelled', message: 'No file chosen' };
    }

    const start = performance.now();
    const result = await openBookFile(choice.filePaths[0]);
    const ms = Math.round(performance.now() - start);
    if (!result.ok) {
      console.warn(`[gloss] openBook failed (${result.reason}) after ${ms} ms: ${result.message}`);
      return result;
    }
    console.info(`[gloss] openBook parsed ${result.book.summary.id} in ${ms} ms`);
    store.add(result.book);
    return { ok: true, book: result.book.summary };
  });

  ipcMain.handle(IPC_CHANNELS.getChapter, (_event, bookId: unknown, index: unknown) =>
    store.getChapter(bookId, index),
  );
}
