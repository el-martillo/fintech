/* ── recs-main.js — sparklines, card rendering, recommendations engine, exchange ticker ── */
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
  const pos       = r.change.startsWith('+');
  const sparkline = buildSparkline(r.weekData, pos);
  const etoroTicker = r.ticker.replace('-USD','').toLowerCase();
  const etoroUrl  = `https://www.etoro.com/markets/${etoroTicker}`;
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

  const signalEl = loading
    ? `<span class="analysing-badge"><span class="analysing-dots"><span></span><span></span><span></span></span> Analysing</span>`
    : `<span class="signal-pill ${sigClass}" style="font-size:11px;padding:3px 10px;">${signal}</span>${conf ? `<span class="rec-conf-label" style="font-size:10px;color:var(--text-dim);">${conf} confidence</span>` : ''}`;

  return `
    <div class="rec-card${loading ? ' analysing' : ''}" data-ticker="${r.ticker}">
      <button class="fav-btn${_favourites.has(r.ticker) ? ' fav-active' : ''}" title="Add to favourites" onclick="toggleFavourite('${r.ticker}','${(r.name||'').replace(/'/g,'&#39;')}',event)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${_favourites.has(r.ticker) ? 'var(--amber)' : 'none'}" stroke="${_favourites.has(r.ticker) ? 'var(--amber)' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </button>
      <button class="alert-btn${_alerts.has(r.ticker) ? ' alert-active' : ''}" title="Set price alert" onclick="openAlertModal('${r.ticker}','${(r.name||'').replace(/'/g,'&#39;')}','${r.price}',event)">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="${_alerts.has(r.ticker) ? 'rgba(108,99,255,0.2)' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      </button>
      <div class="rec-top">
        <div>
          <div class="rec-ticker">${r.ticker.replace('-USD','')}</div>
          <div class="rec-name">${r.name}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;">
          ${signalEl}
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
      <div class="rec-reason${loading ? ' rec-loading' : ''}">${loading ? `<span class="rec-skel" style="display:block;height:12px;width:90%;margin-bottom:5px;"></span><span class="rec-skel" style="display:block;height:12px;width:70%;"></span>` : rationale}</div>
      ${actionHtml}
      <a class="rec-etoro-link" href="${etoroUrl}" target="_blank" rel="noopener">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Trade on eToro
      </a>
    </div>`;
}

