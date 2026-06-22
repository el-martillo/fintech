/* ── main-recommendations.js — recommendations engine, card rendering ── */

/* ── Recommendations — real Yahoo Finance data + AI signal ── */

// All Yahoo Finance calls go through the Edge Function to avoid CORS
async function yahooFetch(ticker, range, interval) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ ticker: '__yahoo__', yTicker: ticker, range, interval })
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.result ?? null;
  } catch { return null; }
}

async function fetchYahooQuote(ticker) {
  // Use 5d/1d so we get multiple daily closes — always derive price from closes array
  const result = await yahooFetch(ticker, '5d', '1d');
  if (!result) throw new Error(`No data for ${ticker}`);

  const closes = (result.indicators?.quote?.[0]?.close || []).filter(p => p != null);
  if (closes.length < 2) throw new Error('insufficient closes');

  const price = closes[closes.length - 1];
  const prev  = closes[closes.length - 2];
  const change = ((price - prev) / prev) * 100;
  const sign   = change >= 0 ? '+' : '';

  return {
    ticker,
    name:     result.meta?.longName || result.meta?.shortName || ticker,
    price:    price.toFixed(2),
    change:   `${sign}${change.toFixed(2)}%`,
    weekData: closes.map(p => parseFloat(p.toFixed(2))),
  };
}

async function fetchAISignal(ticker, price, change, name, metrics) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ ticker: '__signal__', signalTicker: ticker, price, change, name, metrics })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

function renderRecCard(r, ai) {
  const signal    = (ai && ai.signal)       || (r.direction === 'up' ? 'BUY' : 'SELL');
  const conf      = (ai && ai.confidence)   || '';
  const rationale = (ai && ai.rationale)    || 'Loading analysis…';
  const action    = (ai && ai.action)       || '';
  const entry     = (ai && ai.entry)        || '';
  const stopLoss  = (ai && ai.stopLoss)     || '';
  const posSize   = (ai && ai.positionSize) || '';
  const loading   = !ai;

  const sigClass    = signal === 'BUY' ? 'signal-BUY' : signal === 'SELL' ? 'signal-SELL' : 'signal-HOLD';
  const pos         = r.change.startsWith('+');
  const sparkline   = buildSparkline(r.weekData, pos);
  const etoroTicker = r.ticker.replace('-USD','').toLowerCase();
  const etoroUrl    = `https://www.etoro.com/markets/${etoroTicker}`;
  liveMarketData[r.ticker] = { price: r.price, change: r.change };

  const volRatio = r.volRatio || 1;
  const volPct   = Math.min(100, Math.round((volRatio / 3) * 100));
  const volLabel = volRatio >= 2 ? 'High' : volRatio >= 1.2 ? 'Above avg' : volRatio < 0.7 ? 'Low' : 'Normal';
  const volColor = volRatio >= 1.5 ? 'var(--accent)' : volRatio < 0.7 ? 'var(--text-dim)' : 'var(--text-muted)';
  const rsi      = r.rsi || 50;
  const rsiColor = rsi >= 70 ? 'var(--red)' : rsi <= 30 ? 'var(--green)' : 'var(--text-muted)';
  const rsiLabel = rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral';

  const actionHtml = action ? `
      <div class="rec-action-box rec-action-${signal}">
        <div class="rec-action-label">Recommendation</div>
        <div class="rec-action-text">${action}</div>
        ${(entry || stopLoss || posSize) ? `
        <div class="rec-action-levels">
          ${entry    ? `<span class="rec-level"><span class="rec-level-key">Entry</span> ${entry}</span>` : ''}
          ${stopLoss ? `<span class="rec-level rec-level-stop"><span class="rec-level-key">Stop</span> ${stopLoss}</span>` : ''}
          ${posSize  ? `<span class="rec-level"><span class="rec-level-key">Size</span> ${posSize}</span>` : ''}
        </div>` : ''}
      </div>` : '';

  return `
    <div class="rec-card" onclick="setTickerFromMover('${r.ticker}','${r.price}','${r.change}');document.getElementById('market-analysis').scrollIntoView({behavior:'smooth',block:'start'});">
      <div class="rec-top">
        <div>
          <div class="rec-ticker">${r.ticker.replace('-USD','')}</div>
          <div class="rec-name">${r.name}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
          <span class="signal-pill ${sigClass}" style="font-size:11px;padding:3px 10px;">${signal}</span>
          ${conf ? `<span style="font-size:10px;color:var(--text-dim);">${conf} confidence</span>` : ''}
        </div>
      </div>
      <div class="rec-price">$${r.price} <span class="${pos ? 'pos' : 'neg'}">${r.change} today</span></div>
      <div class="rec-sparkline">${sparkline}</div>
      <div style="display:flex;gap:8px;margin:2px 0;">
        <div style="flex:1;background:var(--surface2);border-radius:6px;padding:5px 8px;">
          <div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">RSI(5)</div>
          <div style="font-size:12px;font-family:var(--mono);color:${rsiColor};">${rsi} <span style="font-size:10px;font-family:inherit;">${rsiLabel}</span></div>
        </div>
        <div style="flex:1;background:var(--surface2);border-radius:6px;padding:5px 8px;">
          <div style="font-size:10px;color:var(--text-dim);margin-bottom:3px;">Volume</div>
          <div style="display:flex;align-items:center;gap:5px;">
            <div style="flex:1;height:4px;background:var(--border2);border-radius:2px;"><div style="width:${volPct}%;height:100%;background:${volColor};border-radius:2px;transition:width 0.4s;"></div></div>
            <span style="font-size:10px;color:${volColor};">${volLabel}</span>
          </div>
        </div>
      </div>
      <div class="rec-reason${loading ? ' rec-loading' : ''}">${rationale}</div>
      ${actionHtml}
      <a class="rec-etoro-link" href="${etoroUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Trade on eToro
      </a>
    </div>`;
}

