---
name: bb-ice-cream-bot
description: Find local ice cream shops for a city using Browserbase web search and page fetch. Use when the user wants a quick shortlist of independent ice cream shops with address, hours, and notes.
metadata:
  openclaw:
    requires:
      bins: [pnpm]
      env: [BROWSERBASE_API_KEY]
---

# BB Ice Cream Bot

Run the dedicated wrapper:

```bash
./scripts/run.sh "Austin, TX"
```

This prints a shortlist to stdout and skips obvious chain brands.