/* ── Recommendations cache ── */
const RECS_CACHE_KEY = 'recs_cache_v3';
const RECS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function _saveRecsCache(stocksHtml, cryptoHtml) {
  try {
    sessionStorage.setItem(RECS_CACHE_KEY, JSON.stringify({ ts: Date.now(), stocksHtml, cryptoHtml }));
  } catch(e) { /* quota */ }
}
function _loadRecsCache() {
  try {
    const raw = sessionStorage.getItem(RECS_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (Date.now() - c.ts > RECS_CACHE_TTL) { sessionStorage.removeItem(RECS_CACHE_KEY); return null; }
    return c;
  } catch(e) { return null; }
}
function _updateRefreshBtn(ts) {
  const btn = $('recs-refresh-btn');
  if (!btn) return;
  const mins = Math.round((Date.now() - ts) / 60000);
  const label = mins < 1 ? 'just now' : mins === 1 ? '1 min ago' : `${mins} min ago`;
  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Refreshed ${label}`;
}

/* ── Expanded watchlist — sampled randomly each load for variety ── */
// (Sampling now handled server-side in the Edge Function)

/* Sort cards: High > Medium > Low confidence, add dividers */
function _sortAndDivideGrid(gridId) {
  const grid = $(gridId);
  if (!grid) return;
  const cards = [...grid.querySelectorAll('.rec-card[data-ticker]')];
  if (!cards.length) return;

  const buckets = { High: [], Medium: [], Low: [] };
  cards.forEach(card => {
    const confText = card.querySelector('.rec-conf-label')?.textContent?.trim() || '';
    const conf = confText.replace(' confidence','').replace(' Confidence','');
    if (conf === 'High') buckets.High.push(card);
    else if (conf === 'Medium') buckets.Medium.push(card);
    else buckets.Low.push(card);
  });

  grid.innerHTML = '';
  const add = (label, color, items) => {
    if (!items.length) return;
    const divider = document.createElement('div');
    divider.style.cssText = `grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:4px 0 2px;`;
    divider.innerHTML = `
      <span style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${color};">${label}</span>
      <span style="flex:1;height:1px;background:var(--border);"></span>
      <span style="font-size:10px;color:var(--text-dim);">${items.length} signal${items.length>1?'s':''}</span>`;
    grid.appendChild(divider);
    items.forEach(c => grid.appendChild(c));
  };
  add('High Confidence', 'var(--green)', buckets.High);
  add('Medium Confidence', 'var(--amber)', buckets.Medium);
  add('Low Confidence', 'var(--text-dim)', buckets.Low);
}

async function loadRecommendations(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = _loadRecsCache();
    if (cached) {
      $('recs-grid-stocks').innerHTML = cached.stocksHtml;
      $('recs-grid-crypto').innerHTML = cached.cryptoHtml;
      _updateRefreshBtn(cached.ts);
      document.querySelectorAll('#recs-grid-stocks [data-ticker], #recs-grid-crypto [data-ticker]').forEach(card => {
        if (card.dataset.ticker) liveMarketData[card.dataset.ticker] = { price: '', change: '' };
      });
      _sortAndDivideGrid('recs-grid-stocks');
      _sortAndDivideGrid('recs-grid-crypto');
      return;
    }
  }

  $('recs-grid-stocks').innerHTML = '<div class="movers-loading" style="grid-column:1/-1"><div class="spinner-sm"></div> Screening markets…</div>';
  $('recs-grid-crypto').innerHTML = '<div class="movers-loading" style="grid-column:1/-1"><div class="spinner-sm"></div> Screening crypto…</div>';
  const btn = $('recs-refresh-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="adp-spin" style="border-color:rgba(255,255,255,0.2);border-top-color:var(--text-muted);"></span> Loading…'; }

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
    const crypto = picks.filter(r =>  isCrypto(r.ticker)).slice(0, 9);

    const renderGrid = (gridId, items) => {
      if (!items.length) { $(gridId).innerHTML = `<div class="movers-empty" style="grid-column:1/-1">No momentum picks right now.</div>`; return; }
      // Signals are pre-baked server-side — render fully immediately, no loading state
      $(gridId).innerHTML = items.map(r => {
        const ai = r.signal ? { signal: r.signal, confidence: r.confidence, rationale: r.rationale, action: r.action, entry: r.entry, stopLoss: r.stopLoss, positionSize: r.positionSize } : null;
        return renderRecCard(r, ai);
      }).join('');
      _sortAndDivideGrid(gridId);
    };
    renderGrid('recs-grid-stocks', stocks);
    renderGrid('recs-grid-crypto', crypto);

    _saveRecsCache($('recs-grid-stocks').innerHTML, $('recs-grid-crypto').innerHTML);
    _updateRefreshBtn(Date.now());

  } catch(e) {
    const err = `<div class="movers-empty" style="grid-column:1/-1;display:flex;align-items:center;gap:12px;">Could not load recommendations. <button onclick="loadRecommendations(true)" style="padding:4px 12px;font-size:12px;cursor:pointer;border-radius:6px;background:var(--surface2);border:1px solid var(--border2);color:var(--text-muted);">Retry</button></div>`;
    $('recs-grid-stocks').innerHTML = err;
    $('recs-grid-crypto').innerHTML = '';
  } finally {
    if (btn) btn.disabled = false;
  }
}

function refreshRecs() {
  sessionStorage.removeItem(RECS_CACHE_KEY);
  loadRecommendations(true);
  loadFavourites();
  loadSavedSearches();
}

/* ── Stock Lookup panel ── */
function toggleLookupPanel() {
  const panel = $('lookup-panel');
  const btn   = $('lookup-toggle-btn');
  const open  = panel.style.display !== 'none';
  if (open) {
    closeLookupPanel();
  } else {
    panel.style.display = 'block';
    btn.style.borderColor  = 'var(--accent)';
    btn.style.color        = 'var(--accent)';
    btn.style.background   = 'var(--accent-dim)';
    setTimeout(() => $('lookup-input')?.focus(), 50);
  }
}

function closeLookupPanel() {
  const panel = $('lookup-panel');
  const btn   = $('lookup-toggle-btn');
  if (panel) panel.style.display = 'none';
  if (btn) { btn.style.borderColor = ''; btn.style.color = ''; btn.style.background = ''; }
  clearLookup();
}

async function lookupTicker() {
  const query = $('lookup-input').value.trim();
  if (!query) return;
  $('lookup-error').textContent = '';
  $('lookup-results').innerHTML = '';
  $('lookup-loading').style.display = 'flex';
  $('lookup-btn').disabled = true;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ ticker: '__lookup__', lookupQuery: query })
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const results = data.lookupResults || [];

    if (!results || !results.length) {
      $('lookup-results').innerHTML = '<div class="lookup-empty">No matches found.</div>';
    } else {
      $('lookup-results').innerHTML = results.map(r => `
        <div class="lookup-item" onclick="useLookupResult('${r.ticker}', '${(r.name||'').replace(/'/g,'\'\'')}')">
          <span class="lookup-ticker">${r.ticker}</span>
          <span class="lookup-name">${r.name}</span>
          <span style="font-size:11px;color:var(--text-dim);flex-shrink:0;">${r.exchange || ''}</span>
          <span class="lookup-use">Analyse →</span>
        </div>`).join('');
    }
  } catch (err) {
    $('lookup-error').textContent = `Lookup failed: ${err.message}`;
  } finally {
    $('lookup-loading').style.display = 'none';
    $('lookup-btn').disabled = false;
  }
}


/* ── Exchange Ticker Bar ── */
const EXCHANGES = [
  { name:'NYSE',    label:'New York SE',   flag:'🇺🇸', tz:'America/New_York', open:'09:30', close:'16:00' },
  { name:'NASDAQ',  label:'Nasdaq',        flag:'🇺🇸', tz:'America/New_York', open:'09:30', close:'16:00' },
  { name:'SSE',     label:'Shanghai SE',   flag:'🇨🇳', tz:'Asia/Shanghai',   open:'09:30', close:'15:00' },
  { name:'TSE',     label:'Tokyo SE',      flag:'🇯🇵', tz:'Asia/Tokyo',      open:'09:00', close:'15:30' },
  { name:'Euronext',label:'Euronext',      flag:'🇪🇺', tz:'Europe/Paris',    open:'09:00', close:'17:30' },
  { name:'LSE',     label:'London SE',     flag:'🇬🇧', tz:'Europe/London',   open:'08:00', close:'16:30' },
  { name:'NSE',     label:'Nat. SE India', flag:'🇮🇳', tz:'Asia/Kolkata',    open:'09:15', close:'15:30' },
  { name:'HKEX',    label:'Hong Kong',     flag:'🇭🇰', tz:'Asia/Hong_Kong',  open:'09:30', close:'16:00' },
  { name:'SZSE',    label:'Shenzhen SE',   flag:'🇨🇳', tz:'Asia/Shanghai',   open:'09:30', close:'15:00' },
  { name:'TMX',     label:'Toronto SE',    flag:'🇨🇦', tz:'America/Toronto', open:'09:30', close:'16:00' },
];

function isExchOpen(ex) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: ex.tz, hour:'2-digit', minute:'2-digit', hour12:false, weekday:'short' });
  const parts = fmt.formatToParts(now);
  const wd = parts.find(p=>p.type==='weekday').value;
  const h  = parseInt(parts.find(p=>p.type==='hour').value);
  const m  = parseInt(parts.find(p=>p.type==='minute').value);
  if (wd==='Sat'||wd==='Sun') return false;
  const [oh,om] = ex.open.split(':').map(Number);
  const [ch,cm] = ex.close.split(':').map(Number);
  const now_ = h*60+m, o = oh*60+om, cl = ch*60+cm;
  return now_ >= o && now_ < cl;
}

function buildTickerItems(items) {
  return items.map(({ex, data}) => {
    const open  = isExchOpen(ex);
    const pos   = data ? data.change >= 0 : null;
    const pct   = data ? (pos?'+':'')+data.change.toFixed(2)+'%' : '—';
    const color = data ? (pos ? 'var(--green)' : 'var(--red)') : 'var(--text-dim)';
    const dot   = open ? '<span class="live-dot" style="width:5px;height:5px;border-radius:50%;background:var(--green);display:inline-block;animation:livepulse 1.5s ease-in-out infinite;flex-shrink:0;margin-right:2px;"></span>' : '';
    return `<div class="exchange-item">
      <span style="font-size:13px;line-height:1;">${ex.flag}</span>
      <span class="exchange-name">${ex.name}</span>
      <span class="exchange-loc">${ex.label}</span>
      <span class="exchange-chg" style="color:${color}">${pct}</span>
      <span class="exchange-status ${open?'status-open':'status-closed'}">${dot}${open?'OPEN':'CLOSED'}</span>
    </div>`;
  }).join('');
}

function renderTickerTrack(items) {
  const track = $('exchange-ticker-track');
  if (!track) return;
  const inner = buildTickerItems(items);
  track.innerHTML = inner + inner;
}

function loadExchangeTicker() {
  // Render open/closed status immediately (no Yahoo fetch on this page)
  const items = EXCHANGES.map(ex => ({ex, data: null}));
  renderTickerTrack(items);
  setInterval(() => renderTickerTrack(items), 60000);
}
loadExchangeTicker();
