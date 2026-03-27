# Kickoff — Read This First

## What This Project Does

Extracts structured data from bid tabulation PDFs (Missouri local governments). 99 PDFs, each a different format. Uses Claude vision API via Vercel AI SDK `generateObject` with Zod schemas.

## Current Status

**PR3 prompt is working:**
- S02 (Andrew Bridge, 4 items, 1 bidder): **100%** — verified ✓
- S04 (Eldon Storm Sewer, 29 items, 2 bidders): **98-99%** — needs human review
- S01, S05: references generated but not tested with PR3

**86 unit tests + 14 eval compare tests passing.**

## Immediate Next Steps

```bash
# 1. Verify S04 reference (human review)
npx tsx evals/scripts/review.ts --sample=S04
# → check values against PNG, fix if needed
npx tsx evals/scripts/verify.ts --sample=S04 --by=mauricio

# 2. Generate S05 reference (Barry Co — 5 bidders, matrix)
npx tsx evals/scripts/generate-reference.ts --sample=S05

# 3. Human review S05
npx tsx evals/scripts/review.ts --sample=S05

# 4. Run PR3 on all samples + regression check
npx tsx evals/scripts/run.ts --sample=S02 --extractor=E1 --prompt=PR3 --runs=2
npx tsx evals/scripts/run.ts --sample=S04 --extractor=E1 --prompt=PR3 --runs=2
npx tsx evals/scripts/run.ts --sample=S05 --extractor=E1 --prompt=PR3 --runs=2

# 5. Compare all
npx tsx evals/scripts/compare.ts --sample=S02
npx tsx evals/scripts/compare.ts --sample=S04
npx tsx evals/scripts/compare.ts --sample=S05

# 6. Math check
npx tsx evals/scripts/check-math.ts
```

## Key Files

- `src/schemas/zod.ts` — THE Zod schemas (single source of truth)
- `src/schemas/convert.ts` — flat ↔ hierarchical conversion
- `evals/scripts/run.ts` — prompts PR1/PR2/PR3 defined here
- `evals/reference/` — ground truth (verified by human)
- `evals/results/` — extraction run outputs
- `docs/sessions/` — all session learnings
- `CLAUDE.md` — all rules and action words

## Rules (read CLAUDE.md for full list)

1. Never guess data — only extract what's visible
2. Human approves all new concepts
3. Math resolver REPORTS, never fixes
4. One source of truth for types (Zod schemas)
5. One output format (flat→hierarchical immediately)
6. UI is the source of truth — if it's not in the UI, it doesn't exist
7. No reference without human review
8. Classify first, then extract
9. Unit test everything

## The Eval Loop

```
Generate reference → Human review → Verify → Run PR3 → Compare → Find failures → Fix prompt (PR4) → Re-run → Regression check → Repeat
```
