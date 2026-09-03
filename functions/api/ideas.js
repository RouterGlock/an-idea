// Cloudflare Pages Function using Workers AI (free tier: 10k neurons/day, no API key).
// The AI binding is declared in wrangler.toml — that's the only config needed.
const MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
];

export async function onRequestPost({ request, env }) {
  if (!env.AI) return json({ error: 'AI binding missing — check wrangler.toml' }, 500);
  let topic;
  try { ({ topic } = await request.json()); } catch { return json({ error: 'Bad JSON' }, 400); }
  topic = String(topic || '').slice(0, 80).trim();
  if (!topic) return json({ error: 'topic required' }, 400);

  const messages = [
    { role: 'system', content: 'You write idea cards for a micro-learning feed. Respond with ONLY a JSON array. No markdown, no commentary, no thinking.' },
    { role: 'user', content: `Topic: "${topic}".
Return a JSON array of 5 objects: {"title": punchy 3-8 word headline, "body": 35-60 word explanation of one distinct, non-obvious idea, "note": one-line practical action the reader can take today, "source": the kind of thinking it draws on, e.g. "behavioral economics"}. Each idea must be genuinely different. Write in your own words; never reproduce copyrighted text.` },
  ];

  let lastErr = 'no model responded';
  for (const model of MODELS) {
    try {
      const out = await env.AI.run(model, { messages, max_tokens: 1200, temperature: 0.8 });
      const cards = extract(out);
      if (cards.length) return json({ cards, model });
      lastErr = `unparseable output from ${model}`;
    } catch (e) { lastErr = `${model}: ${e.message}`; }
  }
  return json({ error: lastErr }, 502);
}

const valid = a => (Array.isArray(a) ? a.filter(c => c && c.title && c.body) : []);

// Workers AI returns an object carrying both a pre-parsed `response` (an array
// when the model emitted valid JSON) and an OpenAI-style `choices[].message
// .content` string. Older models / string mode return a bare string. Handle all.
function extract(out) {
  if (Array.isArray(out)) return valid(out);
  if (Array.isArray(out?.response)) return valid(out.response);

  const text =
    typeof out === 'string' ? out :
    typeof out?.response === 'string' ? out.response :
    out?.choices?.[0]?.message?.content ??
    out?.result?.response ?? '';
  if (typeof text !== 'string') return [];

  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '');
  const s = clean.indexOf('['), e = clean.lastIndexOf(']');
  if (s < 0 || e < 0) return [];
  try { return valid(JSON.parse(clean.slice(s, e + 1))); } catch { return []; }
}
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