const CRYPTO_TICKERS = new Set(['BTC-USD','ETH-USD','SOL-USD','BNB-USD','XRP-USD','DOGE-USD','ADA-USD','AVAX-USD','DOT-USD','MATIC-USD','COIN']);

function isCrypto(ticker) {
  return ticker.endsWith('-USD') || CRYPTO_TICKERS.has(ticker);
}

function setGridEmpty(gridId, msg) {
  $(gridId).innerHTML = `<div class="movers-empty" style="grid-column:1/-1">${msg}</div>`;
}

async function loadRecommendations() {
  $('recs-grid-stocks').innerHTML = '<div class="movers-loading" style="grid-column:1/-1"><div class="spinner-sm"></div> Screening…</div>';
  $('recs-grid-crypto').innerHTML = '<div class="movers-loading" style="grid-column:1/-1"><div class="spinner-sm"></div> Screening…</div>';
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ ticker: '__trending__', _t: Date.now() })
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    const picks = data.picks || [];

    const stocks = picks.filter(r => !isCrypto(r.ticker)).slice(0, 4);
    const crypto = picks.filter(r =>  isCrypto(r.ticker)).slice(0, 4);

    // Render placeholders immediately (null = loading state)
    const renderGrid = (gridId, items) => {
      if (!items.length) { setGridEmpty(gridId, 'No momentum picks right now.'); return; }
      $(gridId).innerHTML = items.map(r => renderRecCard(r, null)).join('');
    };
    renderGrid('recs-grid-stocks', stocks);
    renderGrid('recs-grid-crypto', crypto);

    // Enrich with full AI analysis sequentially
    const enrichGrid = async (gridId, items) => {
      for (let i = 0; i < items.length; i++) {
        const r = items[i];
        const metrics = { rsi: r.rsi, volRatio: r.volRatio, rangePct: r.rangePct, streak: r.streak, weekPct: r.weekPct, weekTrend: r.weekTrend, direction: r.direction };
        const ai = await fetchAISignal(r.ticker, r.price, r.change, r.name, metrics);
        const tmp = document.createElement('div');
        tmp.innerHTML = renderRecCard(r, ai);
        $(gridId).children[i]?.replaceWith(tmp.firstElementChild);
      }
    };

    // Run stocks then crypto sequentially
    await enrichGrid('recs-grid-stocks', stocks);
    await enrichGrid('recs-grid-crypto', crypto);

  } catch(e) {
    const errHtml = `<div class="movers-empty" style="grid-column:1/-1;display:flex;align-items:center;gap:12px;">
      Could not load recommendations.
      <button onclick="loadRecommendations()" style="padding:4px 12px;font-size:12px;cursor:pointer;border-radius:6px;background:var(--surface2);border:1px solid var(--border2);color:var(--text-muted);">Retry</button>
    </div>`;
    $('recs-grid-stocks').innerHTML = errHtml;
    $('recs-grid-crypto').innerHTML = '';
  }
}
