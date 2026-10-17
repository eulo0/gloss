// Temporary. Replaced in slice 2.
// A throwaway debug view for the EPUB parser: no design, no styling beyond index.css.
import { useState } from 'react';
import { APP_NAME } from '../shared/appInfo';
import type { Block, BookSummary, Chapter } from '../shared/book';

function BlockView({ block }: { block: Block }) {
  const text = block.words.map((w) => w.text).join(' ');
  if (block.kind === 'heading') {
    const Heading = `h${block.level ?? 2}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    return <Heading>{text}</Heading>;
  }
  return <p>{text}</p>;
}

export function App() {
  const [book, setBook] = useState<BookSummary | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    const result = await window.gloss.openBook();
    if (!result.ok) {
      if (result.reason !== 'cancelled') setError(`Could not open the book (${result.reason}).`);
      return;
    }
    setError(null);
    setBook(result.book);
    setChapter(null);
  };

  const show = async (index: number) => {
    if (!book) return;
    const result = await window.gloss.getChapter(book.id, index);
    if (result.ok) setChapter(result.chapter);
    else setError(`Could not load chapter ${index} (${result.reason}).`);
  };

  return (
    <main>
      <h1>{APP_NAME}</h1>
      <button type="button" onClick={open}>
        Open EPUB
      </button>
      {error && <p role="alert">{error}</p>}
      {book && (
        <>
          <h2>{book.title}</h2>
          <p>{book.author ?? 'Unknown author'}</p>
          <ol start={0}>
            {book.chapters.map((c) => (
              <li key={c.index}>
                <button type="button" onClick={() => show(c.index)}>
                  {c.title ?? `(untitled spine item ${c.index})`}
                </button>{' '}
                {c.wordCount} words
              </li>
            ))}
          </ol>
        </>
      )}
      {chapter && (
        <article>
          <h2>
            Chapter {chapter.index}: {chapter.title ?? 'untitled'}
          </h2>
          {chapter.blocks.map((block, i) => (
            <BlockView key={i} block={block} />
          ))}
        </article>
      )}
    </main>
  );
}
