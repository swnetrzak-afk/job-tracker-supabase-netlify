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
    claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
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
  const text = data?.content?.[0]?.text || "";

  // Tolerate accidental fencing or whitespace, then parse.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let extract;
  try {
    extract = JSON.parse(cleaned);
  } catch {
    return json({ error: "Claude returned non-JSON", raw: text }, 502);
  }

  return json(extract, 200);
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}
