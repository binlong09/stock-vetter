# Distilling the synthesis stage into a local model

The goal: a model on the RTX 5090 that does what the cloud synthesis does —
read a brief, verify claims through the tool loop, and emit a calibrated
`MispricingAssessment` — so the ~$0.20/report cloud spend goes to zero and the
box becomes self-contained. This is a distillation project: the teacher is
whatever model holds the primary seat, the student is an open-weight model,
and the curriculum is the trajectories the radar is already paying for.

## 0. What you are actually teaching

Not "financial analysis" — that's in the base model already. You are teaching
a **procedure**:

1. Read a brief with a known structure and a market snapshot.
2. Distrust it correctly (transcribed vs computed evidence).
3. Spend 3–10 tool calls verifying the claims the verdict will rest on.
4. Refuse to mark a citation verified unless `verify_quote` said so.
5. Emit schema-exact JSON with calibrated conviction, defaulting to no-edge.

That is why the training data must be **full trajectories** (every assistant
turn, tool call, and tool result), not (brief → final answer) pairs. A model
trained on final answers learns to pattern-match verdicts without doing the
verification — confident, cheap, and wrong in exactly the way this pipeline
exists to prevent.

## 1. Data — capture is already running

The worker writes every completed synthesis (primary *and* comparison leg) to
`data/training/<YYYY-MM>.jsonl` on the box — system prompt, brief + snapshot,
the full conversation, the final assessment, verdict/conviction/iterations.
`RADAR_CAPTURE=0` disables; `RADAR_CAPTURE_DIR` moves it. One record ≈
20–60KB; a heavy earnings month is maybe 50MB. Leave it on and forget it.

**Volume targets** (trajectories, post-curation):

- ~300: enough for a first LoRA that learns the format, tool-call syntax, and
  the no-edge default. Worth doing to build the pipeline muscle.
- ~1,000–2,000: process quality becomes real — sensible tool choice, honest
  `verified` flags. This is several months of earnings seasons, or faster if
  you `--reanalyze` the backlog (each re-run costs the usual synthesis fee and
  produces two trajectories, one per model).
- 5,000+: judgment starts to transfer. Don't plan around this; get to 1,000
  and evaluate.

**Curation** (jq is enough):

```bash
# Keep clean runs: an actionable or clean no-edge verdict, sane iteration count
cat data/training/*.jsonl \
  | jq -c 'select(.iterations <= 12)' \
  > curated.jsonl

# Optional stricter cut: keep records where the two models AGREED on the
# verdict for that accession (cross-referencing the alt_verdict in Turso or
# joining the two capture lines per accession) — agreement is a cheap proxy
# for "not a coin flip".
```

Hold out a **time-split eval set** — e.g. train on everything before a cutoff
month, evaluate on the month after. Random splits leak: two filings from the
same company in train and test share most of their content.

**Which teacher?** Capture records both legs, tagged by `model`. Note that
Anthropic's commercial terms restrict using outputs to train competing models
— read them and decide how they apply to a personal-use internal tool.
DeepSeek's terms explicitly permit distillation, so the `deepseek-v4-pro`
trajectories are unambiguous training material; the side-by-side data tells
you exactly how much quality that choice costs on your own distribution.

## 2. Convert trajectories to the student's chat format

The capture is Anthropic-shaped (`tool_use` / `tool_result` content blocks).
Qwen3 (and most open models) use Hermes-style tool calling through the
tokenizer's chat template. The conversion is mechanical — the same mapping
`packages/core/src/deepseek.ts` does at runtime:

- system → system message: the synthesis prompt + the tool definitions
  (serialize the same JSON schemas the loop passes)
- assistant `text` + `tool_use` blocks → assistant turn with `tool_calls`
- `tool_result` blocks → `tool` role messages
- final submit turn → the last assistant turn (this is the key supervision)

Write it as a ~80-line Python script emitting one
`{"messages": [...], "tools": [...]}` object per line, then let the trainer
apply the chat template. **Mask loss to assistant tokens only** (every
framework below has a switch: `train_on_responses_only` in Unsloth,
`train_on_inputs: false` in axolotl).

## 3. Model and hardware fit (RTX 5090, 32GB)

| Student | Trainability on 32GB | Notes |
| --- | --- | --- |
| Qwen3-14B (dense) | Comfortable QLoRA | **Start here.** Best effort/quality trade; simple to train and serve. |
| Qwen3-30B-A3B (MoE) | Tight QLoRA (Unsloth) | Same family as the extraction model; fast inference (3B active). MoE LoRA is fussier — do it second. |
| Qwen3-8B | Easy | For pipeline-debugging iterations; expect weaker judgment. |

