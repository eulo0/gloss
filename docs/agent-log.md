# Agent log

One entry per agent session, newest first. Use it to improve the next brief.

### 2026-10-15 · slice 0

**Date:** 2026-10-15

**Slice:** 0, Kokoro word-timestamp spike (`spike/kokoro-timestamps`)

**What I asked:** Find out whether kokoro-js can give word timings, else a Python sidecar; write up
a recommendation in `docs/spikes/kokoro-timestamps.md`.

**What went wrong:** kokoro-js's public API has no timings; the answer was a separate "timestamped"
ONNX export of the same model, which the brief didn't mention. espeak merges words ("of a" → one
group), so mapping needed an alignment step. Local Node is 26, not the 24 in `.nvmrc`. DirectML
crashed on the Iris Xe GPU. RTF numbers were noisy on the laptop.

**What I'd brief differently:** Say whether the model should be bundled or downloaded, and flag
licence checks (espeak-ng is GPL-3.0) as in scope. Ask for a by-ear check step the human does,
since the agent can't listen.

## Template

### YYYY-MM-DD · slice N

**Date:**

**Slice:**

**What I asked:**

**What went wrong:**

**What I'd brief differently:**
