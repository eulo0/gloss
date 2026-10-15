# Spike: Kokoro word timestamps (slice 0)

**Question (decision 2):** can `kokoro-js` give usable word-level timings, or do we need a Python
sidecar?

**Answer: use `kokoro-js`, no Python sidecar.** kokoro-js's own `generate()` returns audio only,
but the same model is published as an ONNX export with a `durations` output
(`onnx-community/Kokoro-82M-v1.0-ONNX-timestamped`). Loaded through kokoro-js, it gives one
duration per phoneme token. Those durations are exactly what the decoder used to build the audio, so
word times derived from them don't drift: in all 4 test passages, 25 sentences in total, the
durations add up to the waveform length to the sample. Every source word in the test passages,
including "Mr.", "£3.50", "p.m." and "1813", was mapped back to its source ID.

Date: 2026-10-15. Machine: Windows 11, i7-1260P (4P + 8E cores, 16 threads), 15.7 GB RAM, Intel
Iris Xe, on AC power with the High performance plan. Node 26.8.1 (note: `.nvmrc` pins 24; the
spike wasn't run on 24).

## What was tried

1. **kokoro-js as published (1.2.1).** `KokoroTTS.generate()` calls the ONNX model and keeps only
   `waveform` (`const { waveform } = await this.model(inputs)`). `stream()` yields
   `{ text, phonemes, audio }`. **No timing data is exposed.** The stock model
   (`onnx-community/Kokoro-82M-v1.0-ONNX`) has outputs `[waveform]` only.
2. **Timestamped ONNX export.** `onnx-community/Kokoro-82M-v1.0-ONNX-timestamped` has the same
   inputs (`input_ids`, `style`, `speed`) and outputs `[waveform, durations]`. kokoro-js loads it
   unchanged (`StyleTextToSpeech2Model` + tokenizer → `new KokoroTTS(model, tokenizer)`). We call
   `tts.model(...)` ourselves to keep `durations`.
3. **Python `kokoro`: checked by reading the source, not run** (no Python tooling was installed).
   `KPipeline.join_timestamps` in `kokoro/pipeline.py` sets `start_ts`/`end_ts` on each misaki
   token from `pred_dur`, using the same 25 ms frames. This only happens on the English path
   (`lang_code in 'ab'`). So your recollection is right, and it's the same model signal that
   kokoro-js can now reach. The sidecar isn't needed, so step 5 of the brief (measuring it) was
   skipped.

## How word times are derived

```
source text
  → tokenizeSource: whitespace split, each word gets an ID           (decision 5)
  → normalizeWord per source word: "Mr." → Mister, "£3.50" → 3 pounds and 50 pence
  → split into sentences (Kokoro's window is 510 tokens)
  → phonemize the sentence: espeak-ng via `phonemizer`, same punctuation split and fixes as kokoro-js
  → tokenizer: exactly 1 token per phoneme character, plus a pad at each end (asserted)
  → model → waveform + durations[float frames per token]
  → frames = max(1, round(d)); 1 frame = 600 samples = 25 ms at 24 kHz
  → label each phoneme character with its spoken word (edit-distance alignment, see below)
  → word span = first..last token of its characters; source span = union of its spoken words
```

**Why an alignment step:** espeak joins words in context, so splitting the phoneme string on
spaces doesn't give one group per word. "It is a truth… that a single man in possession of a good
fortune…" has 23 words but 20 phoneme groups ("that a" → `ðˌæɾə`, "of a" → `əvə`). Each spoken
word is also phonemized on its own as a reference (cached per word), and a Levenshtein alignment
labels each real phoneme character with a word. Stress and length marks are left out of the
alignment, and swapping a vowel for a consonant costs more than a like-for-like swap. Code:
`spikes/kokoro/lib/align.mts`, with unit tests.

**Why our own normaliser:** kokoro-js normalises the whole string with regexes, so the link to
source words is lost. Normalising each source word on its own keeps every spoken word tagged with
its source ID. `spikes/kokoro/lib/normalize.mts` covers titles, £/$ amounts, letter abbreviations,
years, times, ranges, decimals, thousands separators and `&`. It is a subset of kokoro-js's rules,
not production-complete.

## Results

fp32, `af_heart`, synthesis in a worker thread with 4 ONNX threads (`node run.mts --worker
--threads 4`):

| Passage      | Source words | Words timed | Sentences | Audio (s) |  RTF | Max drift (samples) |
| ------------ | -----------: | ----------: | --------: | --------: | ---: | ------------------: |
| plain        |           18 |          18 |         1 |      5.15 | 0.57 |                   0 |
| punctuation  |           30 |          30 |         4 |     12.00 | 0.61 |                   0 |
| awkward      |           27 |          27 |         2 |     16.68 | 0.60 |                   0 |
| long (P&P 1) |          268 |         268 |        18 |     89.68 | 0.62 |                   0 |

RTF = synthesis time ÷ audio length (below 1 is faster than real time). Drift = per sentence, the
difference between the sum of rounded durations and the waveform length. Across the long passage,
sentence offsets are exact sample counts, so drift doesn't build up: the last word ends at 89.475 s
in 89.675 s of audio, and the gap is the trailing pad.

### Normalised words map back to source IDs

From `awkward` (times in seconds):

| Source        | Spoken (fed to espeak) | Start–end   |
| ------------- | ---------------------- | ----------- |
| `Mr.`         | Mister                 | 0.35–0.60   |
| `£3.50`       | 3 pounds and 50 pence  | 1.40–3.13   |
| `p.m.`        | p-m                    | 3.65–4.30   |
| `1813.`       | 18 13                  | 5.23–6.30   |
| `Mrs.`        | Missus                 | 6.83–7.10   |
| `well-known,` | well-known             | 7.53–8.30   |
| `$1,200`      | 1200 dollars           | 10.93–12.68 |
| `3.75`        | 3 point 7 5            | 12.98–14.28 |
| `&`           | and                    | 15.75–15.83 |

A source word that becomes several spoken words gets one span covering all of them, so the
highlight stays on "£3.50" while "three pounds and fifty pence" is spoken. Quotes, brackets and
em dashes stay attached to their words (`“Is`, `Instead—`, `ever)?”`), and all of them got
times.

### Accuracy

- **Exact against the audio, by construction.** Kokoro upsamples its hidden states by these
  rounded durations, so the durations are the alignment the audio was made from, not a guess.
  Resolution is one frame, 25 ms. The median word lasts 175–300 ms; the shortest are 25–50 ms
  ("a", "at").
- **Energy check.** Pause tokens of 100 ms or more (punctuation, spaces) have a median RMS of
  0–0.28× the median word RMS (0 = digital silence) in all passages. The predicted pauses are
  where the audio is quiet. 0–3 words per passage came out very quiet; I didn't inspect them
  individually.
- **Where error can enter.** (a) The split inside merged espeak groups ("of|a" in `əvə`) relies on
  the alignment; at worst a phoneme or two lands on the neighbouring word, so roughly 25–75 ms on
  short function words. (b) Coarticulation: a phoneme's frames are where the model put it, which
  is close to, but not the same as, where a listener hears the word start.
- **Not done: listening.** I can't listen to audio. `out/preview.html` plays each WAV with the
  highlight driven by the timing JSON. Please spot-check it by ear (see "To do by hand").

### Performance

| Measure                                     | Result                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| First-run download (fp32 model + tokenizer) | 311 MB (`model.onnx` 310.5 MB); q8: 88 MB. Voices ship in the npm package (no download) |
| Cold first load (incl. download)            | 192 s on this connection                                                                |
| Warm model load                             | 0.8–1.7 s                                                                               |
| Memory (RSS)                                | ~545 MB after load; peak 1.04–1.09 GB (fp32), 0.88 GB (q8)                              |
| RTF, fp32, ONNX threads auto                | 0.39–1.20 (noisy; keeps ~8–9 cores busy)                                                |
| RTF, fp32, 4 threads                        | 0.57–0.69 (steady)                                                                      |
| RTF, fp32, 8 threads                        | 0.91–0.94                                                                               |
| RTF, q8, threads auto or 4                  | 1.15–1.74 (slower than fp32 on this CPU)                                                |
| Timestamped vs stock export, same settings  | Same speed (0.80 vs 0.78–1.02). Timings cost nothing extra                              |
| DirectML (GPU, Iris Xe)                     | Fails: `ConvTranspose` node `/encoder/F0.1/pool` "parameter is incorrect"               |
| Phonemizing (espeak, incl. per-word refs)   | 1.3 s for the 90 s long passage (~1.5% of synthesis)                                    |

**Off the main thread (decision 8): yes.** The whole pipeline (onnxruntime-node native addon,
espeak WASM, transformers.js) runs in a `worker_threads` Worker. Main-thread event-loop lag while
the worker synthesised:

| Setup                | p50    | p99     | max      |
| -------------------- | ------ | ------- | -------- |
| Idle baseline        | 15.8ms | 28.7 ms | 34.1 ms  |
| Worker, threads auto | 16.8ms | 66.6 ms | 107.1 ms |
| Worker, threads 4    | 16.0ms | 23.2 ms | 69.9 ms  |

(The ~16 ms p50 is the Windows timer tick, not lag.) When ONNX uses every core, the main thread is
starved even though no work runs on it. With 4 threads it stays at the idle baseline, and synthesis
is faster too. `utilityProcess` wasn't tested (that needs Electron); a worker thread in plain Node
was.

What RTF ≈ 0.6 means: a 30-minute chapter takes about 18 minutes to generate on this laptop. That's
fine with decision 3 (generate once, current chapter first, then ahead in the background), but
"Prepare whole book" will take hours.

### Sample timing JSON (trimmed)

`out/<passage>.timings.json` holds per-word times plus every token's phoneme, raw frames and span.
Start of `plain.timings.json`:

```json
{
  "passage": "plain",
  "model": "onnx-community/Kokoro-82M-v1.0-ONNX-timestamped",
  "dtype": "fp32",
  "voice": "af_heart",
  "audioSeconds": 5.15,
  "words": [
    { "id": 0, "text": "The", "start": 0.325, "end": 0.425 },
    { "id": 1, "text": "old", "start": 0.475, "end": 0.675 },
    { "id": 2, "text": "house", "start": 0.725, "end": 0.95 },
    { "id": 3, "text": "stood", "start": 1, "end": 1.2 },
    { "id": 4, "text": "at", "start": 1.225, "end": 1.275 },
    { "id": 5, "text": "the", "start": 1.3, "end": 1.4 },
    { "id": 6, "text": "end", "start": 1.475, "end": 1.65 },
    { "id": 7, "text": "of", "start": 1.675, "end": 1.75 },
    { "id": 8, "text": "a", "start": 1.75, "end": 1.8 },
    { "id": 9, "text": "quiet", "start": 1.85, "end": 2.175 }
  ],
  "chunk": {
    "phonemes": "ðɪ ˈoʊld hˈaʊs stˈʊd æt ðɪ ˈɛnd əvə kwˈaɪət lˈeɪn, ænd nˈoʊbɑːdi hæd lˈɪvd ðɛɹ fɔːɹ jˈɪɹz.",
    "tokens": [
      { "ph": "<pad>", "frames": 13.26, "start": 0, "end": 0.325 },
      { "ph": "ð", "frames": 2.01, "start": 0.325, "end": 0.375 },
      { "ph": "ɪ", "frames": 1.99, "start": 0.375, "end": 0.425 },
      { "ph": " ", "frames": 2.02, "start": 0.425, "end": 0.475 },
      { "ph": "ˈ", "frames": 1.92, "start": 0.475, "end": 0.525 },
      { "ph": "o", "frames": 1.18, "start": 0.525, "end": 0.55 },
      { "ph": "ʊ", "frames": 1.99, "start": 0.55, "end": 0.6 },
      { "ph": "l", "frames": 1.99, "start": 0.6, "end": 0.65 },
      { "ph": "d", "frames": 1.16, "start": 0.65, "end": 0.675 }
    ]
  }
}
```

Note "of a" (`əvə`, one espeak group) split into `of` 1.675–1.75 and `a` 1.75–1.8.

## Caveats

- **We rely on kokoro-js internals.** We use its `KokoroTTS` class, tokenizer, voice files and
  `tts.model`, but not `generate()` or its normaliser, and we copy its style-vector selection and
  phoneme fixes. kokoro-js 1.2.1 was last published in May 2025. Slice 3 could depend on
  `@huggingface/transformers` + `phonemizer` directly and vendor the voice files; either way it's
  about 100 lines.
- **The 510-token window.** The longest sentence in the long passage was 424 tokens. Gutenberg
  prose has longer sentences, so slice 3 must split at clause punctuation when a sentence goes over.
- **espeak-ng is GPL-3.0.** The `phonemizer` npm package (labelled Apache-2.0) bundles a WASM
  build of espeak-ng. kokoro-js has the same dependency, and so does Python Kokoro (via misaki's
  espeak fallback). This needs a licensing decision before we distribute; I'm not giving legal
  advice here.
- **Model distribution.** 311 MB (fp32) is either downloaded on first run (needs network once,
  plus a progress UI) or bundled into the installer. Undecided; q8 is a quarter of the size but
  slower here and might sound different (not compared by ear).
- **`npm audit`: 7 advisories (3 high) in the spike's tree.** Mostly `sharp`/libvips, pulled in by
  transformers.js for image models that TTS never uses, plus `sprintf-js` via `global-agent`. Worth
  checking whether `sharp` can be left out of the packaged app.
- **English only.** Tested with `en-us` and `af_heart`. British (`b*`) voices need `en-gb`
  phonemes, untested.
- **Normaliser coverage.** Only the spike's cases. Known gaps: "4 p.m." at the end of a sentence
  doesn't end the sentence; Roman numerals, ordinals ("12th"), and "$3 million" across two words
  aren't handled.
- **Noisy numbers.** RTF varied ±30% between runs on this laptop (thermals, hybrid cores). Read
  the ranges, not single values.
- **Not tested in Electron.** onnxruntime-node is a native module; in the packaged app it must be
  unpacked from asar (decision 15's auto-unpack-natives) and loaded in a `utilityProcess`.

## Recommendation

Use **kokoro-js with the `Kokoro-82M-v1.0-ONNX-timestamped` export**, fp32, CPU, ONNX intra-op
threads capped at 4, in the generation `utilityProcess`. Derive word times from the model's
durations as described above. Don't build a Python sidecar: it would give the same timing signal
(the same `pred_dur`), plus a Python runtime and PyTorch to package, and a second process to manage,
for no gain in accuracy.

## Proposed changes to docs/decisions.md

Not applied; for your approval.

- **Decision 2:** replace "Try `kokoro-js` first; fall back to a Python sidecar only if it can't
  provide word timestamps (decided in slice 0)" with: "`kokoro-js` with the
  `onnx-community/Kokoro-82M-v1.0-ONNX-timestamped` export, which returns per-phoneme durations
  (25 ms frames) alongside the audio; word times are derived from them. No Python sidecar
  (slice 0, `docs/spikes/kokoro-timestamps.md`)."
- **Decision 5:** add: "Normalisation (`Mr.` → Mister, `£3.50` → 3 pounds and 50 pence) is done by
  Gloss per source word, not by kokoro-js, so each spoken word keeps its source ID. Phoneme
  characters are aligned to spoken words by edit distance, because espeak merges words such as
  'of a'."
- **Decision 8:** add: "Cap onnxruntime intra-op threads (4 on the reference machine); using every
  core starves the main thread even off-thread."
- **Decision 13:** add: "Synthesis runs one sentence at a time (Kokoro's 510-token limit), splitting
  long sentences at clause punctuation; sentence offsets are exact sample counts."
- **Open question, not a decision yet:** download the model on first run vs bundle it, and the
  espeak-ng GPL question.

## Running the spike

From a clean checkout (needs network on first run to download the model, ~311 MB):

```sh
cd spikes/kokoro
npm ci                         # installs only the spike's deps; not part of the app
node run.mts --worker --threads 4   # writes out/*.wav, out/*.timings.json, out/preview.html
node bench.mts                 # speed: export, dtype, thread count, DirectML
npm run typecheck              # typechecks the spike (root typecheck doesn't include it)
```

Options for `run.mts`: `--dtype fp32|q8`, `--threads N` (0 = auto), `--voice af_heart`,
`--cache-dir DIR` (default `spikes/kokoro/.model-cache/`, gitignored). `npm ci` reports that
install scripts were skipped (npm 11). They aren't needed on Windows: onnxruntime-node ships its
Windows binaries, and the scripts only fetch Linux CUDA builds and rebuild `sharp`.

The pure helpers' tests (`spikes/kokoro/lib/*.test.mts`) run in the root `npm test`, without
Kokoro or network.
