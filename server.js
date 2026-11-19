const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const EL_HOST = 'dev.emaillove.com';

app.use(express.static(path.join(__dirname, 'public')));

// Only allow Email Love's API (and this server's own /api/sample demo)
function allowed(u, req) {
  try {
    const x = new URL(u);
    return x.hostname === EL_HOST || x.host === req.get('host');
  } catch { return false; }
}

async function call(url, key) {
  const headers = { Accept: 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) throw new Error('Invalid or missing API key (401).');
    throw new Error(body?.error?.message || `API responded with ${r.status}`);
  }
  return body;
}

// The API key arrives in a header from the user's browser, never stored on the server
function guard(req, res) {
  const url = req.query.url, key = (req.get('x-api-key') || '').trim();
  if (!url || !allowed(url, req)) { res.status(400).json({ error: 'Only Email Love API links are allowed.' }); return null; }
  if (new URL(url).hostname === EL_HOST && !key) { res.status(400).json({ error: 'Enter your Email Love API key first.' }); return null; }
  return { url, key };
}

// List
app.get('/api/emails', async (req, res) => {
  const g = guard(req, res); if (!g) return;
  try {
    const raw = await call(g.url, g.key);
    const origin = new URL(g.url).origin;
    const emails = (findArray(raw) || []).map((e, i) => {
      const n = normalise(e, i);
      if (!n.html && new URL(g.url).hostname === EL_HOST && e.id) n.detailUrl = `${origin}/v1/emails/${e.id}`;
      return n;
    });
    res.json({ emails });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Single email (the HTML code lives here)
app.get('/api/detail', async (req, res) => {
  const g = guard(req, res); if (!g) return;
  try {
    const raw = await call(g.url, g.key);
    const d = raw.data || raw;
    const n = normalise(d, 0);
    n.htmlStatus = d.html_status || '';
    res.json({ email: n });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// demo data (120 fake emails, no key needed)
app.get('/api/sample', (req, res) => {
  const page = Math.max(1, +req.query.page || 1), per = Math.min(50, +req.query.per_page || 20);
  const all = Array.from({ length: 120 }, (_, i) => ({
    id: i + 1, subject: `Sample email #${i + 1}`, from: `Sender ${i + 1} <s${i + 1}@example.com>`,
    html: `<html><body><h1>Sample email #${i + 1}</h1><p>Hello world</p></body></html>`
  }));
  res.json({ data: all.slice((page - 1) * per, page * per) });
});

const pick = (o, keys) => { for (const k of keys) if (o[k] != null && o[k] !== '') return o[k]; return ''; };

function findArray(x) {
  if (Array.isArray(x)) return x;
  if (x && typeof x === 'object') for (const v of Object.values(x)) if (Array.isArray(v)) return v;
  return null;
}

function fmtFrom(e) {
  let f = pick(e, ['from', 'sender', 'from_email', 'from_address']);
  if (f && typeof f === 'object') f = (f.name ? f.name + ' ' : '') + (f.email || f.address ? `<${f.email || f.address}>` : '');
  const brand = typeof e.brand === 'string' ? e.brand : e.brand?.name;
  if (brand && f && !String(f).includes(brand)) return `${brand} <${f}>`;
  return f || brand || '';
}

function normalise(e, i) {
  return {
    id: pick(e, ['id', '_id', 'uuid']) || i + 1,
    subject: pick(e, ['subject', 'subject_line', 'sub', 'title', 'name']) || '(no subject)',
    from: fmtFrom(e),
    date: pick(e, ['sent_date', 'date', 'created_at', 'captured_date', 'timestamp']),
    head: pick(e, ['head']),
    html: pick(e, ['html', 'html_body', 'htmlContent', 'body', 'content']),
    link: e.emaillove_url || e.url || ''
  };
}

app.listen(PORT, () => console.log(`Email viewer → http://localhost:${PORT}`));