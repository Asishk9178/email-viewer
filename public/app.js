const $ = s => document.querySelector(s);
const PER_PAGE = 50;
let emails = [], activeId = null, tab = 'code';
let baseUrl = '', page = 1;

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

const authHeaders = () => ({ 'X-Api-Key': $('#apiKey').value.trim() });

function pageUrl(p) {
  const u = new URL(baseUrl);
  u.searchParams.set('per_page', PER_PAGE);
  u.searchParams.set('page', p);
  return u.toString();
}

async function load(p = 1) {
  if (!baseUrl) return;
  setPagerDisabled(true);
  $('#rows').innerHTML = '<tr><td colspan="2" class="muted">Loading…</td></tr>';
  try {
    const q = new URLSearchParams({ url: pageUrl(p) });
    const r = await fetch('/api/emails?' + q, { headers: authHeaders() });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    emails = j.emails; page = p;
    renderList();
  } catch (e) {
    $('#rows').innerHTML = `<tr><td colspan="2" style="color:#ff7b7b">${esc(e.message)}</td></tr>`;
  }
  updatePager();
}

function setPagerDisabled(d) { ['#prevBtn', '#nextBtn', '#refreshBtn'].forEach(s => $(s).disabled = d); }

function updatePager() {
  $('#pageInfo').textContent = `Page ${page} · ${emails.length} emails`;
  $('#prevBtn').disabled = page <= 1;
  $('#nextBtn').disabled = emails.length === 0;
  $('#refreshBtn').disabled = false;
}

function renderList() {
  const term = $('#search').value.toLowerCase();
  const list = emails.filter(e => (e.subject + e.from).toLowerCase().includes(term));
  $('#count').textContent = list.length;
  $('#rows').innerHTML = list.length ? '' : '<tr><td colspan="2" class="muted">No emails found.</td></tr>';
  list.forEach(e => {
    const tr = document.createElement('tr');
    tr.className = e.id === activeId ? 'active' : '';
    tr.innerHTML = `<td title="${esc(e.subject)}">${esc(e.subject)}</td><td title="${esc(e.from)}">${esc(e.from)}</td>`;
    tr.onclick = () => select(e);
    $('#rows').appendChild(tr);
  });
}

async function select(e) {
  activeId = e.id;
  if (!e.html && e.detailUrl && !e.loaded) {
    $('#code').textContent = 'Loading HTML…'; show(e);
    try {
      const q = new URLSearchParams({ url: e.detailUrl });
      const j = await (await fetch('/api/detail?' + q, { headers: authHeaders() })).json();
      if (j.error) throw new Error(j.error);
      e.html = j.email.html || ''; e.link = j.email.link || e.link; e.htmlStatus = j.email.htmlStatus; e.loaded = true;
    } catch (err) { e.html = ''; e.htmlStatus = err.message; }
  }
  if (activeId === e.id) show(e);
}

function show(e) {
  activeId = e.id;
  $('#mSubject').textContent = e.subject;
  $('#mFrom').textContent = e.from || '—';
  $('#mDate').textContent = e.date ? new Date(e.date).toString() !== 'Invalid Date' ? new Date(e.date).toLocaleString() : e.date : '';
  $('#meta').classList.remove('hidden'); $('#mLink').style.display = e.link ? '' : 'none'; $('#mLink').href = e.link || '#';
  $('#empty').classList.add('hidden');
  const code = (e.head && e.html && !e.html.includes('<head') ? `<!-- HEAD -->\n${e.head}\n\n<!-- BODY -->\n` : '') + (e.html || `(no HTML available${e.htmlStatus ? ': ' + e.htmlStatus : ''})`);
  $('#code').textContent = code;
  $('#preview').srcdoc = e.html || '';
  setTab(tab);
  renderList();
}

function setTab(t) {
  tab = t;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  if (!activeId) return;
  $('#code').classList.toggle('hidden', t !== 'code');
  $('#preview').classList.toggle('hidden', t !== 'preview');
}

document.querySelectorAll('.tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));

$('#apiForm').onsubmit = ev => {
  ev.preventDefault();
  baseUrl = $('#apiUrl').value.trim();
  try { $('#remember').checked ? localStorage.setItem('el_key', $('#apiKey').value.trim()) : localStorage.removeItem('el_key'); } catch {}
  load(1);
};
$('#sampleBtn').onclick = () => { baseUrl = location.origin + '/api/sample'; $('#apiUrl').value = baseUrl; load(1); };
$('#refreshBtn').onclick = () => { baseUrl = $('#apiUrl').value.trim(); load(page); };   // reload current page
$('#nextBtn').onclick = () => load(page + 1);                                            // next 50
$('#prevBtn').onclick = () => load(page - 1);                                            // back 50
$('#search').oninput = renderList;
$('#copyBtn').onclick = () => { navigator.clipboard.writeText($('#code').textContent); $('#copyBtn').textContent = 'Copied!'; setTimeout(() => $('#copyBtn').textContent = 'Copy', 1200); };

// Start: use the remembered key if there is one, otherwise wait for the user to enter it
baseUrl = $('#apiUrl').value.trim();
let saved = ''; try { saved = localStorage.getItem('el_key') || ''; } catch {}
if (saved) { $('#apiKey').value = saved; load(1); }