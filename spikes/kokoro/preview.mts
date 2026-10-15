/**
 * Builds out/preview.html: a throwaway player to try playback speed with word highlighting.
 *
 * Two ways to change speed, switchable live:
 * - Stretch: play the 1x audio with `playbackRate` (pitch kept). Timings are unchanged, because the
 *   highlight reads `audio.currentTime`, which is position in the file.
 * - Generated: play audio Kokoro made at that speed (only the speeds passed to run.mts).
 * Switching keeps your place by word ID, the way the app will (decision 5).
 *
 * The highlight loop mirrors decision 9: a requestAnimationFrame loop with a binary search over word
 * start times, toggling a class on [data-word-id]. No framework.
 */

export interface PreviewVariant {
  passage: string;
  speed: number;
  file: string;
  words: { id: number; text: string; start: number | null; end: number | null }[];
}

export function buildPreview(variants: PreviewVariant[]): string {
  const passages: Record<
    string,
    { words: { id: number; text: string }[]; variants: Record<string, unknown> }
  > = {};
  for (const v of variants) {
    const p = (passages[v.passage] ??= {
      words: v.words.map(({ id, text }) => ({ id, text })),
      variants: {},
    });
    p.variants[String(v.speed)] = {
      file: v.file,
      times: v.words.map((w) => (w.start === null ? null : [w.start, w.end])),
    };
  }
  // Escape "<" so passage text can't close the script tag.
  const data = JSON.stringify(passages).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Speed prototype</title>
<style>
:root {
  --bg: #f7f3ea; --surface: #fffdf8; --ink: #2b2620; --muted: #7a7064; --line: #e3dccd;
  --accent: #b5651d; --highlight: #ffd27a; --highlight-ink: #2b2620;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1b1916; --surface: #24211d; --ink: #ece4d6; --muted: #a39887; --line: #3a352e;
    --accent: #e0a15a; --highlight: #8a5a12; --highlight-ink: #fff4de;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, sans-serif; }
header { max-width: 46rem; margin: 0 auto; padding: 1.5rem 1rem 0; }
h1 { font-size: 1.1rem; margin: 0 0 .25rem; }
header p { margin: 0 0 1rem; color: var(--muted); font-size: .9rem; }
.tabs { display: flex; gap: .25rem; flex-wrap: wrap; }
.tabs button { border: 1px solid var(--line); background: var(--surface); color: var(--ink);
  border-radius: 999px; padding: .3rem .8rem; cursor: pointer; font: inherit; font-size: .9rem; }
.tabs button[aria-pressed="true"] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
main { max-width: 46rem; margin: 0 auto; padding: 1rem 1rem 14rem; }
#text { font: 1.25rem/1.8 Georgia, 'Times New Roman', serif; background: var(--surface);
  border: 1px solid var(--line); border-radius: .75rem; padding: 1.25rem 1.5rem; }
#text span[data-word-id] { cursor: pointer; border-radius: .2em; padding: 0 .05em;
  transition: background-color 60ms; }
#text span[data-word-id]:hover { text-decoration: underline dotted var(--muted); }
#text span.on { background: var(--highlight); color: var(--highlight-ink); }
.hint { color: var(--muted); font-size: .85rem; margin: .5rem 0 0; }
.bar { position: fixed; inset: auto 0 0 0; background: var(--surface); border-top: 1px solid var(--line);
  padding: .75rem 1rem 1rem; }
.bar-inner { max-width: 46rem; margin: 0 auto; display: grid; gap: .6rem; }
.row { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
#play { width: 2.75rem; height: 2.75rem; border-radius: 50%; border: 0; background: var(--accent);
  color: var(--surface); font-size: 1.1rem; cursor: pointer; flex: none; }
