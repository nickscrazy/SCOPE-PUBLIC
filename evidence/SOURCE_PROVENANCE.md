# Source evidence

All network checks were performed on 25 October 2026 through the configured proxy with TLS verification enabled. No credentials or ePPS access were used.

- `ted-api.yaml`: official schema downloaded from `https://api.ted.europa.eu/api-v3.yaml`, discovered through its official Swagger configuration. Requested field names and response shape follow this document.
- `ted-recent.json`: unmodified actual response to POST `https://api.ted.europa.eu/v3/notices/search`, retrieved at **2026-10-25T20:19:52.436Z**. Query: `buyer-country = MLT AND publication-date >= 20260901 SORT BY publication-date DESC`; PAGE_NUMBER, page 1, limit 30; fields `publication-number`, `notice-title`, `title-proc`, `description-proc`, `buyer-name`, `buyer-country`, `publication-date`, `classification-cpv`, `estimated-value-proc`, `estimated-value-cur-proc`, `deadline-receipt-tender-date-lot`, `notice-type`. The regression test asserts actual identity `733817-2026`, title, buyer and EUR value. This recording is a public metadata snapshot, not a current-open assertion. Browser tests replay eight records with the same retrieval timestamp; they do not call them a fresh live sync.
- `ted-sync-result.json`: actual production-adapter run result. Live ingestion narrows to `cn-standard`, a rolling 90-day window, newest first, three pages of 30, and additionally requests zoned lot times. It imported 90 records. The exact query/time/cap status is in the JSON.
- `live-idempotency.json`: repeat live import database counts and version counts; stable notice identity produces no duplicates.
- `source-checks.json`, `source-sme-enhance.txt`, `source-digitalise.txt`: official reference checks and extracted page snapshots. Only the basic descriptions/aid types in `server/catalogue.ts` were curated. No individual applicant eligibility, current-open status, aid amounts or grant deadline is certified.
- SEM and Malta Enterprise returned 403. No bypass was attempted. Micro Invest data is explicitly attributed to the supplied brief, with null `verifiedAt`, tax-credit type and a warning; no current facts are fabricated.

Synthetic TED records in `tests/ted.test.ts` and all public-demo records are explicitly test/fictional data. They never enter the main application's catalogue. Source text is inert data, never instructions.
