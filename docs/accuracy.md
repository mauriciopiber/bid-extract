# Accuracy Tracking

Track apparent vs real success rates across extraction runs.

## How we measure

- **Apparent success**: Pipeline completed without errors (may have warnings)
- **Clean first try**: No corrections needed, 0 warnings
- **Real success**: Human-verified correct (via UI review + contests)
- **Total mismatch**: Line items don't sum to stated total (>$1 difference)

## Run History

### Run 1 — 2026-03-25 (9 PDFs)

| Metric | Count | Rate |
|--------|-------|------|
| Total processed | 9 | — |
| Pipeline completed | 9 | 100% |
| Clean first try | 6 | 67% |
| Needed corrections | 3 | 33% |
| Still has warnings after corrections | 3 | 33% |
| Human-verified correct | ~6 | ~67% |
| Known wrong values found by review | 1 | — |

**Formats seen:**
- simple-table: 3
- engineering-firm: 4
- multi-section: 1
- summary-only: 1

**Registry impact:**
- Before registry: 12 warnings avg on engineering-firm
- After registry: 0 warnings on engineering-firm

**Known issues after review:**
1. Andrew Co BRO-R000: $24K total mismatch (Louis-Company LLC). One value confirmed wrong via contest ($27,156 → $2,715). Needs re-extraction.
2. Callaway Co Dam: 2 persistent warnings (may be genuine rounding in source doc)

## Accuracy by format type

| Format | PDFs | Clean rate | Notes |
|--------|------|------------|-------|
| simple-table | 3 | 67% | 1 needed corrections (Callaway, 3-page) |
| engineering-firm | 4 | 75% | Dense numbers, vision misreads on decimals |
| multi-section | 1 | 0% | Anderson Waste: JSON issues, multiple sections |
| summary-only | 1 | 100% | Easiest format — just names + totals |

## What affects accuracy

| Factor | Impact | Evidence |
|--------|--------|----------|
| Registry examples | HIGH | 12 warnings → 0 warnings on same format |
| Page count | MEDIUM | 1-page PDFs cleaner than 3-4 page PDFs |
| Number density | HIGH | Engineering-firm with lots of decimals = more misreads |
| Lump sum items | SOLVED | Prompt fix eliminated false warnings |
| DPI | UNKNOWN | Using 200dpi for extraction, 300dpi for contests. Haven't tested 300dpi for initial extraction yet |
