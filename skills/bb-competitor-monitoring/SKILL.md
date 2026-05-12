---
name: bb-competitor-monitoring
description: Monitor competitor pricing pages with Browserbase, save screenshots, and generate a markdown comparison using xAI. Use when the user wants side-by-side pricing extraction for one or more SaaS URLs.
metadata:
  openclaw:
    requires:
      bins: [pnpm]
      env: [BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, XAI_API_KEY]
---

# BB Competitor Monitoring

Run the dedicated wrapper:

```bash
./scripts/run.sh https://stripe.com/pricing https://paddle.com/pricing
```

If no URLs are provided, it uses the built-in defaults: Asana, Linear, Notion.

Outputs are written under the repository:

- `jobs/inputs/browsertools/screenshots/`
- `jobs/inputs/browsertools/comparison.md`