#seek { flex: 1; min-width: 8rem; accent-color: var(--accent); }
.time { font-variant-numeric: tabular-nums; color: var(--muted); font-size: .85rem; min-width: 6.5rem; text-align: right; }
.label { font-size: .8rem; color: var(--muted); min-width: 4.2rem; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: .5rem; overflow: hidden; }
.seg button { border: 0; background: transparent; color: var(--ink); padding: .3rem .6rem; cursor: pointer;
  font: inherit; font-size: .85rem; font-variant-numeric: tabular-nums; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button[aria-pressed="true"] { background: var(--ink); color: var(--bg); }
.seg button:disabled { color: var(--line); cursor: not-allowed; }
#rate { accent-color: var(--accent); width: 9rem; }
#rateOut { font-variant-numeric: tabular-nums; font-size: .9rem; min-width: 3rem; }
label.check { font-size: .85rem; display: inline-flex; gap: .3rem; align-items: center; }
#status { font: .8rem/1.4 ui-monospace, Consolas, monospace; color: var(--muted); }
@media (max-width: 34rem) { #text { padding: 1rem; font-size: 1.1rem; } .label { min-width: 0; } }
</style>
<header>
  <h1>Gloss · playback speed prototype</h1>
  <p>Real Kokoro audio and timings from this spike. Click any word to jump to it.</p>
  <nav class="tabs" id="tabs" aria-label="Passage"></nav>
</header>
<main>
  <div id="text" aria-live="off"></div>
  <p class="hint"><b>Stretch</b> plays the 1× audio faster or slower (any speed, instant).
  <b>Generated</b> plays audio Kokoro made at that speed (only the speeds generated).
  Switching keeps your place by word.</p>
</main>
<div class="bar">
  <div class="bar-inner">
    <div class="row">
      <button id="play" aria-label="Play">▶</button>
      <input id="seek" type="range" min="0" max="1" step="0.01" value="0" aria-label="Position">
      <span class="time" id="time">0:00 / 0:00</span>
    </div>
    <div class="row">
      <span class="label">Method</span>
      <span class="seg" id="method">
        <button data-method="stretch" aria-pressed="true">Stretch</button>
        <button data-method="generated" aria-pressed="false">Generated</button>
      </span>
      <label class="check"><input type="checkbox" id="pitch" checked> Keep pitch</label>
    </div>
    <div class="row">
      <span class="label">Speed</span>
      <span class="seg" id="presets"></span>
      <input id="rate" type="range" min="0.5" max="3" step="0.05" value="1" aria-label="Speed">
      <span id="rateOut">1.00×</span>
    </div>
    <div id="status"></div>
  </div>
</div>
<audio id="audio" preload="auto"></audio>
<script>
const DATA = ${data};
const PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5];
const $ = (id) => document.getElementById(id);
const audio = $('audio'), text = $('text');

let passage = Object.keys(DATA)[0];
let method = 'stretch';
let speed = 1;
let variant = null;   // { file, times }
let starts = [];      // sorted start times of timed words
let ids = [];         // word ID for each entry in starts
let wordEls = new Map();
let current = null;

const fmt = (t) => { t = Math.max(0, t || 0); return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'); };
const generatedSpeeds = () => Object.keys(DATA[passage].variants).map(Number).sort((a, b) => a - b);

function renderTabs() {
  $('tabs').innerHTML = '';
  for (const name of Object.keys(DATA)) {
    const b = document.createElement('button');
    b.textContent = name;
    b.setAttribute('aria-pressed', String(name === passage));
    b.onclick = () => { passage = name; load(0, false); renderTabs(); };
    $('tabs').append(b);
  }
}

function renderText() {
  text.innerHTML = '';
  wordEls = new Map();
  for (const w of DATA[passage].words) {
    const s = document.createElement('span');
    s.dataset.wordId = w.id;
    s.textContent = w.text;
    s.onclick = () => seekToWord(w.id, true);
    text.append(s, ' ');
    wordEls.set(w.id, s);
  }
}

function renderPresets() {
  const avail = generatedSpeeds();
  $('presets').innerHTML = '';
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.textContent = p + '×';
    b.setAttribute('aria-pressed', String(p === speed));
    b.disabled = method === 'generated' && !avail.includes(p);
    b.onclick = () => setSpeed(p);
    $('presets').append(b);
  }
  $('rate').disabled = method === 'generated';
  $('rateOut').textContent = speed.toFixed(2) + '×';
  $('rate').value = speed;
}

// Pick the audio file and playback rate for the current method and speed.
function pickVariant() {
  const v = DATA[passage].variants;
  if (method === 'generated' && v[String(speed)]) return { variant: v[String(speed)], rate: 1, key: String(speed) };
  return { variant: v['1'], rate: speed, key: '1' };
}

// Load the right file, then seek to where word \`wordId\` starts in it (keeps place across files).
function load(wordId, resume) {
  const { variant: v, rate } = pickVariant();
  const same = variant && v.file === variant.file;
  variant = v;
  starts = []; ids = [];
  DATA[passage].words.forEach((w, i) => { if (v.times[i]) { starts.push(v.times[i][0]); ids.push(w.id); } });
  if (!same) {
    renderText();
    current = null;
    audio.src = v.file;
  }
  audio.preservesPitch = $('pitch').checked;
  audio.playbackRate = rate;
  const go = () => {
    audio.playbackRate = rate;
    // Same file: just a rate change, keep the exact position. New file: resume at the same word.
    if (!same && wordId !== null) seekToWord(wordId, false);
    if (resume) audio.play();
    tick();
  };
  if (same || audio.readyState >= 1) go(); else audio.addEventListener('loadedmetadata', go, { once: true });
  renderPresets();
}

function seekToWord(id, play) {
  const i = DATA[passage].words.findIndex((w) => w.id === id);
  const t = variant.times[i];
  if (!t) return;
  audio.currentTime = t[0];
  if (play) audio.play();
  tick();
}

function setSpeed(s) {
  speed = s;
  const resume = !audio.paused;
  load(current, resume);
}

// Binary search: last word whose start <= t.
function wordAt(t) {
  let lo = 0, hi = starts.length - 1, hit = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= t) { hit = mid; lo = mid + 1; } else hi = mid - 1; }
  return hit < 0 ? null : ids[hit];
}

