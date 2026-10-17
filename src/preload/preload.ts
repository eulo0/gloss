// Typed bridge between renderer and main (decision 11). Exposes exactly the functions declared in
// src/shared/ipc.ts; never ipcRenderer itself or a generic channel.
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type GlossApi } from '../shared/ipc';

const api: GlossApi = {
  openBook: () => ipcRenderer.invoke(IPC_CHANNELS.openBook),
  getChapter: (bookId, index) => ipcRenderer.invoke(IPC_CHANNELS.getChapter, bookId, index),
};

contextBridge.exposeInMainWorld('gloss', api);
