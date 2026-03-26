# Docs

## Structure

```
docs/
├── README.md          # This file
├── accuracy.md        # Accuracy tracking (apparent vs real)
└── sessions/          # One file per session, chronological
    ├── 2026-03-25-session-1.md
    └── ...
```

## Rules

- One file per session in `sessions/`
- Name format: `YYYY-MM-DD-session-N.md`
- Each session documents: what we built, results, learnings, limits, next steps
- Never modify past session files — they're history
- `accuracy.md` is cumulative — update it each session
