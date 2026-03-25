# CLAUDE.md

## Project Overview

Bid Extract is a multi-agent system for extracting structured data from bid tabulation PDFs. Unlike DOT-specific pipelines, this system handles **unknown formats** — each PDF may use a completely different layout, template, or even handwritten values.

The core challenge: 100+ bid tabulations from Missouri local governments, each with a different format, need to be normalized into a universal JSON schema.

## Quick Start

```bash
pnpm install
pnpm cli extract <pdf-or-directory>   # Extract bid data
pnpm cli classify <pdf>                # Classify format only
pnpm test                              # Run tests
pnpm check-types                       # TypeScript checks
```

## Architecture: Multi-Agent Pipeline

```
PDF → [Page Images] → Classifier → Schema Selector → Extractor → Normalizer → Validator → JSON
```

### Agents

1. **Classifier** (`src/agents/classifier.ts`) — Vision-based. Looks at page images, determines format type, bidder count, presence of line items/alternates/handwriting.

2. **Extractor** (`src/agents/extractor.ts`) — Uses classification to build format-specific prompts. Sends page images to Claude vision API and extracts structured data.

3. **Validator** (`src/agents/validator.ts`) — Cross-checks math: unit × quantity = extended, line items sum to totals, ranks are sequential.

### Format Types

| Type | Description | Example |
|------|-------------|---------|
| `simple-table` | Clean table, few bidders, few items | Andrew Bridge |
| `multi-bidder-matrix` | Wide table, many bidders across columns | Henry Co Bridge (6 bidders) |
| `summary-only` | Just bidder names + totals, no line items | Kansas City TW B |
| `engineering-firm` | Formal template with item codes, schedules | Cassville / Allgeier Martin |
| `multi-section` | Base bid + alternates | Hartsburg Water Treatment |
| `handwritten` | Scanned with handwritten values | Jackson Co / MegaKC |
| `submission-list` | Just supplier names + dates | Jackson Co submissions page |

### Output Schema

Every PDF normalizes to `BidTabulation` (`src/schemas/bid-tabulation.ts`):
- **Project** — name, ID, owner, bid date, location
- **Engineer's estimate** — total + optional line items
- **Bidders** — ranked, with name, address, totals, line items, alternates
- **Extraction metadata** — format type, confidence, warnings, timing

## Key Directories

```
src/
├── agents/          # Classifier, Extractor, Validator
├── schemas/         # Universal output schema (BidTabulation)
├── utils/           # PDF-to-image conversion, helpers
└── cli.ts           # CLI entry point
```

## Design Principles

- **Vision-first** — Classification and extraction use page images via Claude vision API. Text extraction alone can't handle the format diversity or handwritten values.
- **Classify then extract** — Don't try one-size-fits-all extraction. Determine the format first, then use format-specific prompts.
- **Parallel processing** — PDFs are independent. Process multiple concurrently.
- **Confidence scoring** — Flag low-confidence extractions (especially handwritten) for human review.
- **Math validation** — Always cross-check: extended = unit × quantity, items sum to totals.

## Testing

- Framework: Vitest
- Tests colocated with source (`*.test.ts`)
- Use real PDF samples for integration tests (stored in `samples/`, gitignored)

## Environment

- `ANTHROPIC_API_KEY` — Required for Claude vision API calls
- `INPUT_DIR` — Default input directory for PDFs
- `OUTPUT_DIR` — Default output directory for JSON results
