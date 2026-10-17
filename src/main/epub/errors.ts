import type { BookErrorReason } from '../../shared/book';

/** Thrown inside the EPUB reader; `parseEpub` turns it into a `BookError` result. */
export class EpubError extends Error {
  constructor(
    readonly reason: Exclude<BookErrorReason, 'cancelled' | 'not-found'>,
    message: string,
  ) {
    super(message);
    this.name = 'EpubError';
  }
}
