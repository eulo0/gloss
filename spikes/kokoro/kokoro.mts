/**
 * Thin layer over kokoro-js that keeps the per-token durations kokoro-js throws away.
 *
 * kokoro-js's `generate()` runs the ONNX model and returns only `waveform`. The
 * `onnx-community/Kokoro-82M-v1.0-ONNX-timestamped` export has the same inputs and also returns
 * `durations`, so we load that model through kokoro-js and call `tts.model` ourselves.
 */
import { AutoTokenizer, env, StyleTextToSpeech2Model, Tensor } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';
import { phonemize as espeak } from 'phonemizer';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const TIMESTAMPED_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped';
export type Dtype = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';

export function setCacheDir(dir: string): void {
  env.cacheDir = dir;
}

/**
 * Loads the timestamped model into a kokoro-js `KokoroTTS`. Built by hand rather than with
 * `KokoroTTS.from_pretrained` because that doesn't pass ONNX session options (thread count).
 * `threads` 0 lets onnxruntime decide.
 */
export async function loadKokoro(dtype: Dtype, threads = 0): Promise<KokoroTTS> {
  const [model, tokenizer] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(TIMESTAMPED_MODEL, {
      dtype,
      device: 'cpu',
      session_options: threads ? { intraOpNumThreads: threads } : {},
    }),
    AutoTokenizer.from_pretrained(TIMESTAMPED_MODEL),
  ]);
  return new KokoroTTS(model, tokenizer);
}

const voiceCache = new Map<string, Float32Array>();

/** Voice style vectors ship inside the kokoro-js package, so no download is needed. */
async function loadVoice(voice: string): Promise<Float32Array> {
  let v = voiceCache.get(voice);
  if (!v) {
    const dist = fileURLToPath(import.meta.resolve('kokoro-js'));
    const buf = await readFile(new URL(`../voices/${voice}.bin`, `file:///${dist}`));
    v = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    voiceCache.set(voice, v);
  }
  return v;
}

// Port of the second half of kokoro-js's internal phonemize(): split on punctuation, run espeak on
// the text between, then apply kokoro-js's phoneme fixes. Normalisation (the first half) is done
// per word in lib/normalize.mts instead.
const PUNCT = ';:,.!?¡¿—…"«»“”(){}[]';
const PUNCT_RUN = new RegExp(`(\\s*[${PUNCT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}]+\\s*)+`, 'g');

function fixPhonemes(s: string): string {
  return s
    .replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ')
    .replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ')
    .replace(/ʲ/g, 'j')
    .replace(/r/g, 'ɹ')
    .replace(/x/g, 'k')
    .replace(/ɬ/g, 'l')
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ')
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z')
    .replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di')
    .trim();
}

export async function phonemizeText(text: string): Promise<string> {
  const parts: string[] = [];
  let last = 0;
  for (const m of text.matchAll(PUNCT_RUN)) {
    if (last < m.index) parts.push((await espeak(text.slice(last, m.index), 'en-us')).join(' '));
    parts.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push((await espeak(text.slice(last), 'en-us')).join(' '));
  return fixPhonemes(parts.join(''));
}

const refCache = new Map<string, string>();

/** Phonemes of a single word said on its own; the reference for alignment. */
export async function phonemizeWord(word: string): Promise<string> {
  let p = refCache.get(word);
  if (p === undefined) {
    p = fixPhonemes((await espeak(word, 'en-us')).join(' '));
    refCache.set(word, p);
  }
  return p;
}

export interface Synthesis {
  waveform: Float32Array;
  /** Raw float durations, one per token (pad + phonemes + pad), in 600-sample frames. */
  durations: number[];
}

export async function synthesize(
  tts: KokoroTTS,
  phonemes: string,
  voice: string,
  speed = 1,
): Promise<Synthesis> {
  const { input_ids } = tts.tokenizer(phonemes, { truncation: true });
  const n = input_ids.dims.at(-1) ?? 0;
  if (n !== phonemes.length + 2) {
    // Each phoneme character must be one token, or durations can't be mapped back to characters.
    throw new Error(`Tokenizer gave ${n} tokens for ${phonemes.length} phoneme characters`);
  }
  // Same style-vector selection as kokoro-js's generate_from_ids().
  const v = await loadVoice(voice);
  const offset = 256 * Math.min(Math.max(n - 2, 0), 509);
  const out = await tts.model({
    input_ids,
    style: new Tensor('float32', v.slice(offset, offset + 256), [1, 256]),
    speed: new Tensor('float32', [speed], [1]),
  });
  return {
    waveform: out.waveform.data as Float32Array,
    durations: Array.from(out.durations.data as Float32Array),
  };
}
