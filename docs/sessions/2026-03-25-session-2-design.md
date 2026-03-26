# Session 2 — 2026-03-25 — System Design

## The Idea: Dialectic Prompt Evolution

Each layout type goes through a cycle:

```
THESIS (current prompt v1)
  → extract → validate → errors found
ANTITHESIS (the errors, contests, what went wrong)
  → analyze patterns → propose fix
SYNTHESIS (new prompt v2)
  → extract again → validate → better? worse?
  → if better: promote, save as new thesis
  → if worse: discard, try different synthesis
  → repeat until stable
```

## Key Insight: Claude Code IS the Initial Engine

The prompt improver agent doesn't need to be an API call from day one. Right now, **we (Claude Code + human) ARE the dialectic engine**:

1. We see an error in the UI → that's a contest
2. We analyze why → that's the evolution reasoning
3. We change the prompt → that's the new version
4. We re-run and check → that's the eval

The system just needs to **capture what we're already doing** in the DB. The structure is the same whether the improver is us or an Opus API call.

**Migration path:**
- Phase 1: Claude Code sessions = prompt improver. DB tracks versions, scores, reasoning.
- Phase 2: When patterns are mature, wrap the improvement logic into an Opus API agent.
- Phase 3: Fully autonomous — contests trigger Opus, Opus proposes fix, eval scores it, auto-promote if better.

## State Machine: Per-Layout Lifecycle

```
DISCOVERED → EXTRACTING → VALIDATING → CONTESTING → EVOLVING → STABLE
     ↑                                                    |
     └────────────────────────────────────────────────────┘
                    (new error found → back to CONTESTING)
```

## Unified Action Layer

Every operation is a `createAction` — works from CLI, MCP, API, and web:

```typescript
// Core actions:
extractPdf        // Run extraction pipeline on a PDF
contestValue      // Flag a value as wrong
resolveContests   // Re-examine contested values
evolvePrompt      // Create new prompt version (manual or agent)
runEval           // Score a prompt version against test cases
getLayouts        // List layouts and their states
getStats          // Accuracy report
promotePrompt     // Accept a new prompt version as active
```

## Database Schema (Drizzle)

### layouts
- id, name, format_type, status (state machine)
- sample_count, active_prompt_id
- created_at, updated_at

### prompts
- id, layout_id, version, role (classifier|extractor|corrector)
- content (the prompt text), parent_id (previous version)
- score (latest eval score)
- created_at, created_by (human|claude-code|opus-agent)

### extractions
- id, layout_id, prompt_id, pdf_file
- result_json, bidder_count, line_item_count
- warnings, errors, processing_time_ms, cost_usd
- created_at

### evals
- id, extraction_id, prompt_id, layout_id
- math_score, completeness_score, accuracy_score, overall_score
- details_json
- created_at

### test_cases
- id, layout_id, pdf_file
- expected_json (ground truth)
- created_from (contest|manual)
- created_at

### contests
- id, extraction_id, field_path
- current_value, suggested_value, reason
- status (open|resolved|unresolvable)
- resolved_value, resolution
- created_at, resolved_at

### prompt_evolutions
- id, layout_id, from_prompt_id, to_prompt_id
- trigger (contest|auto|claude-code|human)
- errors_analyzed, changes_made, reasoning
- score_before, score_after
- accepted (boolean)
- created_at

## Eval Assertions (promptfoo-style)

Per layout, define what "correct" means:

```yaml
# For engineering-firm layouts:
assertions:
  - type: math
    rule: "unitPrice * quantity == extendedPrice (within $0.01)"
  - type: completeness
    rule: "bidder_count >= classifier.bidderCount"
  - type: completeness
    rule: "each bidder has lineItems.length > 0 when hasLineItems=true"
  - type: total_match
    rule: "sum(lineItems.extendedPrice) == totalBaseBid (within $1)"
  - type: field_accuracy
    rule: "project.name is not empty"
    rule: "project.owner is not empty"
```

## Tech Stack

- **Drizzle ORM** + SQLite (local dev) → Postgres (production)
- **Zod** for action input validation
- **createAction** pattern for unified CLI/MCP/API/web access
- **promptfoo** for eval runs
- **Claude Code** as initial prompt improver (phase 1)
- **Opus API** as automated prompt improver (phase 2-3)

## What to build (in order)

1. Drizzle schema + migrations
2. Action layer (createAction pattern)
3. Migrate current pipeline into actions
4. Seed DB with current prompts as v1, current extractions as baseline
5. promptfoo config with basic assertions
6. Run first eval, establish baseline scores
7. Contest → evolve → eval loop (manual via Claude Code)
8. UI dashboard: layout states, prompt history, scores
