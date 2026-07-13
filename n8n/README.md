# n8n LinkedIn workflow — diagnosis & fix

## STEP 1 — Diagnosis (your exported workflow)

File: `c:\Users\jazly\Downloads\Daily Company Intelligence Monitoring Dashboard.json`

| Field | Value | Verdict |
|---|---|---|
| Actor | `harvestapi~linkedin-post-search` | **WRONG** — Post **Search** (mentions / keyword / filter search), not company-page posts |
| URL | `https://api.apify.com/v2/acts/harvestapi~linkedin-post-search/run-sync-get-dataset-items` | Search API |
| Body | `{ "companies": ["https://www.linkedin.com/company/aifi-inc"], "maxPosts": 10 }` | Search-style input keyed as `companies`, not company-page `targetUrls` |

That explains mentions/tags/other people’s posts: **post-search** finds posts *about* a company, not *from* the company page.

**Security:** The export hardcodes an Apify token in `jsonQuery`. **Rotate/revoke that token in Apify immediately** and store the new one only in n8n credentials / env (`APIFY_TOKEN`), never in workflow JSON.

## STEP 2 — Correct actor

Use:

- **Actor:** `harvestapi/linkedin-company-posts` (`harvestapi~linkedin-company-posts`)
- **Input:** `{ "targetUrls": ["https://www.linkedin.com/company/einride"], "maxPosts": 10, "includeReposts": false }`
- **Docs:** https://apify.com/harvestapi/linkedin-company-posts

## STEP 3 — Import the fixed workflow

Import [`Daily-Company-Intelligence-Monitoring-Dashboard.fixed.json`](./Daily-Company-Intelligence-Monitoring-Dashboard.fixed.json) into n8n.

It includes:

1. Schedule Trigger (daily 06:00) **and** Manual Trigger  
2. Loop over companies with LinkedIn URLs (skips Apellai / Programmable Medicine)  
3. 4s throttle between Apify calls  
4. Author validation vs company `linkedin_url` (drops mismatches)  
5. Transform → `{ company_name, post_content, post_url, published_at }`  
6. POST to `{DASHBOARD_URL}/api/updates/linkedin` with 3 retries  
7. Per-company + final summary log  

### n8n env vars

```
APIFY_TOKEN=...          # or Apify credential — never in node JSON
DASHBOARD_URL=http://localhost:3000
INGEST_SECRET=...        # must match dashboard INGEST_SECRET or CRON_SECRET
```

Company seed also lives at [`../data/company-seed.json`](../data/company-seed.json).
