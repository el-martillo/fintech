/* ── recs-lookup.js — stock lookup panel, saved searches ── */

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

const _searchedTickers = new Set();

async function useLookupResult(ticker, name) {
  // Deduplicate
  if (_searchedTickers.has(ticker)) {
    $('lookup-results').innerHTML = `<div class="lookup-empty" style="color:var(--text-dim);">${ticker} is already in Searches.</div>`;
    setTimeout(closeLookupPanel, 1400);
    return;
  }
  _searchedTickers.add(ticker);

  // Save to Supabase (fire-and-forget — don't block the UI)
  if (_currentUser) {
    // Delete any existing row for this ticker first (keeps it deduped + updates timestamp)
    db.from('stock_searches')
      .delete()
      .eq('user_id', _currentUser.id)
      .eq('ticker', ticker)
      .then(() => {
        db.from('stock_searches').insert({
          user_id: _currentUser.id,
          ticker,
          name: name || ticker,
        });
      });
  }

  // Show confirmation and close panel
  $('lookup-results').innerHTML = `<div class="lookup-empty" style="color:var(--green);">✓ Analysing <strong style="font-family:var(--mono)">${ticker}</strong>…</div>`;
  setTimeout(closeLookupPanel, 900);

  // Show Searches section
  const section = $('searches-section');
  const grid    = $('recs-grid-searches');
  section.style.display = 'block';

  // Build a placeholder r object and render loading card
  const placeholderR = {
    ticker, name: name || ticker,
    price: '—', change: '+0.00%',
    weekData: [], direction: 'up',
    weekTrend: 'up', weekPct: 0,
    rsi: 50, volRatio: 1, rangePct: 50, streak: 1,
  };
  const placeholder = document.createElement('div');
  placeholder.innerHTML = renderRecCard(placeholderR, null);
  grid.appendChild(placeholder.firstElementChild);

  // Scroll searches section into view
  setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);

  // Fetch real Yahoo price data
  try {
    const yRes = await fetch(`${SUPABASE_URL}/functions/v1/analyze-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ ticker: '__yahoo__', yTicker: ticker, range: '5d', interval: '1d' })
    });
    if (yRes.ok) {
      const yData = await yRes.json();
      const result = yData.result;
      if (result) {
        const raw    = result.indicators?.adjclose?.[0]?.adjclose || result.indicators?.quote?.[0]?.close || [];
        const closes = raw.filter(p => p != null && !isNaN(p) && p > 0);
        const vols   = (result.indicators?.quote?.[0]?.volume || []).filter(v => v != null && v > 0);
        const meta   = result.meta || {};

        if (closes.length >= 2) {
          const price   = meta.regularMarketPrice ?? closes[closes.length - 1];
          const prev    = closes[closes.length - 2];
          const todayPct = ((price - prev) / prev) * 100;
          const weekStart = closes[0];
          const weekPct  = ((price - weekStart) / weekStart) * 100;

          // RSI(5)
          let gains = 0, losses = 0;
          const period = Math.min(5, closes.length - 1);
          for (let i = closes.length - period; i < closes.length; i++) {
            const d = closes[i] - closes[i-1];
            if (d > 0) gains += d; else losses += Math.abs(d);
          }
          const rsi = losses === 0 ? 100 : Math.round(100 - 100 / (1 + gains / losses));

          const todayVol = vols[vols.length - 1] ?? 0;
          const avgVol   = vols.length > 1 ? vols.slice(0,-1).reduce((a,b)=>a+b,0)/(vols.length-1) : todayVol;
          const volRatio = avgVol > 0 ? parseFloat((todayVol / avgVol).toFixed(2)) : 1;
          const high5    = Math.max(...closes), low5 = Math.min(...closes);
          const rangePct = high5 > low5 ? Math.round(((price - low5) / (high5 - low5)) * 100) : 50;

          let streak = 1;
          for (let i = closes.length - 2; i > 0; i--) {
            if ((closes[i] > closes[i-1]) === (todayPct >= 0)) streak++; else break;
          }

          const sign = todayPct >= 0 ? '+' : '';
          placeholderR.price     = price.toFixed(2);
          placeholderR.change    = `${sign}${todayPct.toFixed(2)}%`;
          placeholderR.weekData  = closes.slice(-5).map(p => parseFloat(p.toFixed(2)));
          placeholderR.direction = todayPct >= 0 ? 'up' : 'down';
          placeholderR.weekTrend = weekPct >= 0 ? 'up' : 'down';
          placeholderR.weekPct   = parseFloat(weekPct.toFixed(2));
          placeholderR.rsi       = rsi;
          placeholderR.volRatio  = volRatio;
          placeholderR.rangePct  = rangePct;
          placeholderR.streak    = streak;
          placeholderR.name      = meta.longName || meta.shortName || name || ticker;
        }
      }
    }
  } catch (e) { /* use placeholder data */ }

  // Fetch AI signal
  const metrics = {
    rsi: placeholderR.rsi, volRatio: placeholderR.volRatio,
    rangePct: placeholderR.rangePct, streak: placeholderR.streak,
    weekPct: placeholderR.weekPct, weekTrend: placeholderR.weekTrend,
    direction: placeholderR.direction,
  };
  const ai = await fetchAISignal(ticker, placeholderR.price, placeholderR.change, placeholderR.name, metrics);

  const resolvedAi = ai || {
    signal: placeholderR.direction === 'up' ? 'BUY' : 'SELL',
    confidence: 'Low',
    rationale: 'Signal temporarily unavailable.',
    action: '', entry: '', stopLoss: '', positionSize: '',
  };

  // Replace the placeholder card
  const card = grid.querySelector(`[data-ticker="${ticker}"]`);
  if (card) {
    const tmp = document.createElement('div');
    tmp.innerHTML = renderRecCard(placeholderR, resolvedAi);
    card.replaceWith(tmp.firstElementChild);
  }
}

async function loadSavedSearches() {
  if (!_currentUser) return;
  try {
    const { data, error } = await db
      .from('stock_searches')
      .select('ticker, name')
      .eq('user_id', _currentUser.id)
      .order('searched_at', { ascending: false })
      .limit(12);
    if (error || !data?.length) return;
    for (const row of data) {
      if (_searchedTickers.has(row.ticker)) continue;
      // Bypass the dedup check in useLookupResult — add to set first
      _searchedTickers.add(row.ticker);
      const section = $('searches-section');
      const grid    = $('recs-grid-searches');
      section.style.display = 'block';
      const placeholderR = {
        ticker: row.ticker, name: row.name || row.ticker,
        price: '—', change: '+0.00%', weekData: [], direction: 'up',
        weekTrend: 'up', weekPct: 0, rsi: 50, volRatio: 1, rangePct: 50, streak: 1,
      };
      const tmp = document.createElement('div');
      tmp.innerHTML = renderRecCard(placeholderR, null);
      grid.appendChild(tmp.firstElementChild);
    }
    // Enrich sequentially (Yahoo + AI) — reuse the same logic as useLookupResult
    for (const row of data) {
      if (!$('recs-grid-searches').querySelector(`[data-ticker="${row.ticker}"]`)) continue;
      const placeholderR = {
        ticker: row.ticker, name: row.name || row.ticker,
        price: '—', change: '+0.00%', weekData: [], direction: 'up',
        weekTrend: 'up', weekPct: 0, rsi: 50, volRatio: 1, rangePct: 50, streak: 1,
      };
      try {
        const yRes = await fetch(`${SUPABASE_URL}/functions/v1/analyze-stock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ ticker: '__yahoo__', yTicker: row.ticker, range: '5d', interval: '1d' })
        });
        if (yRes.ok) {
          const yData = await yRes.json();
          const result = yData.result;
          if (result) {
            const raw    = result.indicators?.adjclose?.[0]?.adjclose || result.indicators?.quote?.[0]?.close || [];
            const closes = raw.filter(p => p != null && !isNaN(p) && p > 0);
            const vols   = (result.indicators?.quote?.[0]?.volume || []).filter(v => v != null && v > 0);
            const meta   = result.meta || {};
            if (closes.length >= 2) {
              const price    = meta.regularMarketPrice ?? closes[closes.length - 1];
              const prev     = closes[closes.length - 2];
              const todayPct = ((price - prev) / prev) * 100;
              const weekPct  = ((price - closes[0]) / closes[0]) * 100;
              let gains = 0, losses = 0;
              const period = Math.min(5, closes.length - 1);
              for (let i = closes.length - period; i < closes.length; i++) {
                const d = closes[i] - closes[i-1];
                if (d > 0) gains += d; else losses += Math.abs(d);
              }
              const rsi      = losses === 0 ? 100 : Math.round(100 - 100 / (1 + gains / losses));
              const todayVol = vols[vols.length - 1] ?? 0;
              const avgVol   = vols.length > 1 ? vols.slice(0,-1).reduce((a,b)=>a+b,0)/(vols.length-1) : todayVol;
              const volRatio = avgVol > 0 ? parseFloat((todayVol / avgVol).toFixed(2)) : 1;
              const high5    = Math.max(...closes), low5 = Math.min(...closes);
              const rangePct = high5 > low5 ? Math.round(((price - low5) / (high5 - low5)) * 100) : 50;
              let streak = 1;
              for (let i = closes.length - 2; i > 0; i--) {
                if ((closes[i] > closes[i-1]) === (todayPct >= 0)) streak++; else break;
              }
              placeholderR.price     = price.toFixed(2);
              placeholderR.change    = (todayPct >= 0 ? '+' : '') + todayPct.toFixed(2) + '%';
              placeholderR.weekData  = closes.slice(-5).map(p => parseFloat(p.toFixed(2)));
              placeholderR.direction = todayPct >= 0 ? 'up' : 'down';
              placeholderR.weekTrend = weekPct  >= 0 ? 'up' : 'down';
              placeholderR.weekPct   = parseFloat(weekPct.toFixed(2));
              placeholderR.rsi       = rsi; placeholderR.volRatio = volRatio;
              placeholderR.rangePct  = rangePct; placeholderR.streak = streak;
              placeholderR.name      = meta.longName || meta.shortName || row.name || row.ticker;
            }
          }
        }
      } catch(e) { /* use placeholder */ }
      const metrics = { rsi: placeholderR.rsi, volRatio: placeholderR.volRatio, rangePct: placeholderR.rangePct, streak: placeholderR.streak, weekPct: placeholderR.weekPct, weekTrend: placeholderR.weekTrend, direction: placeholderR.direction };
      const ai = await fetchAISignal(row.ticker, placeholderR.price, placeholderR.change, placeholderR.name, metrics);
      const resolvedAi = ai || { signal: placeholderR.direction === 'up' ? 'BUY' : 'SELL', confidence: 'Low', rationale: 'Signal temporarily unavailable.', action: '', entry: '', stopLoss: '', positionSize: '' };
      const card = $('recs-grid-searches').querySelector(`[data-ticker="${row.ticker}"]`);
      if (card) { const t = document.createElement('div'); t.innerHTML = renderRecCard(placeholderR, resolvedAi); card.replaceWith(t.firstElementChild); }
    }
  } catch(e) { /* silent */ }
}

function clearSearches() {
  _searchedTickers.clear();
  $('recs-grid-searches').innerHTML = '';
  $('searches-section').style.display = 'none';
}

function clearLookup() {
  const inp = $('lookup-input'); if (inp) inp.value = '';
  const res = $('lookup-results'); if (res) res.innerHTML = '';
  const err = $('lookup-error'); if (err) err.textContent = '';
  const clr = $('lookup-clear-btn'); if (clr) clr.style.display = 'none';
}

function toggleLookupClear() {
  const btn = $('lookup-clear-btn');
  const inp = $('lookup-input');
  if (btn && inp) btn.style.display = inp.value.length ? 'flex' : 'none';
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLookupPanel();
  if (e.key === 'Enter' && document.activeElement?.id === 'lookup-input') lookupTicker();
});