function tick() {
  const id = wordAt(audio.currentTime);
  if (id !== current) {
    if (current !== null) wordEls.get(current)?.classList.remove('on');
    if (id !== null) wordEls.get(id)?.classList.add('on');
    current = id;
  }
  const d = audio.duration || 0;
  $('seek').max = d || 1;
  if (!seeking) $('seek').value = audio.currentTime;
  $('time').textContent = fmt(audio.currentTime) + ' / ' + fmt(d);
  const { key } = pickVariant();
  const w = current === null ? '–' : DATA[passage].words.find((x) => x.id === current);
  const idx = current === null ? -1 : DATA[passage].words.findIndex((x) => x.id === current);
  const tt = idx >= 0 ? variant.times[idx] : null;
  $('status').textContent =
    'file ' + variant.file + ' (generated at ' + key + '×) · playbackRate ' + audio.playbackRate.toFixed(2) +
    ' · t=' + audio.currentTime.toFixed(3) + 's · word ' + (w === '–' ? '–' : '#' + w.id + ' "' + w.text + '" ' + tt[0].toFixed(3) + '–' + tt[1].toFixed(3) + 's');
  if (!audio.paused) requestAnimationFrame(tick);
}

let seeking = false;
$('seek').addEventListener('input', () => { seeking = true; audio.currentTime = +$('seek').value; tick(); });
$('seek').addEventListener('change', () => { seeking = false; });
$('play').onclick = () => (audio.paused ? audio.play() : audio.pause());
audio.addEventListener('play', () => { $('play').textContent = '❚❚'; $('play').setAttribute('aria-label', 'Pause'); tick(); });
audio.addEventListener('pause', () => { $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Play'); tick(); });
audio.addEventListener('seeked', tick);
$('rate').addEventListener('input', () => { speed = Math.round(+$('rate').value * 100) / 100; audio.playbackRate = speed; renderPresets(); tick(); });
$('pitch').addEventListener('change', () => { audio.preservesPitch = $('pitch').checked; });
for (const b of $('method').querySelectorAll('button')) {
  b.onclick = () => {
    method = b.dataset.method;
    for (const x of $('method').querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
    if (method === 'generated' && !generatedSpeeds().includes(speed)) speed = 1;
    load(current, !audio.paused);
  };
}
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); $('play').click(); }
});

renderTabs();
load(null, false);
</script>
</html>
`;
}
