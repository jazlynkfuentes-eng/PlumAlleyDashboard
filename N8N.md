# n8n → Portfolio Intel

Connect your LinkedIn scrape workflow to the dashboard with **one HTTP Request node**.

## 1. Run the dashboard

```powershell
.\setup.ps1    # first time only
npm start      # or: npm run dev
```

## 2. Set your secret

In `.env`:

```
INGEST_SECRET=your-long-random-secret-here
```

Use the **same value** in n8n (see step 4).

## 3. Verify the endpoint is up

Open in a browser or curl:

```
GET http://localhost:3000/api/updates/linkedin
```

You should see JSON with `ok: true` and the required field list.

## 4. n8n HTTP Request node

| Setting | Value |
|---------|-------|
| **Method** | POST |
| **URL** | `http://localhost:3000/api/updates/linkedin` (local) |
| | `https://YOUR-APP.amplifyapp.com/api/updates/linkedin` (Amplify) |
| **Authentication** | None (use header below) |
| **Header** | `Authorization` = `Bearer {{ $env.INGEST_SECRET }}` |
| **Header** | `Content-Type` = `application/json` |
| **Body** | JSON (see below) |

### Body (one post per request)

```json
{
  "company_name": "{{ $json.company_name }}",
  "post_content": "{{ $json.post_content }}",
  "post_url": "{{ $json.post_url }}",
  "published_at": "{{ $json.published_at }}",
  "raw_source": {{ JSON.stringify($json.raw_source) }}
}
```

`raw_source` must be the **full scraped post object** from Apify — not optional.

### Responses n8n will see

| Status | Meaning |
|--------|---------|
| `201` + `"status": "inserted"` | New post saved |
| `200` + `"status": "skipped"` | Same `post_url` already exists — safe to ignore |
| `400` + `"raw_source_required"` | Missing scraper payload — fix workflow |
| `404` + `"company_not_found"` | `company_name` doesn't match a seeded company |
| `401` | Wrong `INGEST_SECRET` |

## 5. Company names

`company_name` must match a company in the database (case-insensitive).  
Run `npm run db:seed` to load all 33 portfolio companies.

Examples: `Einride`, `Mammoth Biosciences`, `AiFi`

## 6. Test without n8n

```bash
npm run test:linkedin-endpoint
```
