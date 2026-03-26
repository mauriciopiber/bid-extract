# CLAUDE.md

## Project Overview

Bid Extract is a multi-agent system for extracting structured data from bid tabulation PDFs. Unlike DOT-specific pipelines, this system handles **unknown formats** — each PDF may use a completely different layout, template, or even handwritten values.

The core challenge: 100+ bid tabulations from Missouri local governments, each with a different format, need to be normalized into a universal JSON schema.

## Quick Start

```bash
pnpm install
pnpm cli extract <pdf-or-directory>   # Extract bid data
pnpm cli classify <pdf>                # Classify format only
pnpm cli review                        # Generate HTML review report
pnpm test                              # Run tests
pnpm check-types                       # TypeScript checks
```

## Architecture: Multi-Agent Pipeline

```
PDF → [Page Images] → Classifier → Extractor (with registry few-shot) → Math Resolver → Validator → LLM Corrector → JSON
```

### Agents

1. **Classifier** (`src/agents/classifier.ts`) — Vision-based. Looks at page images, determines format type, bidder count, presence of line items/alternates/handwriting.

2. **Extractor** (`src/agents/extractor.ts`) — Uses classification to build format-specific prompts. Pulls few-shot examples from the registry. Sends page images to Claude vision API and extracts structured data.

3. **Math Resolver** (`src/agents/math-resolver.ts`) — **Deterministic, no LLM.** Fixes character-level misreads using math relationships between unitPrice, quantity, and extendedPrice. Trust hierarchy: quantity > extended price > unit price.

4. **Validator** (`src/agents/validator.ts`) — Cross-checks math: unit × quantity = extended, line items sum to totals, ranks are sequential.

5. **Corrector** (`src/agents/corrector.ts`) — LLM-based. Takes validation errors + original images and asks the model to re-examine specific values. Only runs for issues the math resolver couldn't fix.

### Pipeline (`src/pipeline.ts`)

The pipeline orchestrates the agents in order: extract → math resolve → validate → (if errors) LLM correct → math resolve → validate → repeat. Successful extractions are saved to the registry.

## Correction Intelligence

### Learned Patterns (encode these in prompts and agents)

1. **Lump Sum Items** — When unit is "LS" and qty is 1, unitPrice = extendedPrice. When a bidder provides a flat total for a non-LS item (e.g., "700 FT for $30,000"), there is NO unit price — only extendedPrice. NEVER back-calculate unitPrice by dividing.

2. **Column Confusion** — The model frequently confuses "Approx Qty" with "Unit Price" columns, especially on engineering-firm formats. The extractor prompt must explicitly warn about this.

3. **Character-Level Misreads** — Vision misreads individual digits (e.g., `8` as `6`, `273.48` as `273.46`). The math resolver catches these deterministically: if unitPrice × qty ≠ extendedPrice, recompute the most error-prone value (usually unitPrice).

4. **Trust Hierarchy for Math Resolution**:
   - **Quantity**: Almost always correct. Round numbers, matches engineer estimate. Verify against engineer estimate when available.
   - **Extended Price**: Likely correct. Feeds into total, larger/more readable numbers.
   - **Unit Price**: Most error-prone. Small font, many decimal digits. Recompute from extended/qty when math doesn't work.

5. **Total Cross-Check** — If line items don't sum to stated total, identify which items contribute to the gap. A $24K discrepancy on a $1.2M bid means at least one line item has a wrong extended price.

### Registry (`src/registry.ts`, `registry/` directory)

The registry stores successful extractions as few-shot examples per format type. When extracting a new PDF:
- Classifier identifies format → registry lookup
- Best example (fewest corrections, fewest warnings) is included in the extraction prompt
- After successful extraction, result is saved as a new example

This creates a learning loop: each processed PDF improves accuracy for the next one of the same format.

### Contest System (`src/contests.ts`, `contests/` directory)

Human reviewers can flag specific values as "contested" via the UI. The system re-examines them.

**Rules:**
- **ALWAYS send contests back to the LLM with the original image.** The LLM reads the document again — it does NOT guess, calculate, or infer. It looks at the actual pixels.
- **NEVER apply logic, plausibility checks, or math to override what the LLM reads from the image.** The whole point of a contest is that the extracted value is wrong. Trust the human reviewer's judgment and the LLM's re-read, not the original extraction.
- **Higher DPI (300) for contest resolution** — gives the LLM a clearer image to read from.
- The contest resolver prompt must explain this is a CONTEST — a human flagged this value as wrong and wants it re-examined carefully.

Flow:
1. Reviewer hovers a value in the UI → clicks `?` → submits reason + optional suggested value
2. Contest saved to `contests/<source-file>/<id>.json`
3. `pnpm cli resolve-contests` → sends image + contest info to LLM at 300dpi
4. LLM re-reads the specific value → result applied to extraction JSON

### Format Types

| Type | Description | Example |
|------|-------------|---------|
| `simple-table` | Clean table, few bidders, few items | Andrew Bridge |
| `multi-bidder-matrix` | Wide table, many bidders across columns | Henry Co Bridge (6 bidders) |
| `summary-only` | Just bidder names + totals, no line items | Bollinger Co |
| `engineering-firm` | Formal template with item codes, schedules | Barry Co Farm Rd |
| `multi-section` | Base bid + alternates | Boonville Sewer |
| `handwritten` | Scanned with handwritten values | Jackson Co / MegaKC |
| `submission-list` | Just supplier names + dates | Jackson Co submissions page |

### Domain Knowledge

