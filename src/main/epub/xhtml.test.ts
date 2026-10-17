import { describe, expect, it } from 'vitest';
import type { Block } from '../../shared/book';
import { parseXhtml } from './xhtml';
import { xhtml } from './testing/buildEpub';

const blocks = (body: string) => parseXhtml(xhtml(body)).blocks;
const texts = (body: string) => blocks(body).map((b) => b.words.map((w) => w.text).join(' '));
const emWords = (b: Block) => b.words.filter((w) => w.em).map((w) => w.text);

describe('parseXhtml', () => {
  it('keeps a word whole across inline markup', () => {
    expect(blocks('<p><i>wo</i>rd and <b>bo</b>ld</p>')[0].words).toEqual([
      { text: 'word' },
      { text: 'and' },
      { text: 'bold' },
    ]);
  });

  it('splits words around inline markup at whitespace only', () => {
    expect(texts('<p>word<i>s</i> here</p>')).toEqual(['words here']);
  });

  it('marks em only on words wholly inside i/em/cite', () => {
    const [b] = blocks(
      '<p>“<i>Is</i> it <em>quite so</em>, <cite>Hamlet</cite> said <i>wo</i>rd <i>x</i><em>y</em></p>',
    );
    expect(b.words.map((w) => w.text)).toEqual([
      '“Is',
      'it',
      'quite',
      'so,',
      'Hamlet',
      'said',
      'word',
      'xy',
    ]);
    expect(emWords(b)).toEqual(['quite', 'Hamlet', 'xy']);
  });

  it('treats <br> as whitespace (poetry lines)', () => {
    expect(
      texts('<p class="poem">Piping down the valleys wild,<br/>Piping songs<br>of glee</p>'),
    ).toEqual(['Piping down the valleys wild, Piping songs of glee']);
  });

  it('decodes entities, with &nbsp; as a word break', () => {
    expect(texts('<p>Mr.&nbsp;Darcy &amp; Co. &#8212; &ldquo;yes&rdquo;</p>')).toEqual([
      'Mr. Darcy & Co. — “yes”',
    ]);
  });

  it('splits after em dashes like the spike tokenizer', () => {
    expect(texts('<p>Yes—no</p>')).toEqual(['Yes— no']);
  });

  it('makes headings heading blocks with their level', () => {
    expect(blocks('<h2>STAVE <i>ONE</i>.</h2><p>Marley was dead.</p>')).toEqual([
      { kind: 'heading', level: 2, words: [{ text: 'STAVE' }, { text: 'ONE.' }] },
      {
        kind: 'paragraph',
        words: [{ text: 'Marley' }, { text: 'was' }, { text: 'dead.' }],
      },
    ]);
  });

  it('splits loose text in a div around its child blocks', () => {
    expect(texts('<div>Before <p>inside</p> after <blockquote>quoted</blockquote></div>')).toEqual([
      'Before',
      'inside',
      'after',
      'quoted',
    ]);
  });

  it('drops blocks with no words', () => {
    expect(texts('<p> </p><div><br/></div><p>Kept</p><hr/><p>&nbsp;</p>')).toEqual(['Kept']);
  });

  it('skips head, script, style and images', () => {
    expect(
      texts(
        '<script>var x = "no";</script><p>A<img alt="picture" src="x.jpg"/> <svg><text>no</text></svg>B</p>',
      ),
    ).toEqual(['A B']);
  });

  it('skips page-number markers and keeps the sentence joined', () => {
    expect(
      texts(
        '<p>the end of one<span class="pagenum"><a id="Page_12">[Pg 12]</a></span> sentence</p>',
      ),
    ).toEqual(['the end of one sentence']);
    expect(texts('<p>a<span epub:type="pagebreak" title="3">3</span> b</p>')).toEqual(['a b']);
  });

  it('skips no-images placeholders for illustrations', () => {
    expect(
      texts(
        '<p>Before</p><div class="fig"><a id="x"><span id="img_images_img02.jpg">Illustration:</span></a></div>',
      ),
    ).toEqual(['Before']);
  });

  it('skips current Gutenberg boilerplate and reports it', () => {
    const result = parseXhtml(
      xhtml(
        '<header class="pg-boilerplate pgheader" id="pg-header"><h2>The Project Gutenberg eBook</h2>' +
          '<div id="pg-start-separator"><span>*** START OF THE PROJECT GUTENBERG EBOOK X ***</span></div></header>' +
          '<p>Story.</p>' +
          '<section class="pg-boilerplate" id="pg-footer"><p>License</p></section>' +
          '<div id="pg-footer"><p>More license</p></div>',
      ),
    );
    expect(result.pgMarkup).toBe(true);
    expect(result.blocks.map((b) => b.words.map((w) => w.text).join(' '))).toEqual(['Story.']);
    expect(parseXhtml(xhtml('<p>Story.</p>')).pgMarkup).toBe(false);
  });

  it('does not let a self-closing div swallow what follows', () => {
    expect(texts('<div style="margin-top:2em"/><h1>Title</h1><p>Text</p>')).toEqual([
      'Title',
      'Text',
    ]);
  });
});
