---
name: bb-craigslist-hunter
description: Search Craigslist SF rentals with Browserbase and optionally email a digest via Resend. Use when the user wants filtered apartment listings by ZIP, radius, beds, price, parking, or recipient.
metadata:
  openclaw:
    requires:
      bins: [pnpm]
      env: [BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID]
---

# BB Craigslist Hunter

Run the dedicated wrapper:

```bash
./scripts/run.sh --zipcode 94110 --radius 2 --min-beds 1 --max-price 4500 --parking
```

Optional email delivery needs `RESEND_API_KEY` and either `RECIPIENT_EMAIL` or `--recipient`.