**Read `docs/bid-glossary.md` before working on extraction.** It defines the hierarchical structure of bid tabulations and the vocabulary. The LLM receives this glossary as context.

Key hierarchy: Document → Contract(s) → Base Bid + Alternates → Section(s) → Item(s) → Sub-Items

### Output Schema

Every PDF normalizes to `BidTabulation` (`src/schemas/bid-tabulation.ts`):
- **Project** — name, ID, owner, bid date, location
- **Engineer's estimate** — total + optional line items
- **Bidders** — ranked, with name, address, totals, line items, alternates
- **Extraction metadata** — format type, confidence, warnings, timing

## Key Directories

```
src/
├── agents/          # Classifier, Extractor, Math Resolver, Validator, Corrector
├── schemas/         # Universal output schema (BidTabulation)
├── utils/           # PDF-to-image conversion, JSON parsing helpers
├── review/          # HTML report generator
├── pipeline.ts      # Pipeline orchestration with correction loop
├── registry.ts      # Few-shot example storage and retrieval
└── cli.ts           # CLI entry point
registry/            # Stored examples per format type (gitignored)
output/              # Extracted JSON results (gitignored)
ui/                  # Next.js review UI
```

## Critical Rules

- **NEVER GUESS OR INFER DATA.** Only use values that are explicitly visible in the document. No keyword-based categorization, no heuristic grouping, no back-calculating values. If the PDF shows sections like "Bridge Items" and "Roadway Items", extract those exact labels. If it doesn't show sections, don't invent them.
- **NEVER FABRICATE STRUCTURE.** If the document doesn't have categories, subtotals, or groupings, don't create them. Only show what the PDF actually contains.
- **HUMAN APPROVES ALL NEW CONCEPTS.** The LLM proposes, the human confirms. This applies to:
  - New page types — if the classifier sees something that doesn't match known types, it goes to "pending" status. A human reviews and either approves it as a new type or maps it to an existing one.
  - New layouts — when a new fingerprint is detected, the layout starts as "discovered" and needs human confirmation before the system invests in prompt evolution.
  - Format reclassifications — if the system wants to change a layout's format type, a human must approve.
  - Prompt promotions — new prompt versions must be scored AND human-approved before becoming active.

- **PAGE-BY-PAGE EXTRACTION AND REVIEW.** The system works page by page, not document-level:
  - Each page is classified independently
  - Each page is extracted independently based on its page type
  - Each page is reviewed independently (PDF page image left, extracted data right)
  - Each page is contestable independently
  - The final document result is a MERGE of page results — but the source of truth is the per-page data
  - This makes review possible (you compare one page at a time) and handles multi-contract PDFs naturally

  **Why:** A 4-page PDF dumped as one blob is impossible to verify. Page-by-page lets a human check each page against its extracted data. It also handles PDFs with different content types per page (cover + bid ranking + bid tabulation).

- **HUMAN APPROVES ALL NEW CONCEPTS.** The LLM proposes, the human confirms. This applies to:
  - New page types — if the classifier sees something that doesn't match known types, it goes to "pending" status. A human reviews and either approves it as a new type or maps it to an existing one.
  - New layouts — when a new fingerprint is detected, the layout starts as "discovered" and needs human confirmation before the system invests in prompt evolution.
  - Format reclassifications — if the system wants to change a layout's format type, a human must approve.
  - Prompt promotions — new prompt versions must be scored AND human-approved before becoming active.

  **Why:** LLMs hallucinate categories. A slightly different bid tabulation is NOT a new page type — it's the same type with variation. Without human gates, the system pollutes itself with noise categories that fragment the learning. Every new concept should be a deliberate decision, not an LLM side effect.

- **NEVER REPLACE — ALWAYS EXTEND.** When adding a new feature or refactoring:
  - Keep the old code path working until the new one is proven
  - Add the new path alongside, not instead of
  - Only remove the old path after all tests pass with the new one
  - If a schema change breaks old data, wipe extractions cleanly (`pnpm cli reset`) rather than leaving stale data that corrupts the UI

- **CLEAN SLATE ON STRUCTURAL CHANGES.** When the schema or pipeline changes structurally, wipe extraction data. Old extractions in a different format are noise — they confuse the UI, corrupt scoring, and waste review time. Keep: docs, prompts, page types, learnings. Wipe: extractions, evals, logs, layouts, documents, clients.

## Design Principles

- **Vision-first** — Classification and extraction use page images via Claude vision API. Text extraction alone can't handle the format diversity or handwritten values.
- **Classify then extract** — Don't try one-size-fits-all extraction. Determine the format first, then use format-specific prompts.
- **Math before LLM** — Always try deterministic math correction before burning an LLM call. The math resolver is instant and free.
- **Learn from success** — Every successful extraction feeds back into the registry, improving future extractions of the same format.
- **Trust hierarchy** — When values conflict, trust: quantity > extended price > unit price. Never fabricate values.
- **Never back-calculate** — If a value isn't explicitly in the document, omit it. Don't divide extended/qty to get unit price.

## Testing

- Framework: Vitest
- Tests colocated with source (`*.test.ts`)
- Use real PDF samples for integration tests (stored in `samples/`, gitignored)
- Sample PDFs: `/tmp/bid-tabs/` (99 PDFs from `~/Downloads/2025.zip`)

## Environment

- `ANTHROPIC_API_KEY` — Required for Claude vision API calls
- `INPUT_DIR` — Default input directory for PDFs
- `OUTPUT_DIR` — Default output directory for JSON results
