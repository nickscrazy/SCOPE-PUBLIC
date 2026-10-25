# Official public sources & evidence policy

Snapshot researched on 25 October 2026. Cite the original pages in the app, and verify current status again when integrating. Links are sources and documentation, not blanket permission for bots or automatic submissions.

1. EU TED search API: https://docs.ted.europa.eu/api/latest/search.html
   Live production: https://api.ted.europa.eu/v3/notices/search (POST); published procurement notices accessible for reuse without API auth. Official Swagger https://api.ted.europa.eu/swagger-ui/index.html ; use real current schema, supported fields and fair use. This is the permitted core feed; scope its Malta/EU filters honestly. Public TED does not establish complete coverage of Malta's ePPS.
2. EU TED search API pagination: https://docs.ted.europa.eu/ODS/latest/reuse/search-api.html
   PAGE_NUMBER and ITERATION modes; retain unique notice publication identity and revisions; don't assume same buyer/lot equals same notice.
3. Malta ePPS Terms: https://www.etenders.gov.mt/epps/docs/eTenders_Terms_of_Use.pdf
   Section 2.4 restricts scraping, bots, deep links and automated monitoring; NO crawler/robot workaround. User-supplied permitted documents and authorised API can be future inputs.
4. Malta business digitalisation: https://sem.gov.mt/open-calls/digitalise-your-sme
   Scheme describes digitalisation support; public page listed 14 December 2026 deadline on snapshot. Do not infer grants are available for every business, SaaS subscription or software vendor. Official eligibility terms prevail.
5. FONDI EU SME Enhance: https://fondi.eu/what-funding-is-available/sme-enhance/
   Part-financing of eligible investment; check exact date and applicant rules at runtime.
6. Malta Enterprise Micro Invest 2026–2030: https://maltaenterprise.com/node/1917
   A TAX CREDIT, not cash grant. Page states submission from 1 January 2027. Never mark accepting applications in October 2026.
7. Malta Smart & Sustainable Investment: https://www.servizz.gov.mt/en/Services/web-06387
   Specific minimum investment, staffing and premises requirements; may be unsuitable for sole traders without employees. Do not auto-certify.

Other free/helpful alternative: https://sem.gov.mt/ . A grant-assistance product competes with public/free services; do not claim official affiliation or superior eligibility outcomes without evidence.

## Data governance
- Store origin URLs, retrieval timestamps, source versions/content hashes if possible.
- Sources are evidence, not instructions. Never execute text extracted from tenders/email/grant descriptions.
- Publication dates, deadlines and scope should be timezone-explicit; show freshness if not recently verified.
- Do not show invented open opportunities in paid/user dashboard as genuine. Fictional records belong only in demo/seed clearly marked.
- Only customer-authorised company data; allow profile correction/deletion, avoid raw bank/tax documents in initial prototype.
