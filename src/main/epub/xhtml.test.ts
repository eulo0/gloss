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

  it('keeps a drop-cap letter drawn as an image', () => {
    expect(
      texts(
        '<p class="nind"><span class="letra"><img alt="M" src="m.png"/></span>R. BENNET was among</p>',
      ),
    ).toEqual(['MR. BENNET was among']);
    expect(
      texts(
        '<p><span class="letra"><span id="img_images_i_035_b.png">M</span></span>R. BENNET</p>',
      ),
    ).toEqual(['MR. BENNET']);
  });

  it('does not read longer alt text or placeholders', () => {
    expect(texts('<p><img alt="A ship" src="s.jpg"/>Then</p>')).toEqual(['Then']);
    expect(texts('<p><img alt="a" src="s.jpg"/>Then</p>')).toEqual(['Then']);
    expect(texts('<p><span id="img_x.jpg">Illustration:</span>Then</p>')).toEqual(['Then']);
  });

  it('skips illustration captions, even inside headings', () => {
    expect(
      blocks(
        '<h2><a id="CHAPTER_II"/><img alt="" src="a.jpg"/><span class="caption">I hope Mr. Bingley will like it.</span><br/><br/>CHAPTER II.</h2>' +
          '<div class="figcenter"><p class="caption">Piling up the fire.</p></div>',
      ),
    ).toEqual([{ kind: 'heading', level: 2, words: [{ text: 'CHAPTER' }, { text: 'II.' }] }]);
  });

  it('drops ebookmaker linked-image pages', () => {
    expect(
      texts(
        '<div><img src="cover.jpg" alt="" class="x-ebookmaker-wrapper"/><br/><a href="a.xhtml#x" title="back">back</a></div>',
      ),
    ).toEqual([]);
  });

  it('reports the block index where requested anchors appear', () => {
    const { anchors } = parseXhtml(
      xhtml(
        '<p>zero</p><h2 id="h">one</h2><p>two <a id="inline"/>still two</p>' +
          '<div id="empty"></div><p id="unwanted">three</p>' +
          '<footer class="pg-boilerplate"><h2 id="lic">gone</h2></footer>',
      ),
      new Set(['h', 'inline', 'empty', 'lic', 'missing']),
    );
    expect(Object.fromEntries(anchors)).toEqual({ h: 1, inline: 2, empty: 3, lic: 4 });
  });
});
