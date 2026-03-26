# Checklist — What We Need to Build

Everything discussed in session 1-2. Track progress here.

## Phase 1: Foundation (current)

- [x] Multi-agent pipeline (classify → extract → validate → correct)
- [x] Registry with few-shot examples per format type
- [x] Contest system (flag values, re-examine with LLM)
- [x] Math resolver (deterministic digit-error fixes)
- [x] Next.js review UI (PDF left, data right, contest buttons)
- [x] CLI commands (extract, classify, review, resolve-contests, stats)
- [x] Session-based docs (docs/sessions/)
- [x] Accuracy tracking (docs/accuracy.md, `pnpm cli stats`)
- [ ] Promptfoo eval setup (in progress — config + provider + assertions)

## Phase 2: Database + Actions

- [ ] Drizzle schema (layouts, prompts, extractions, evals, contests, evolutions, test_cases)
- [ ] SQLite for local dev
- [ ] createAction pattern (unified CLI/MCP/API/web)
- [ ] Migrate current pipeline into actions
- [ ] Seed DB with current prompts as v1
- [ ] Seed DB with current extractions as baseline

## Phase 3: Layout Codification

- [ ] Structural fingerprint for layouts (not just "engineering-firm")
  - Column count, column headers, sections, has-unit-price, has-eng-estimate, page count
  - Two PDFs with same fingerprint → same prompt track
  - Different fingerprint → different layout → different evolution
- [ ] Classifier outputs structural code, not just format name
- [ ] State machine per layout: DISCOVERED → EXTRACTING → VALIDATING → CONTESTING → EVOLVING → STABLE

## Phase 4: Dialectic Prompt Evolution

- [ ] Prompt versioning in DB (parent_id chain, score, created_by)
- [ ] Prompt improver: Phase 1 = Claude Code (us). Phase 2 = Opus API.
- [ ] Evolution tracking: what errors triggered the change, what changed, score before/after
- [ ] Auto-reject if score drops, auto-promote if score improves
- [ ] Test cases from resolved contests (ground truth)

## Phase 5: Eval Pipeline

- [ ] Promptfoo integration for automated scoring
- [ ] Assertions per layout: math, completeness, accuracy, total match
- [ ] Baseline scores for all current prompts
- [ ] Score comparison on each prompt evolution
- [ ] Cost tracking (per extraction, per eval run)

## Phase 6: Multi-Step Extraction

- [ ] Column-by-column extraction for multi-bidder-matrix
  - Step 1: Extract item descriptions + quantities (left columns)
  - Step 2: For each bidder, extract just their column
  - Step 3: Merge programmatically
- [ ] Section-by-section for multi-section formats
- [ ] Higher DPI (400) for engineering-firm
- [ ] Double extraction for critical values (totals)

## Phase 7: Production

- [ ] Process all 99 PDFs
- [ ] Accuracy report with real (human-verified) numbers
- [ ] MCP server so Claude can operate the system directly
- [ ] Web dashboard: layout states, prompt history, scores, contests

## Known Issues to Fix

- [ ] Barry Co Farm Rd: 0 line items extracted (classified as engineering-firm, should be multi-bidder-matrix)
- [ ] Andrew Co BRO-R000: $24K total mismatch (one value confirmed wrong via contest, needs re-extraction)
- [ ] Callaway Co Dam: 2 persistent warnings (may be genuine rounding)
- [ ] pnpm workspace conflict with ui/ subdirectory
- [ ] False cleans: 0 line items = 0 warnings. Need completeness check.

## Research / Ideas to Explore

- [ ] Marker (VikParuchuri/marker) for PDF text extraction as fallback
- [ ] Microsoft Table Transformer for table boundary detection
- [ ] Image preprocessing (contrast, sharpening) before vision extraction
- [ ] Page splitting for wide landscape documents
- [ ] Header carry-forward for multi-page tables