The real constraint is **sequence length, not parameter count**: a trajectory
is brief (~5k tokens) + tool results + turns ≈ 8–20k tokens. Train at 16k
context with gradient checkpointing (Unsloth's offloaded checkpointing makes
this fit); truncate or drop the >16k tail (log what you drop).

## 4. Training recipe (Unsloth, QLoRA)

```python
from unsloth import FastLanguageModel
from trl import SFTTrainer, SFTConfig

model, tokenizer = FastLanguageModel.from_pretrained(
    "unsloth/Qwen3-14B", max_seq_length=16384, load_in_4bit=True,
)
model = FastLanguageModel.get_peft_model(
    model, r=32, lora_alpha=32,
    target_modules=["q_proj","k_proj","v_proj","o_proj","gate_proj","up_proj","down_proj"],
    use_gradient_checkpointing="unsloth",
)
# dataset: the converted JSONL, chat template applied, assistant-only loss
trainer = SFTTrainer(
    model=model, tokenizer=tokenizer, train_dataset=ds,
    args=SFTConfig(
        per_device_train_batch_size=1, gradient_accumulation_steps=16,
        num_train_epochs=2, learning_rate=1e-4, lr_scheduler_type="cosine",
        warmup_ratio=0.03, logging_steps=5, output_dir="ft-synthesis",
        bf16=True,
    ),
)
trainer.train()
model.save_pretrained_merged("ft-synthesis-merged", tokenizer, save_method="merged_16bit")
```

A 1,000-trajectory, 16k-context epoch is hours on the 5090, not days. Two
epochs; three if eval improves. Watch for the classic overfit tell: verdict
distribution collapsing toward whatever dominates the training set (probably
no-edge).

## 5. Serving and — the good part — evaluation on live filings

Serve the merged model with an OpenAI-compatible server:

```bash
vllm serve ft-synthesis-merged --served-model-name deepseek-local-ft --port 8000
# or llama.cpp: llama-server -m ft-synthesis-q5.gguf --port 8000 --jinja
```

The name is the trick: `isDeepSeekModel()` routes any `deepseek*` model
through the OpenAI-compat adapter, and the adapter honors `DEEPSEEK_BASE_URL`.
So with **zero code changes**:

```bash
DEEPSEEK_BASE_URL=http://127.0.0.1:8000 \
DEEPSEEK_API_KEY=local \
RADAR_COMPARE_MODEL=deepseek-local-ft \
pnpm radar-worker --watch
```

…every real filing now runs Sonnet as primary and **your fine-tune as the
challenger**, with both verdicts stored in `radar_jobs` and rendered side by
side on the web. The comparison harness built for DeepSeek is a general
student-evaluation rig. (Add a `deepseek-local-ft` entry to `PRICING` at 0 —
or leave it and ignore the fake cost column.)

**Metrics, straight from Turso:**

```sql
-- Agreement rate with the primary
SELECT SUM(verdict = alt_verdict) * 1.0 / COUNT(*) FROM radar_jobs
WHERE alt_model = 'deepseek-local-ft' AND verdict IS NOT NULL;

-- Where it disagrees, what does it say? (the autopsy queue)
SELECT accession, ticker, verdict, conviction, alt_verdict, alt_conviction
FROM radar_jobs WHERE alt_model = 'deepseek-local-ft' AND verdict != alt_verdict;
```

Plus two honesty metrics from the captured trajectories: the fraction of
citations marked `verified: true` that actually had a `verify_quote` call
return VERIFIED (this must be ~100% — a student that lies about verification
is worse than no student), and the Zod-validation retry rate.

## 6. What to expect, honestly

- **SFT transfers process reliably**: format, tool discipline, the no-edge
  default, citation honesty. This alone may make the student a usable
  *primary* for the long tail of boring filings, with escalation to the cloud
  for anything it marks actionable.
- **Judgment transfers partially.** The KDK-grade call — recognizing a $58M
  warrant remeasurement as the entire reported profit — comes from the base
  model's depth as much as the tuning. A 14B student will miss some of these
  at any data volume. The A/B tells you the miss rate on your distribution;
  decide with numbers, not vibes.
- **The economics**: the fine-tune only has to beat DeepSeek-as-primary
  (~$0.02/report, no training effort) to justify itself, not Sonnet. That is
  a surprisingly high bar. The strongest version of this project is
  Sonnet-primary → student-challenger until the disagreement rate on
  *actionable* verdicts drops under your tolerance, then swap seats and keep
  the cloud as the auditor on a sample.
- **Next rung** once SFT plateaus: preference tuning (DPO/KTO) using pairs the
  harness generates for free — same filing, teacher's assessment vs student's,
  labeled by which you (or a judge pass) preferred.
