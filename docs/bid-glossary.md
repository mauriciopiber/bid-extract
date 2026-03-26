# Bid Tabulation Glossary & Structure Guide

This document defines what bid tabulations are, their structure, and the vocabulary. Feed this to the LLM so it understands what it's looking at.

## What is a Bid Tabulation?

A bid tabulation is a document that records all bids received for a public construction project. It's the official record of who bid what, and it determines who wins the contract.

## Document Structure (hierarchical)

```
Document
├── Project Info (name, ID, owner, date, location)
├── Contract 1
│   ├── Base Bid
│   │   ├── Section A (e.g., "Bridge Items")
│   │   │   ├── Item 1: description, unit, qty, [bids per bidder]
│   │   │   ├── Item 1a: sub-item (breakdown of item 1)
│   │   │   ├── Item 1b: sub-item
│   │   │   └── Section Subtotal per bidder
│   │   ├── Section B (e.g., "Roadway Items")
│   │   │   ├── Items...
│   │   │   └── Section Subtotal per bidder
│   │   └── Base Bid Total per bidder
│   ├── Supplemental Bid Prices (optional)
│   │   └── Additional items not in base bid
│   ├── Bid Alternates (optional)
│   │   ├── Alternate 1: "Add fiber optic conduit"
│   │   │   ├── Items...
│   │   │   └── Alternate Total per bidder
│   │   └── Alternate 2...
│   └── Grand Total per bidder (base + alternates)
├── Contract 2 (if multi-contract document)
│   └── Same structure as Contract 1
├── Engineer's Estimate (may be a column or separate section)
└── Bid Ranking / Summary (names + totals, who won)
```

## Key Concepts

### Contract
A single scope of work being bid. Some documents have multiple contracts (e.g., "Contract 1: Water Tower, Contract 2: Site Work"). Each contract has its own set of bidders and items.

### Base Bid
The core work. Every bidder must price every item in the base bid. This is what determines the winner.

### Section / Schedule
A grouping of related items within the base bid. Common sections:
- Bridge Items
- Roadway Items
- Drainage Items
- Earthwork
- Traffic Control
- Utilities

Each section has a subtotal per bidder.

### Line Item
A single unit of work. Has:
- **Item Number**: sequential or coded (e.g., "201-00200")
- **Description**: what the work is
- **Unit**: unit of measure (LS, EA, LF, SF, CY, TON, SY, GAL, HR, etc.)
- **Quantity**: estimated amount (set by the engineer, same for all bidders)
- **Unit Price**: bidder's price per unit (unique to each bidder)
- **Extended Price**: unit price × quantity (total for this item for this bidder)

### Sub-Item
A breakdown of a parent item. Example:
- Item 1: "Furnish and Install Water Tower" — total lump sum
  - Item 1a: "Bonds and Insurance" — breakdown component
  - Item 1b: "Shop Drawings" — breakdown component
  - Item 1c: "Steel Fabrication" — breakdown component

The parent item total should equal the sum of sub-items.

### Lump Sum (LS)
Unit = "LS", Quantity = 1. The bidder provides a single total price for the entire item. Unit price = extended price.

### Supplemental Bid Prices
Additional items beyond the base bid. May or may not be included in the total. Sometimes called "additive alternates" or "unit price items."

### Bid Alternates
Optional modifications to the base bid. Each alternate is priced separately:
- "Alternate 1: Substitute precast for cast-in-place" → add $50,000
- "Alternate 2: Delete landscaping" → deduct $20,000

The owner decides which alternates to accept after bids are opened.

### Allowances
Pre-set amounts included in the bid for specific contingencies (e.g., "Allowance 1: $100,000 for unforeseen utilities"). Unlike alternates, allowances are the SAME amount for all bidders — the owner sets the value. Some documents show allowance columns separately from the base bid.

### Engineer's Estimate
The engineer's pre-bid cost estimate. Usually shown as a column alongside bidder columns. Used to evaluate if bids are reasonable.

### Bid Ranking
A summary showing bidders ranked by total bid (lowest = rank 1 = apparent winner). May be on a separate page or at the bottom of the tabulation.

## Units of Measure

| Code | Full Name | Common Use |
|------|-----------|------------|
| LS | Lump Sum | Entire scope, single price |
| EA | Each | Individual items (signs, pads, markers) |
| LF | Linear Feet | Pipe, fence, guardrail |
| SF | Square Feet | Sheet pile, forms |
| SY | Square Yards | Paving, geotextile |
| CY | Cubic Yards | Concrete, excavation, embankment |
| TON | Tons | Aggregate, asphalt, steel |
| LBS | Pounds | Reinforcing steel |
| GAL | Gallons | Paint, sealant |
| HR | Hours | Equipment, labor |
| MO | Months | Time-based items |
| AC | Acres | Seeding, clearing |

## What Makes This Hard

1. **No standard format** — every county/city/engineer uses a different template
2. **Multi-contract documents** — one PDF, multiple contracts
3. **Nested items** — parent items with sub-item breakdowns
4. **Sections with subtotals** — items grouped under headers
5. **Alternates** — optional additions/deductions after base bid
6. **Handwritten values** — some bid forms are filled by hand
7. **Dense number tables** — many bidders × many items × small fonts
8. **Multi-page tables** — same table continuing across pages
9. **Mixed page types** — cover + ranking + tabulation in one PDF
