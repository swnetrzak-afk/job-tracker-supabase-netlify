// Netlify Function: POST /extract-jd
// Body: { jd: "<pasted job description text>", url?: "<source url>" }
// Returns: { title, company, remote, comp, url, summary, requirements }
//
// Requires Netlify env var: ANTHROPIC_API_KEY
// (Set in Netlify dashboard → Site settings → Environment variables.)

const SYSTEM_PROMPT = `You extract structured fields from job descriptions for a personal job tracker.

Return ONLY a single JSON object, no prose, no markdown fencing. Schema:

{
  "title":        string,    // exact job title from the JD
  "company":      string,    // company name, or "" if not found
  "remote":       "Remote" | "Hybrid" | "On-site" | "",  // infer from location language; "" if unclear
  "comp":         string,    // salary/range/OTE as written, or "" if not listed
  "url":          string,    // echo back the URL the user provided if any, else ""
  "summary":      string,    // 3-5 bullet lines, each prefixed with "• ", separated by \\n.
                             // What the role does: scope, level, ownership, key cross-functional ties.
                             // Skip boilerplate ("collaborative culture", "fast-paced").
  "requirements": string     // 3-5 bullet lines, each prefixed with "• ", separated by \\n.
                             // What they're screening for: years/domain, specific skills/tools,
                             // hard differentiators. Skip filler ("strong communication").
}

If a field cannot be determined, use "" (empty string). Do not guess or fabricate.
Bullets must be concise — one clear thought each, no run-ons.`;

// Company names the model emits when it couldn't find a real one. We treat these
// as "not found" and blank the field so the client leaves it empty for the user,
// rather than writing a placeholder like "Confidential" into the company column.
const COMPANY_PLACEHOLDERS = new Set([
  "", "the company", "company", "n/a", "na", "unknown", "not specified",
  "not found", "not listed", "none", "employer", "the employer", "confidential",
]);
function isConfidentCompany(name) {
  const n = (name || "").trim().toLowerCase();
  return n.length > 0 && !COMPANY_PLACEHOLDERS.has(n);
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const jd = (body.jd || "").trim();
  const sourceUrl = (body.url || "").trim();
  if (!jd) return json({ error: "Missing 'jd' field" }, 400);
  if (jd.length > 25000) return json({ error: "JD too long (>25k chars)" }, 400);

  const userMessage = sourceUrl
    ? `Source URL: ${sourceUrl}\n\n---\n\n${jd}`
    : jd;

  let claudeRes;
  try {
    claudeRes = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
  } catch (e) {
    return json({ error: "Failed to reach Claude API", detail: String(e) }, 502);
  }

  if (!claudeRes.ok) {
    const detail = await claudeRes.text();
    return json({ error: "Claude API error", status: claudeRes.status, detail }, 502);
  }

  const data = await claudeRes.json();
  // Take the LAST text block, not content[0] — a response can lead with a
  // non-text block (e.g. a thinking block on thinking-capable models), which
  // would leave content[0].text undefined and break parsing.
  const textBlocks = (Array.isArray(data?.content) ? data.content : []).filter(b => b && b.type === "text");
  const text = textBlocks.length ? (textBlocks[textBlocks.length - 1].text || "") : "";

  // Tolerate accidental fencing or whitespace, then parse.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let extract;
  try {
    extract = JSON.parse(cleaned);
  } catch {
    return json({ error: "Claude returned non-JSON", raw: text, stop_reason: data?.stop_reason }, 502);
  }

  // Blank out placeholder company names so the client keeps the field empty.
  if (extract && !isConfidentCompany(extract.company)) {
    extract.company = "";
  }

  return json(extract, 200);
};

// POST wrapper that retries transient Anthropic errors (rate limit / overloaded /
// service unavailable) and network blips with exponential backoff. The Anthropic
// call is a stateless completion, so replaying it is safe.
async function fetchWithRetry(url, options, { retries = 2, retryStatuses = [429, 503, 529] } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      // Return on success, on a non-transient error (fail fast), or when out of retries.
      if (res.ok || !retryStatuses.includes(res.status) || attempt === retries) {
        return res;
      }
    } catch (e) {
      lastErr = e;
      if (attempt === retries) throw e;
    }
    await sleep(300 * Math.pow(2, attempt)); // 300ms, then 600ms
  }
  throw lastErr;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
