# Test Matrix — Every Possible Scenario

## Dimensions

1. **Page Type**: bid_ranking, bid_tabulation, cover, summary, other
2. **Bidder Count**: 0, 1, 2, 5, 10+
3. **Line Items**: 0, 1, 5, 20, 50+
4. **Sections**: 0 (flat), 1, 2+
5. **Sub-Items**: none, some items have sub-items
6. **Engineer Estimate**: absent, total only, total + per-item
7. **Totals**: none, section subtotals, bid group total, both
8. **Bid Group**: base only, base + supplemental, base + alternates, all three
9. **Contracts**: 1, 2+
10. **Pages**: 1, 2 (continuation), 3+
11. **Continuation**: first page, continuation from previous, continues to next
12. **Handwriting**: none, some values, all values
13. **Unit Prices**: all shown, some missing (lump sum), none shown

## bid_ranking page scenarios

| ID | Bidders | Has Totals | Has Engineer Est | Has Address | Has Phone | Notes |
|----|---------|------------|------------------|-------------|-----------|-------|
| R1 | 1 | yes | no | no | no | Simplest ranking |
| R2 | 2 | yes | no | yes | no | With addresses |
| R3 | 5 | yes | yes | yes | yes | Full ranking |
| R4 | 10 | yes | yes | no | no | Many bidders |
| R5 | 5 | yes | no | no | no | With allowance columns |
| R6 | 5 | yes | no | no | no | With alternate columns |
| R7 | 2 | no totals | no | no | no | Just names, no amounts |

## bid_tabulation page scenarios

| ID | Bidders | Items | Sections | Sub-Items | Eng Est | Totals | Unit Prices | Notes |
|----|---------|-------|----------|-----------|---------|--------|-------------|-------|
| T1 | 1 | 1 | 0 | no | no | no | yes | Absolute minimum |
| T2 | 1 | 4 | 0 | no | yes | yes | yes | Simple with eng est + total |
| T3 | 1 | 4 | 0 | no | yes | yes | mixed | Some LS, some per-unit |
| T4 | 2 | 10 | 0 | no | yes | yes | yes | Two bidders, flat list |
| T5 | 2 | 10 | 2 | no | yes | yes | yes | Two sections (Bridge/Roadway) |
| T6 | 3 | 20 | 2 | yes | yes | yes | yes | Sub-items (1, 1a, 1b) |
| T7 | 5 | 22 | 2 | no | yes | yes | yes | Matrix: 5 bidders across columns |
| T8 | 1 | 30 | 0 | no | no | yes | yes | Long list, single bidder |
| T9 | 3 | 15 | 0 | no | yes | no | no | Only extended prices, no unit prices |
| T10 | 2 | 8 | 0 | no | no | no | yes | No eng est, no totals |
| T11 | 1 | 5 | 0 | no | no | no | no | Only descriptions + extended prices |
| T12 | 3 | 10 | 0 | yes | yes | yes | yes | Sub-items with their own bids |
| T13 | 2 | 20 | 3 | no | yes | both | yes | 3 sections with subtotals + grand total |
| T14 | 1 | 50 | 0 | no | no | yes | yes | Very long list |
| T15 | 10 | 15 | 0 | no | yes | yes | yes | Wide matrix, 10 bidders |

## Multi-page scenarios

| ID | Pages | Page Types | Continuation | Notes |
|----|-------|------------|--------------|-------|
| M1 | 2 | tab + tab | yes | Table continues across 2 pages |
| M2 | 3 | tab + tab + tab | yes | 3-page tabulation |
| M3 | 2 | ranking + tab | no | Ranking page then tabulation |
| M4 | 3 | cover + tab + tab | no + yes | Cover then 2-page tabulation |
| M5 | 4 | cover + tab + tab + ranking | mixed | Full document |
| M6 | 2 | tab + tab | yes | Different sections across pages |

## Bid group scenarios

| ID | Groups | Notes |
|----|--------|-------|
| G1 | base only | Most common |
| G2 | base + supplemental | Extra items after base |
| G3 | base + 1 alternate | One alternate bid |
| G4 | base + 3 alternates | Multiple alternates |
| G5 | base + supplemental + 2 alternates | Full complexity |

## Contract scenarios

| ID | Contracts | Notes |
|----|-----------|-------|
| C1 | 1 contract | Most common |
| C2 | 2 contracts | Anderson Waste style |
| C3 | 4 schedules | Moberly Airport style (Schedule A, B, C, D) |

## Combined document scenarios (integration)

| ID | Composition | Notes |
|----|-------------|-------|
| I1 | R2 | Pure ranking, no tabulation |
| I2 | T2 | Simple 1-page tabulation |
| I3 | M3 (R3 + T5) | Ranking + tabulation with sections |
| I4 | M5 (cover + T7×2 + R3) | Full doc: cover, matrix tabulation, ranking |
| I5 | C2 with G5 | Multi-contract, multi-group |
| I6 | C3 with T8×4 | 4 schedules, each a long list |
| I7 | T6 + G3 | Tabulation with sub-items + 1 alternate |

## Edge cases

| ID | Scenario | Notes |
|----|----------|-------|
| E1 | Bidder name varies across pages | "ABC Corp" on p1, "ABC Corporation" on p2 |
| E2 | Missing item numbers | Description only, no item# |
| E3 | Handwritten values | Scanned form |
| E4 | Mixed typed and handwritten | Some cells typed, some handwritten |
| E5 | Blank cells | Some bidders didn't bid on some items |
| E6 | "No Bid" text | Bidder chose not to bid |
| E7 | Negative amounts | Deductive alternates |
| E8 | Very large numbers | $50,000,000+ |
| E9 | Very small numbers | $0.01 per unit |
| E10 | Quantities with decimals | 80.9 CY, 315.5 LF |
| E11 | Item with specs paragraph | Long description spanning multiple lines |
| E12 | Section header mid-page | Section changes in the middle of a page |
| E13 | Page with only subtotal | No items, just "SECTION TOTAL: $X" |
| E14 | Duplicate item numbers | Same item# in different sections |
