# Session 5 Addendum — Test-First Strategy

## The Approach: Tests Before LLM

Build and test EVERYTHING with mock data first. The LLM is the last piece.

```
1. Define schema/types for each page type
2. Build UI components that render each type
3. Write tests with mock data — cover every edge case:
   - bid_ranking with 1 bidder
   - bid_ranking with 10 bidders
   - bid_tabulation with 1 section, 1 item, 1 bidder
   - bid_tabulation with 3 sections, 50 items, 5 bidders
   - bid_tabulation with sub-items
   - bid_tabulation with engineer estimate
   - bid_tabulation with totals at every level
   - bid_tabulation continuation (page 2 of a table)
   - cover page with all fields
   - cover page with minimal fields
   - combined view: ranking + tabulation pages merged
   - combined view: multi-contract
   - combined view: alternates
   - edge: empty sections
   - edge: missing bidder names
   - edge: 0 items
   - edge: only totals, no items
4. ALL tests pass with mock data
5. THEN plug in the LLM — it fills the same shapes
6. If the LLM output doesn't match, the tests tell you what's wrong
```

## Why This Works

- UI is decoupled from extraction — changes to one don't break the other
- Tests run in milliseconds, no API calls
- Every edge case is covered before the LLM even runs
- When the LLM produces bad output, the tests show exactly where it deviates
- New page types = new mock data + new tests + new component, then wire the LLM

## For Next Session

1. Create mock data fixtures for each page type
2. Write vitest component tests (or playwright tests with mock API)
3. Build the page components to pass all tests
4. THEN run real PDFs and compare
