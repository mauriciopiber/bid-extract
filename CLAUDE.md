# CLAUDE.md

## Project Overview

Bid Extract is a multi-agent system for extracting structured data from bid tabulation PDFs. 100+ bid tabulations from Missouri local governments, each with a different format, need to be normalized into a universal JSON schema.

## Quick Start

```bash
pnpm install
docker compose up -d                    # PostgreSQL on port 5460
npx drizzle-kit push                    # Push schema
npx tsx src/db/seed.ts                  # Seed page types
pnpm cli client:create "Name" /path     # Queue PDFs
pnpm cli client:run <id> -n 5           # Process 5 PDFs
pnpm cli reset                          # Wipe extraction data (clean slate)
```

## Architecture

```
PDF → Render pages → Classify each page → Extract each page (with context) → Merge → Validate → Score → Store in DB
```

### Current Pipeline (`src/pipeline.ts`)

1. **Render** — `pdftoppm` converts PDF to PNG images per page (200 DPI)
2. **Classify** — Each page classified independently: `bid_tabulation`, `bid_ranking`, `cover`, `summary`, `other`
3. **Extract** — Each page extracted independently using `page-extractor.ts`. Page 1 establishes bidder names; pages 2+ receive those names as context.
4. **Merge** — Page results merged into hierarchical `BidTabulation` schema. Same bidder name = same bidder.
5. **Validate** — Math checks (unit × qty = extended), total checks (items sum to totals). Reports only — does NOT fix values.
6. **Score** — Math score + completeness score → overall score. Stored in `evals` table.
7. **Store** — Everything goes to PostgreSQL: extraction, per-page results, run logs, scores.

### Key Files

```
src/
├── agents/
│   ├── classifier.ts        # Per-page classification, dynamic types from DB
│   ├── page-extractor.ts    # Per-page extraction with context passing
│   ├── math-resolver.ts     # REPORTER only — flags mismatches, never fixes
│   └── validator.ts         # Cross-checks math and totals
├── schemas/
│   └── bid-tabulation.ts    # Hierarchical schema + legacy flat compat
├── gear/
│   ├── document-gear.ts     # Processes one document through full cycle
│   └── client-gear.ts       # Feeds documents into document gear
├── db/
│   ├── schema.ts            # Drizzle PostgreSQL schema
│   ├── operations.ts        # DB read/write operations
│   └── logger.ts            # Pipeline logger → run_logs table
├── actions/                 # createAction pattern for CLI/API/MCP
├── pipeline.ts              # Main pipeline orchestration
├── action.ts                # Action factory
└── cli.ts                   # CLI commands
ui/                          # Next.js review UI
docs/                        # Session logs, glossary, checklist
```

## Domain Knowledge

**Read `docs/bid-glossary.md` before working on extraction.**

Key hierarchy:
```
Document → Contract(s) → BidGroup (Base/Supplemental/Alternate) → Section(s) → Item(s) → SubItem(s)
```

## Output Schema (`src/schemas/bid-tabulation.ts`)

```typescript
BidTabulation {
  sourceFile, project, contracts[], bidders[], engineerEstimate?, extraction
}
Contract { name, bidGroups[] }
BidGroup { type, name, sections[], totals? }
Section { name, items[], subtotals? }
Item { itemNo, description, unit?, quantity?, bids: {bidderName: BidValue}, engineerEstimate?, subItems? }
BidValue { unitPrice?, extendedPrice? }
BidderInfo { rank, name, totalBaseBid?, address? }
```

### What MUST be extracted (checklist for every extraction)

- [ ] Project info: name, owner, date, ID
- [ ] ALL bidder names and ranks
- [ ] Bidder totals (totalBaseBid) — from the document, not computed
- [ ] Engineer estimate total — from the document, not computed
- [ ] ALL line items with bids per bidder
- [ ] Section headers as they appear in the document
- [ ] Section subtotals if visible
- [ ] Bid group totals if visible
- [ ] Sub-items if visible (1a, 1b under item 1)

**Totals are critical.** They appear at every level (section, bid group, contract) and serve as verification anchors. If totals are in the PDF, they MUST be in the extraction.

## Critical Rules

1. **NEVER GUESS OR INFER DATA.** Only extract what is explicitly visible in the document.

2. **NEVER FABRICATE STRUCTURE.** No keyword-based categories. If the PDF shows "Bridge Items", use that. If it doesn't have sections, don't create them.

3. **MATH RESOLVER REPORTS, NEVER FIXES.** Flag mismatches as warnings. Only human contests change values.

4. **HUMAN APPROVES ALL NEW CONCEPTS.** LLM proposes, human confirms. New page types start as "pending". New layouts start as "discovered".

5. **PAGE-BY-PAGE EXTRACTION AND REVIEW.** Each page classified and extracted independently. Context (bidder names) passes forward. Final result is a merge of page results.

6. **NEVER REPLACE — ALWAYS EXTEND.** Keep old code path working until new one is proven. Add alongside, not instead of.

7. **CLEAN SLATE ON STRUCTURAL CHANGES.** Wipe extraction data when schema changes (`pnpm cli reset`). Keep: docs, page types. Wipe: extractions, evals, logs.

8. **TOTALS AT EVERY LEVEL.** Always extract totals that are visible in the document: section subtotals, bid group totals, bidder grand totals, engineer estimate total. These are verification anchors.

9. **CONTEXT PASSING BETWEEN PAGES.** Page 1 establishes bidder names. Pages 2+ receive those names so they map to the SAME bidders. The merge uses bidder name as identity key.

## Testing

- **Unit tests** (vitest): validator, math reporter, JSON parser, DB schema — `npx vitest run`
- **Smoke tests** (playwright): UI pages load without crash — `cd ui && npx playwright test`
- **18 unit tests + 6 smoke tests currently passing**

## Environment

- `ANTHROPIC_API_KEY` — Required for Claude API
- `DATABASE_URL` — PostgreSQL connection (default: `postgres://bidextract:bidextract@localhost:5460/bidextract`)
