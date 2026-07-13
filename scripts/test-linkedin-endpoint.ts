/**
 * Live test for POST /api/updates/linkedin
 * Usage: tsx scripts/test-linkedin-endpoint.ts [baseUrl]
 */
const baseUrl = process.argv[2] ?? "http://localhost:3000";
const secret = process.env.INGEST_SECRET ?? process.env.CRON_SECRET ?? "dev-cron-secret";

const postUrl = `https://www.linkedin.com/feed/update/test-${Date.now()}`;

const payload = {
  company_name: "einride",
  post_content:
    "Test ingest from scripts/test-linkedin-endpoint.ts — electric freight deployment milestone.",
  post_url: postUrl,
  published_at: new Date().toISOString(),
  raw_source: {
    id: `test-${Date.now()}`,
    type: "post",
    content:
      "Test ingest from scripts/test-linkedin-endpoint.ts — electric freight deployment milestone.",
    linkedinUrl: postUrl,
    author: { type: "company", linkedinUrl: "https://www.linkedin.com/company/einride" },
    postedAt: { date: new Date().toISOString() },
    _test: true,
  },
};

async function post(body: unknown) {
  const res = await fetch(`${baseUrl}/api/updates/linkedin`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  console.log("=== Test 1: insert new post (case-insensitive company_name) ===");
  const first = await post(payload);
  console.log(JSON.stringify(first, null, 2));

  console.log("\n=== Test 2: duplicate post_url (should skip) ===");
  const second = await post(payload);
  console.log(JSON.stringify(second, null, 2));

  console.log("\n=== Test 3: missing raw_source (should reject) ===");
  const third = await post({
    company_name: "Einride",
    post_content: "no raw",
    post_url: "https://www.linkedin.com/feed/update/no-raw",
    published_at: new Date().toISOString(),
  });
  console.log(JSON.stringify(third, null, 2));

  console.log("\n=== Test 4: unknown company (should 404) ===");
  const fourth = await post({
    ...payload,
    company_name: "Not A Real Company XYZ",
    post_url: `https://www.linkedin.com/feed/update/unknown-${Date.now()}`,
  });
  console.log(JSON.stringify(fourth, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
