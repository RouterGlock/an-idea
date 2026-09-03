// Cloudflare Pages Function using Workers AI (free tier: 10k neurons/day, no API key).
// Binding declared in wrangler.toml as `AI`.
const MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/qwen/qwen3-30b-a3b-fp8',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
];
const MIN_BODY_WORDS = 55;

const system = `You write idea cards for a micro-learning feed, like a sharp editor distilling a great book into cards. Respond with ONLY a JSON object of the form {"cards":[...]} — no markdown fences, no commentary.`;

const userPrompt = (topic, stronger, page) => `Topic: "${topic}"${page > 1 ? ` (set ${page} — cover angles a reader who has already seen the obvious ones would not expect)` : ''}

Write exactly 5 idea cards. Each must be a genuinely different, non-obvious insight — no two cards may overlap.

Fields per card:
- "title": 3-8 word headline, punchy, no clickbait.
- "hook": one complete sentence of 10-18 words that states the idea plainly, e.g. "Your environment decides your habits more than your willpower ever will." Never a 2-3 word label.
- "body": 70 to 110 words. This is the meat. Explain the mechanism (WHY it works), give one concrete example a normal person would recognise, and name the common mistake people make. Write in short, confident sentences. Second person is fine.${stronger ? '\n  IMPORTANT: previous attempt was too short. Bodies MUST be at least 70 words. Count them.' : ''}
- "note": one specific action the reader can do today, under 20 words, starting with a verb.
- "source": the school of thought or field it draws on (e.g. "behavioral economics", "Stoic philosophy", "sports psychology").

Original wording only. Never quote or reproduce copyrighted text.`;

export async function onRequestPost({ request, env }) {
  if (!env.AI) return json({ error: 'AI binding missing — check wrangler.toml' }, 500);
  let topic, page;
  try { ({ topic, page } = await request.json()); } catch { return json({ error: 'Bad JSON' }, 400); }
  topic = String(topic || '').slice(0, 80).trim();
  page = Math.max(1, Math.min(20, parseInt(page) || 1));
  if (!topic) return json({ error: 'topic required' }, 400);

  // Edge cache: same topic+page served instantly for 12h without spending AI neurons.
  // The key host must be a domain served by this account or cache.put() is a silent
  // no-op, so build it from the real request origin.
  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/ideas/_cache/' + encodeURIComponent(topic.toLowerCase()) + '/' + page, request.url).toString());
  const hit = await cache.match(cacheKey);
  if (hit) { const h = new Response(hit.body, hit); h.headers.set('x-cache', 'hit'); return h; }

  let best = null, lastErr = 'no model responded';
  for (const model of MODELS) {
    for (const stronger of [false, true]) {
      try {
        const out = await env.AI.run(model, {
          messages: [{ role: 'system', content: system }, { role: 'user', content: userPrompt(topic, stronger, page) }],
          max_tokens: 2400,
          temperature: 0.75,
        });
        const cards = extract(out);
        if (!cards.length) { lastErr = `unparseable output from ${model}`; continue; }
        const thin = cards.filter(c => words(c.body) < MIN_BODY_WORDS).length;
        if (!best || thin < best.thin) best = { cards, model, thin };
        if (thin <= 1) return store(cache, cacheKey, json({ cards, model }));
      } catch (e) { lastErr = `${model}: ${e.message}`; }
    }
  }
  if (best) return store(cache, cacheKey, json({ cards: best.cards, model: best.model, note: 'some cards shorter than target' }));
  return json({ error: lastErr }, 502);
}

// Workers AI return shapes vary by model/version: handle all of them.
function extract(out) {
  let v = out;
  if (v && typeof v === 'object' && 'response' in v) v = v.response;
  else if (v && typeof v === 'object' && v.choices) v = null;
  if (v == null && out?.choices?.[0]?.message?.content) v = out.choices[0].message.content;
  if (typeof v === 'string') {
    const clean = v.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '');
    const s = Math.min(...['{', '['].map(ch => { const i = clean.indexOf(ch); return i < 0 ? Infinity : i; }));
    const e = Math.max(clean.lastIndexOf('}'), clean.lastIndexOf(']'));
    if (s === Infinity || e < 0) return [];
    try { v = JSON.parse(clean.slice(s, e + 1)); } catch { return []; }
  }
  const arr = Array.isArray(v) ? v : Array.isArray(v?.cards) ? v.cards : [];
  return arr
    .filter(c => c && c.title && c.body)
    .map(c => ({
      title: String(c.title).trim(),
      hook: String(c.hook || '').trim(),
      body: String(c.body).trim(),
      note: String(c.note || '').trim(),
      source: String(c.source || '').trim(),
    }));
}
function store(cache, key, res) {
  const c = new Response(res.body, res); c.headers.set('cache-control', 's-maxage=43200');
  cache.put(key, c.clone()).catch(() => {});
  return c;
}
const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
