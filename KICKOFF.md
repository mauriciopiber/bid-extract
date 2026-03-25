# Kickoff Context

This project was bootstrapped from a conversation in the `dot-sync` repo. Here's the full backstory so you can hit the ground running.

## Origin

We have a zip file at `~/Downloads/2025.zip` containing **100 bid tabulation PDFs** from Missouri local governments. These are NOT state DOT lettings (which dot-sync handles) — these are local/municipal projects: bridges, sewer improvements, airports, sidewalks, water treatment, etc.

A client needs structured data extracted from all of them.

## The Challenge

Every PDF uses a **completely different format**. We examined 6+ samples and found:

| Format | Example File | What it looks like |
|--------|-------------|-------------------|
| **Simple table** | `Bid_Results_Andrew_Bridge_2350005.pdf` | 1 page, 1 bidder, 4 line items, clean table |
| **Summary-only** | `Bid_Results_Kansas_City_TW_B_Reconstruction.pdf` | Just bidder names + total bids, no line items at all |
| **Multi-bidder matrix** | `Bid_Results_Henry_Co_Bridge_BRO-R042_31_.pdf` | 6 bidders across columns, 30 line items, compliance checklist |
| **Engineering firm template** | `Bid_Results_Cassville_7th_Street_Bridge_over_Flat_Creek.pdf` | Allgeier Martin template — item codes (201-99.01), roadway + bridge schedule sections, subtotals per section |
| **Multi-section with alternates** | `Bid_Results_Hartsburg_Water_Treatment_Upgrades.pdf` | Base bid + 4 alternate sections, running cumulative totals, highlighted rows |
| **Handwritten** | `Bid_Results_Jackson_Co_Little_Blue_Trace_Bundschu_Bridge_Replacement.pdf` | Scanned form with handwritten blue ink prices, cursive total amount at bottom |
| **Submission list only** | Same Jackson Co file, page 1 | Just supplier names + submission dates, zero pricing data |
| **Scanned with stamp** | `Bid_Results_Boonville_2025_Sanitary_Sewer_Improvements.pdf` | Engineer's professional seal/stamp overlapping data |

## Architecture Decision

A single extractor can't handle this diversity. We designed a **multi-agent pipeline**:

```
PDF → [Page Images] → Classifier Agent → Extractor Agent → Validator → JSON
```

- **Classifier** determines format type at runtime (unlike dot-sync which knows format from the provider)
- **Extractor** uses format-specific prompts based on classification
- **Validator** cross-checks math (unit × qty = extended, items sum to totals)
- Everything is **vision-first** because text extraction fails on handwritten docs and complex layouts

## What's Already Built

- Universal output schema: `src/schemas/bid-tabulation.ts` (BidTabulation interface)
- Agent stubs: classifier, extractor, validator (validator has working math checks)
- CLI skeleton: `src/cli.ts`
- PDF-to-images utility stub: `src/utils/pdf-to-images.ts`

## What Needs To Be Built Next

1. **PDF → images** — wire up `pdftoppm` (poppler) to render pages as PNG buffers
2. **Classifier agent** — implement with Claude vision API. Send page 1, get back format type + metadata
3. **Extractor agent** — start with `simple-table` format, then expand. Use classification to pick the right prompt
4. **Test on real samples** — extract the zip to `/tmp/bid-tabs/`, pick the 6 diverse examples above, verify end-to-end
5. **Run on all 100** — measure accuracy, iterate on prompts

## Sample Data

```bash
# Extract samples (if not already done)
unzip -o ~/Downloads/2025.zip -d /tmp/bid-tabs/

# Good test set covering all format types:
# /tmp/bid-tabs/Bid_Results_Andrew_Bridge_2350005.pdf                                    (simple)
# /tmp/bid-tabs/Bid_Results_Kansas_City_TW_B_Reconstruction.pdf                          (summary-only)
# /tmp/bid-tabs/Bid_Results_Henry_Co_Bridge_BRO-R042_31_.pdf                             (multi-bidder matrix)
# /tmp/bid-tabs/Bid_Results_Cassville_7th_Street_Bridge_over_Flat_Creek.pdf               (engineering firm)
# /tmp/bid-tabs/Bid_Results_Hartsburg_Water_Treatment_Upgrades.pdf                        (multi-section alternates)
# /tmp/bid-tabs/Bid_Results_Jackson_Co_Little_Blue_Trace_Bundschu_Bridge_Replacement.pdf  (handwritten)
```

## Tech Stack

TypeScript, pnpm, Vitest, Claude vision API (`@anthropic-ai/sdk`), `commander` for CLI.
