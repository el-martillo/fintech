/* ── main-news.js — financial news loader ── */

/* ── Financial news — via Edge Function proxy ── */
async function loadNews() {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ ticker: '__news__' })
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    const articles = data.news || [];
    if (!articles.length) {
      $('news-grid').innerHTML = '<div class="movers-empty" style="grid-column:1/-1">Could not load news.</div>';
      return;
    }
    $('news-grid').innerHTML = articles.map(a => `
      <div class="news-card" onclick="if('${a.url||''}' !== '#') window.open('${a.url||'#'}','_blank')" style="${a.url ? 'cursor:pointer' : ''}">
        <div class="news-source">${a.source} · ${a.time}</div>
        <div class="news-headline">${a.headline}</div>
        <div class="news-summary">${a.summary}</div>
        <div class="news-tickers">${(a.tickers||[]).map(t => `<span class="news-ticker-tag" onclick="event.stopPropagation();setTicker('${t}')">${t}</span>`).join('')}</div>
      </div>`).join('');
  } catch(e) {
    $('news-grid').innerHTML = '<div class="movers-empty" style="grid-column:1/-1">Could not load news.</div>';
  }
}
