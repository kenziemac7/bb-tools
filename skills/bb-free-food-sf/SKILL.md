---
name: bb-free-food-sf
description: Find San Francisco events likely to have free food or drinks using Browserbase Stagehand with xAI. Use when the user wants a ranked event shortlist from Luma SF and Eventbrite.
metadata:
  openclaw:
    requires:
      bins: [pnpm]
      env: [BROWSERBASE_API_KEY, XAI_API_KEY]
---

# BB Free Food SF

Run the dedicated wrapper:

```bash
./scripts/run.sh
```

The command prints a ranked list to stdout and does not mutate OpenClaw config.
