/**
 * Speed benchmark: timestamped vs stock export, dtype, and ONNX intra-op thread count.
 *
 *   node bench.mts
 *
 * Each config synthesises the same sentence 3 times (after a warm-up) and reports the best
 * real-time factor (synthesis seconds / audio seconds; lower is faster).
 */
import { AutoTokenizer, env, StyleTextToSpeech2Model } from '@huggingface/transformers';
import { KokoroTTS } from 'kokoro-js';
import { fileURLToPath } from 'node:url';
import { SAMPLE_RATE } from './lib/align.mts';
import { phonemizeText, synthesize, TIMESTAMPED_MODEL, type Dtype } from './kokoro.mts';

env.cacheDir = fileURLToPath(new URL('./.model-cache/', import.meta.url));

const STOCK_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const TEXT =
  'However little known the feelings or views of such a man may be on his first entering a ' +
  'neighbourhood, this truth is so well fixed in the minds of the surrounding families.';

const configs: { model: string; dtype: Dtype; threads: number; device?: 'cpu' | 'dml' }[] = [
  { model: TIMESTAMPED_MODEL, dtype: 'fp32', threads: 0 },
  { model: STOCK_MODEL, dtype: 'fp32', threads: 0 },
  { model: TIMESTAMPED_MODEL, dtype: 'fp32', threads: 4 },
  { model: TIMESTAMPED_MODEL, dtype: 'fp32', threads: 8 },
  { model: TIMESTAMPED_MODEL, dtype: 'q8', threads: 4 },
  // DirectML (GPU) ships with onnxruntime-node on Windows.
  { model: TIMESTAMPED_MODEL, dtype: 'fp32', threads: 0, device: 'dml' },
];

const phonemes = await phonemizeText(TEXT);
for (const { model: id, dtype, threads, device = 'cpu' } of configs) {
  const [model, tokenizer] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(id, {
      dtype,
      device,
      // 0 = let onnxruntime decide (all physical cores).
      session_options: threads ? { intraOpNumThreads: threads } : {},
    }),
    AutoTokenizer.from_pretrained(TIMESTAMPED_MODEL),
  ]);
  const tts = new KokoroTTS(model, tokenizer);
  // The stock export has no durations output; time the raw model call for it instead.
  const once = async () => {
    const t = performance.now();
    let samples: number;
    if (id === TIMESTAMPED_MODEL) {
      samples = (await synthesize(tts, phonemes, 'af_heart')).waveform.length;
    } else {
      const { input_ids } = tts.tokenizer(phonemes, { truncation: true });
      samples = (await tts.generate_from_ids(input_ids, { voice: 'af_heart' })).audio.length;
    }
    return (performance.now() - t) / 1000 / (samples / SAMPLE_RATE);
  };
  const label = { model: id.split('/')[1], dtype, threads: threads || 'auto', device };
  try {
    await once();
    const rtfs = [await once(), await once(), await once()];
    console.log(JSON.stringify({ ...label, rtf: Math.min(...rtfs).toFixed(3) }));
  } catch (e) {
    console.log(JSON.stringify({ ...label, failed: (e as Error).message.split('\n')[0] }));
  }
  await model.dispose();
}
