/**
 * Slice 0 spike: synthesise test passages with kokoro-js and derive word-level timings.
 *
 *   node run.mts [--dtype fp32|q8] [--threads N] [--voice af_heart] [--cache-dir DIR] [--worker]
 *
 * Writes out/<passage>.wav, out/<passage>.timings.json and out/preview.html (open it to listen with
 * the highlight). --worker runs synthesis in a worker thread and reports main-thread event-loop lag.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { SAMPLE_RATE, sourceSpans, tokenSpans, wordSpans, type Span } from './lib/align.mts';
import {
  normalizeWord,
  splitSentences,
  spokenText,
  spokenWords,
  tokenizeSource,
} from './lib/normalize.mts';
import {
  loadKokoro,
  phonemizeText,
  phonemizeWord,
  setCacheDir,
  synthesize,
  TIMESTAMPED_MODEL,
  type Dtype,
} from './kokoro.mts';
import { PASSAGES } from './passages.mts';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OUT = here('./out/');

const { values: args } = parseArgs({
  options: {
    dtype: { type: 'string', default: 'fp32' },
    voice: { type: 'string', default: 'af_heart' },
    'cache-dir': { type: 'string', default: here('./.model-cache/') },
    threads: { type: 'string', default: '0' },
    worker: { type: 'boolean', default: false },
  },
});

const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const secs = (samples: number) => round(samples / SAMPLE_RATE);

function rms(x: Float32Array, s: Span): number {
  let sum = 0;
  for (let i = s.start; i < s.end && i < x.length; i++) sum += x[i] * x[i];
  return Math.sqrt(sum / Math.max(1, s.end - s.start));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

function wav(samples: Float32Array): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(SAMPLE_RATE, 24);
  b.writeUInt32LE(SAMPLE_RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) =>
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2),
  );
  return b;
}

async function run({ dtype, threads, voice, cacheDir }: Args) {
  setCacheDir(cacheDir);
  await mkdir(OUT, { recursive: true });

  let peakRss = process.memoryUsage().rss;
  const sampler = setInterval(() => (peakRss = Math.max(peakRss, process.memoryUsage().rss)), 50);

  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  const tts = await loadKokoro(dtype, threads);
  const loadSeconds = (performance.now() - t0) / 1000;
  const rssAfterLoad = process.memoryUsage().rss;

  const results = [];
  for (const passage of PASSAGES) {
    const source = tokenizeSource(passage.text);
    const normalized = source.map(normalizeWord);
    const chunks = [];
    const audio: Float32Array[] = [];
    const spans = new Map<number, Span>();
    let offset = 0;
    let synthMs = 0;
    let phonemizeMs = 0;
    let pauseRms: number[] = [];
    let wordRms: number[] = [];

    for (const sentence of splitSentences(normalized)) {
      const spoken = spokenWords(sentence);
      if (spoken.length === 0) continue;
      const text = spokenText(sentence);

      let t = performance.now();
      const phonemes = await phonemizeText(text);
      const refs = await Promise.all(spoken.map((w) => phonemizeWord(w.text)));
      phonemizeMs += performance.now() - t;

      t = performance.now();
      const { waveform, durations } = await synthesize(tts, phonemes, voice);
      synthMs += performance.now() - t;

      const tokens = tokenSpans(durations);
      const frameSamples = tokens.at(-1)?.end ?? 0;
      const ws = wordSpans(phonemes, refs, durations);
      for (const [id, s] of sourceSpans(
        spoken.map((w) => w.sourceId),
        ws,
      )) {
        spans.set(id, { start: s.start + offset, end: s.end + offset });
      }

      // Energy check: predicted pauses (punctuation/space tokens of 100 ms or more) should be
      // quieter than predicted words if the timings line up with the audio.
      [...phonemes].forEach((ch, k) => {
        const tok = tokens[k + 1];
        if (/[\s;:,.!?—…"]/.test(ch) && tok.end - tok.start >= 0.1 * SAMPLE_RATE) {
          pauseRms.push(rms(waveform, tok));
        }
      });
      for (const s of ws) if (s) wordRms.push(rms(waveform, s));

      chunks.push({
        text,
        phonemes,
        offsetSeconds: secs(offset),
        waveformSamples: waveform.length,
        durationSamples: frameSamples,
        refs,
        tokens: ['<pad>', ...phonemes, '<pad>'].map((ph, k) => ({
          ph,
          frames: round(durations[k], 2),
          start: secs(tokens[k].start + offset),
          end: secs(tokens[k].end + offset),
        })),
      });
      audio.push(waveform);
      offset += waveform.length;
    }

    const all = new Float32Array(offset);
    let o = 0;
    for (const a of audio) {
      all.set(a, o);
      o += a.length;
    }
    await writeFile(`${OUT}${passage.name}.wav`, wav(all));

    const words = normalized.map((n, i) => {
      const s = spans.get(n.sourceId);
      return {
        id: n.sourceId,
        text: source[i].text,
        spoken: n.words,
        start: s ? secs(s.start) : null,
        end: s ? secs(s.end) : null,
      };
    });
    const audioSeconds = offset / SAMPLE_RATE;
    const summary = {
      passage: passage.name,
      model: TIMESTAMPED_MODEL,
      dtype,
      voice,
      sourceWords: words.length,
      wordsWithTiming: words.filter((w) => w.start !== null).length,
      wordsWithoutTiming: words
        .filter((w) => w.start === null && w.spoken.length > 0)
        .map((w) => w.text),
      audioSeconds: round(audioSeconds),
      synthSeconds: round(synthMs / 1000),
      phonemizeSeconds: round(phonemizeMs / 1000),
      realTimeFactor: round(synthMs / 1000 / audioSeconds),
      // Drift: the largest per-sentence gap between summed durations and waveform length.
      maxDriftSamples: Math.max(
        ...chunks.map((c) => Math.abs(c.waveformSamples - c.durationSamples)),
      ),
      pauseToWordRms: round(median(pauseRms) / median(wordRms)),
      quietWords: wordRms.filter((r) => r < 0.1 * median(wordRms)).length,
    };
    await writeFile(
      `${OUT}${passage.name}.timings.json`,
      JSON.stringify({ ...summary, words, chunks }, null, 1),
    );
    results.push({ summary, words });
    pauseRms = [];
    wordRms = [];
  }

  clearInterval(sampler);
  const cpu = process.cpuUsage(cpu0);
  const wallSeconds = (performance.now() - t0) / 1000;
  await writeFile(`${OUT}preview.html`, preview(results));
  return {
    dtype,
    threads: threads || 'auto',
    loadSeconds: round(loadSeconds, 2),
    rssAfterLoadMB: Math.round(rssAfterLoad / 2 ** 20),
    peakRssMB: Math.round(peakRss / 2 ** 20),
    // Average cores busy over load + synthesis; shows how much ONNX parallelises.
    avgCoresBusy: round((cpu.user + cpu.system) / 1e6 / wallSeconds, 1),
    passages: results.map((r) => r.summary),
  };
}

function preview(
  results: {
    summary: { passage: string };
    words: { text: string; start: number | null; end: number | null }[];
  }[],
): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const sections = results
    .map(
      ({ summary, words }) => `<section><h2>${summary.passage}</h2>
<audio controls src="${summary.passage}.wav"></audio>
<p>${words.map((w) => (w.start === null ? esc(w.text) : `<span data-start="${w.start}" data-end="${w.end}">${esc(w.text)}</span>`)).join(' ')}</p></section>`,
    )
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Kokoro timing preview</title>
<style>body{font:18px/1.7 Georgia,serif;max-width:46em;margin:2em auto;padding:0 1em}span.on{background:#ffcf66}audio{width:100%}</style>
${sections}
<script>
for (const s of document.querySelectorAll('section')) {
  const a = s.querySelector('audio'), spans = [...s.querySelectorAll('span[data-start]')];
  let cur = null;
  const tick = () => {
    const t = a.currentTime;
    let hit = null;
    for (const sp of spans) { if (+sp.dataset.start <= t) hit = sp; else break; }
    if (hit !== cur) { cur?.classList.remove('on'); hit?.classList.add('on'); cur = hit; }
    if (!a.paused) requestAnimationFrame(tick);
  };
  a.addEventListener('play', tick); a.addEventListener('seeked', tick);
}
</script>`;
}

type Args = { dtype: Dtype; threads: number; voice: string; cacheDir: string };

if (!isMainThread) {
  parentPort?.postMessage(await run(workerData as Args));
} else {
  const opts: Args = {
    dtype: args.dtype as Dtype,
    threads: Number(args.threads),
    voice: args.voice,
    cacheDir: args['cache-dir'],
  };
  if (args.worker) {
    // Decision 8: run Kokoro off the main thread and measure how responsive the main thread stays.
    const lag = monitorEventLoopDelay({ resolution: 10 });
    lag.enable();
    const worker = new Worker(new URL(import.meta.url), { workerData: opts });
    const result = await new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
    });
    lag.disable();
    console.log(JSON.stringify(result, null, 1));
    console.log(
      JSON.stringify({
        mainThreadEventLoopLagMs: {
          p50: round(lag.percentile(50) / 1e6, 1),
          p99: round(lag.percentile(99) / 1e6, 1),
          max: round(lag.max / 1e6, 1),
        },
      }),
    );
    await worker.terminate();
  } else {
    console.log(JSON.stringify(await run(opts), null, 1));
  }
}
