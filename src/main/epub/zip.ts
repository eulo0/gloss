import yauzl from 'yauzl';
import { EpubError } from './errors';

/** Largest EPUB file we open. */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;
/** Largest single entry once inflated (zip-bomb guard). */
export const MAX_ENTRY_BYTES = 50 * 1024 * 1024;

export interface Zip {
  has(path: string): boolean;
  /** Reads one entry into memory. Throws EpubError('malformed') if it is missing. */
  read(path: string): Promise<Buffer>;
  close(): void;
}

/** Opens a zip held in memory. Entries are read on demand and never written to disk. */
export async function openZip(bytes: Buffer, maxEntryBytes = MAX_ENTRY_BYTES): Promise<Zip> {
  if (bytes.length > MAX_FILE_BYTES) {
    throw new EpubError('too-large', `File is ${bytes.length} bytes`);
  }
  const zipfile = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (err, zf) => {
      if (err) reject(new EpubError('not-epub', `Not a zip file: ${err.message}`));
      else resolve(zf);
    });
  });
  const entries = await readEntries(zipfile);

  return {
    has: (path) => entries.has(path),
    read: (path) => {
      const entry = entries.get(path);
      if (!entry) return Promise.reject(new EpubError('malformed', `Missing entry: ${path}`));
      return readEntry(zipfile, entry, maxEntryBytes);
    },
    close: () => zipfile.close(),
  };
}

function readEntries(zipfile: yauzl.ZipFile): Promise<Map<string, yauzl.Entry>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, yauzl.Entry>();
    zipfile.on('entry', (entry: yauzl.Entry) => {
      if (!entry.fileName.endsWith('/')) entries.set(entry.fileName, entry);
      zipfile.readEntry();
    });
    zipfile.on('end', () => resolve(entries));
    zipfile.on('error', (err: Error) =>
      reject(new EpubError('malformed', `Bad zip directory: ${err.message}`)),
    );
    zipfile.readEntry();
  });
}

function readEntry(zipfile: yauzl.ZipFile, entry: yauzl.Entry, max: number): Promise<Buffer> {
  if (entry.uncompressedSize > max) {
    return Promise.reject(
      new EpubError('too-large', `${entry.fileName} inflates to ${entry.uncompressedSize} bytes`),
    );
  }
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (err, stream) => {
      if (err) {
        reject(new EpubError('malformed', `Cannot read ${entry.fileName}: ${err.message}`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        size += chunk.length;
        // The header's size can lie; stop inflating as soon as the real size passes the limit.
        if (size > max) {
          stream.destroy();
          reject(new EpubError('too-large', `${entry.fileName} inflates past ${max} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', (e: Error) =>
        reject(new EpubError('malformed', `Cannot read ${entry.fileName}: ${e.message}`)),
      );
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  });
}
