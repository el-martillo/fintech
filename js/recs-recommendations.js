/* ── recs-recommendations.js — sparklines, card rendering, recommendations engine ── */

/* ── Sparklines ── */
function buildSparkline(data, isPos) {
  if (!data || data.length < 2) return '';
  const w=120,h=36,pad=2,min=Math.min(...data),max=Math.max(...data),range=max-min||1;
  const pts=data.map((v,i)=>{const x=pad+(i/(data.length-1))*(w-pad*2);const y=h-pad-((v-min)/range)*(h-pad*2);return `${x.toFixed(1)},${y.toFixed(1)}`;}).join(' ');
  const color=isPos?'var(--green)':'var(--red)';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px;"><defs><linearGradient id="sg${isPos?'p':'n'}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.18"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ── Recommendations ── */
const CRYPTO_TICKERS = new Set(['BTC-USD','ETH-USD','SOL-USD','BNB-USD','XRP-USD','DOGE-USD','ADA-USD','AVAX-USD','DOT-USD','MATIC-USD','COIN']);
function isCrypto(t) { return t.endsWith('-USD') || CRYPTO_TICKERS.has(t); }

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

  const sigClass  = signal === 'BUY' ? 'signal-BUY' : signal === 'SELL' ? 'signal-SELL' : 'signal-HOLD';
  const hasPrice  = r.price && r.price !== '—';
  const pos       = hasPrice ? r.change.startsWith('+') : true;
  const sparkline = buildSparkline(r.weekData, pos);
  const etoroTicker = r.ticker.replace('-USD','').toLowerCase();
  const etoroUrl  = `https://www.etoro.com/markets/${etoroTicker}`;
  if (hasPrice) liveMarketData[r.ticker] = { price: r.price, change: r.change };
  const isFav    = typeof _favourites !== 'undefined' && _favourites.has(r.ticker);
  const hasAlert = typeof _alerts    !== 'undefined' && _alerts.has(r.ticker);
  const nameEsc  = (r.name || r.ticker).replace(/'/g, "\'");
  const priceVal = hasPrice ? r.price : '0';

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

  const signalEl = loading
    ? `<span class="analysing-badge"><span class="analysing-dots"><span></span><span></span><span></span></span> Analysing</span>`
    : `<span class="signal-pill ${sigClass}" style="font-size:11px;padding:3px 10px;">${signal}</span>${conf ? `<span style="font-size:10px;color:var(--text-dim);">${conf} confidence</span>` : ''}`;

  return `
    <div class="rec-card${loading ? ' analysing' : ''}${isFav ? ' fav-active' : ''}" data-ticker="${r.ticker}">
      <div class="rec-top">
        <div>
          <div class="rec-ticker">${r.ticker.replace('-USD','')}</div>
          <div class="rec-name">${r.name}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
          ${signalEl}
          <div style="display:flex;gap:4px;margin-top:2px;">
            <button class="fav-btn${isFav ? ' fav-active' : ''}" onclick="toggleFavourite('${r.ticker}','${nameEsc}',event)" title="Favourite" style="background:none;border:none;cursor:pointer;padding:3px;color:var(--text-dim);transition:color 0.15s;display:flex;align-items:center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${isFav ? 'var(--amber)' : 'none'}" stroke="${isFav ? 'var(--amber)' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </button>
            <button class="alert-btn${hasAlert ? ' alert-active' : ''}" onclick="openAlertModal('${r.ticker}','${nameEsc}','${priceVal}',event)" title="Set price alert" style="background:none;border:none;cursor:pointer;padding:3px;color:var(--text-dim);transition:color 0.15s;display:flex;align-items:center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="${hasAlert ? 'rgba(108,99,255,0.2)' : 'none'}" stroke="${hasAlert ? 'var(--accent)' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="rec-price">${hasPrice ? '$' + r.price + ' <span class="' + (pos ? 'pos' : 'neg') + '">' + r.change + ' today</span>' : '<span style="color:var(--text-dim);font-size:12px;">Loading price…</span>'}</div>
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
      <div class="rec-reason${loading ? ' rec-loading' : ''}">${loading ? `<span class="rec-skel" style="display:block;height:12px;width:90%;margin-bottom:5px;"></span><span class="rec-skel" style="display:block;height:12px;width:70%;"></span>` : rationale}</div>
      ${actionHtml}
      <a class="rec-etoro-link" href="${etoroUrl}" target="_blank" rel="noopener">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Trade on eToro
      </a>
    </div>`;
}

async function loadRecommendations() {
  $('recs-grid-stocks').innerHTML = '<div class="movers-loading" style="grid-column:1/-1"><div class="spinner-sm"></div> Screening markets…</div>';
  $('recs-grid-crypto').innerHTML = '<div class="movers-loading" style="grid-column:1/-1"><div class="spinner-sm"></div> Screening crypto…</div>';
  const btn = $('recs-refresh-btn');
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ ticker: '__trending__', _t: Date.now() })
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    const picks = data.picks || [];
    const stocks = picks.filter(r => !isCrypto(r.ticker)).slice(0, 12);
    const crypto = picks.filter(r =>  isCrypto(r.ticker)).slice(0, 12);

    // Placeholders
    const renderGrid = (gridId, items) => {
      if (!items.length) { $(gridId).innerHTML = `<div class="movers-empty" style="grid-column:1/-1">No momentum picks right now.</div>`; return; }
      $(gridId).innerHTML = items.map(r => renderRecCard(r, null)).join('');
    };
    renderGrid('recs-grid-stocks', stocks);
    renderGrid('recs-grid-crypto', crypto);

    // Enrich sequentially — remove HOLDs, collect resolved for sort
    const enrichGrid = async (gridId, items) => {
      const resolved = []; // { r, ai } pairs
      for (const r of items) {
        const metrics = { rsi: r.rsi, volRatio: r.volRatio, rangePct: r.rangePct, streak: r.streak, weekPct: r.weekPct, weekTrend: r.weekTrend, direction: r.direction };
        const ai = await fetchAISignal(r.ticker, r.price, r.change, r.name, metrics);
        const signal = ai && ai.signal ? ai.signal : (r.direction === 'up' ? 'BUY' : 'SELL');
        if (signal === 'HOLD') continue;
        const resolvedAi = ai || { signal, confidence: 'Low', rationale: 'Signal temporarily unavailable — check back after refresh.', action: '', entry: '', stopLoss: '', positionSize: '' };
        resolved.push({ r, ai: resolvedAi });
      }
      if (!resolved.length) {
        $(gridId).innerHTML = '<div class="movers-empty" style="grid-column:1/-1">No strong BUY or SELL signals right now — check back later.</div>';
        return;
      }
      // Sort by confidence: High → Medium → Low
      const confOrder = { 'High': 0, 'Medium': 1, 'Low': 2 };
      resolved.sort((a, b) => (confOrder[a.ai.confidence] ?? 2) - (confOrder[b.ai.confidence] ?? 2));
      // Re-render grid in sorted order
      $(gridId).innerHTML = resolved.map(({ r, ai }) => renderRecCard(r, ai)).join('');
    };
    await enrichGrid('recs-grid-stocks', stocks);
    await enrichGrid('recs-grid-crypto', crypto);

  } catch(e) {
    const err = `<div class="movers-empty" style="grid-column:1/-1;display:flex;align-items:center;gap:12px;">Could not load recommendations. <button onclick="loadRecommendations()" style="padding:4px 12px;font-size:12px;cursor:pointer;border-radius:6px;background:var(--surface2);border:1px solid var(--border2);color:var(--text-muted);">Retry</button></div>`;
    $('recs-grid-stocks').innerHTML = err;
    $('recs-grid-crypto').innerHTML = '';
  } finally {
    if (btn) btn.disabled = false;
  }
}

function refreshRecs() {
  loadRecommendations();
  loadFavourites();
  loadAlerts();
  loadSavedSearches();
}
