/* ── recs-searches.js — saved searches, lookup panel, enrich ── */
const _searchedTickers = new Set();

function _updateSearchesClearBtn() {
  const btn = $('searches-clear-btn');
  const grid = $('recs-grid-searches');
  if (!btn || !grid) return;
  btn.style.display = grid.querySelectorAll('.rec-card[data-ticker]').length ? 'inline' : 'none';
}

function _wrapSearchCard(html, ticker) {
  // Injects a remove (×) button into a rendered card's HTML string
  return html.replace(
    `data-ticker="${ticker}">`,
    `data-ticker="${ticker}" data-search="true">
      <button class="search-remove-btn" title="Remove" onclick="removeSearch('${ticker}',event)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>`
  );
}

async function removeSearch(ticker, e) {
  if (e) e.stopPropagation();
  _searchedTickers.delete(ticker);
  // Remove from DB
  if (_currentUser) {
    await db.from('stock_searches').delete().eq('user_id', _currentUser.id).eq('ticker', ticker);
  }
  // Remove card from DOM
  const card = $('recs-grid-searches').querySelector(`[data-ticker="${ticker}"]`);
  if (card) card.remove();
  // Show empty state if no cards left
  const grid = $('recs-grid-searches');
  if (!grid.querySelectorAll('.rec-card[data-ticker]').length) {
    grid.innerHTML = '<div class="movers-empty" style="grid-column:1/-1;font-size:13px;color:var(--text-dim);font-style:italic;">Use the Stock Lookup above to analyse any stock — searches are saved here.</div>';
  }
  _updateSearchesClearBtn();
}

async function clearSearches() {
  _searchedTickers.clear();
  if (_currentUser) {
    await db.from('stock_searches').delete().eq('user_id', _currentUser.id);
  }
  $('recs-grid-searches').innerHTML = '<div class="movers-empty" style="grid-column:1/-1;font-size:13px;color:var(--text-dim);font-style:italic;">Use the Stock Lookup above to analyse any stock — searches are saved here.</div>';
  _updateSearchesClearBtn();
}

async function loadSavedSearches() {
  if (!_currentUser) return;
  const grid = $('recs-grid-searches');
  try {
    const { data, error } = await db
      .from('stock_searches')
      .select('ticker, name')
      .eq('user_id', _currentUser.id)
      .order('searched_at', { ascending: false })
      .limit(12);
    if (error) throw error;
    if (!data || !data.length) return;
    grid.innerHTML = '';
    for (const row of data) {
      _searchedTickers.add(row.ticker);
      const placeholderR = {
        ticker: row.ticker, name: row.name || row.ticker,
        price: '—', change: '+0.00%', weekData: [], direction: 'up',
        weekTrend: 'up', weekPct: 0, rsi: 50, volRatio: 1, rangePct: 50, streak: 1,
      };
      const tmp = document.createElement('div');
      tmp.innerHTML = _wrapSearchCard(renderRecCard(placeholderR, null), row.ticker);
      grid.appendChild(tmp.firstElementChild);
    }
    _updateSearchesClearBtn();
    for (const row of data) {
      await _enrichSearchCard(row.ticker, row.name || row.ticker);
    }
  } catch(e) {
    if (grid && !grid.querySelector('.rec-card')) {
      grid.innerHTML = `<div class="movers-empty" style="grid-column:1/-1;font-size:13px;color:var(--text-dim);font-style:italic;">
        Could not load saved searches — <button onclick="loadSavedSearches()" style="background:none;border:none;color:var(--accent);cursor:pointer;font-family:inherit;font-size:inherit;padding:0;text-decoration:underline;">retry</button>
      </div>`;
    }
  }
}

async function _enrichSearchCard(ticker, name) {
  const grid = $('recs-grid-searches');
  if (!grid) return;
  const placeholderR = {
    ticker, name, price: '—', change: '+0.00%', weekData: [], direction: 'up',
    weekTrend: 'up', weekPct: 0, rsi: 50, volRatio: 1, rangePct: 50, streak: 1,
  };
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
          const price      = meta.regularMarketPrice ?? closes[closes.length - 1];
          const prev       = closes[closes.length - 2];
          const todayPct   = ((price - prev) / prev) * 100;
          const weekPct    = ((price - closes[0]) / closes[0]) * 100;
          let gains = 0, losses = 0;
          const period = Math.min(5, closes.length - 1);
          for (let i = closes.length - period; i < closes.length; i++) {
            const d = closes[i] - closes[i - 1];
            if (d > 0) gains += d; else losses += Math.abs(d);
          }
          const rsi = losses === 0 ? 100 : Math.round(100 - 100 / (1 + gains / losses));
          const todayVol = vols[vols.length - 1] ?? 0;
          const avgVol   = vols.length > 1 ? vols.slice(0, -1).reduce((a, b) => a + b, 0) / (vols.length - 1) : todayVol;
          const volRatio = avgVol > 0 ? parseFloat((todayVol / avgVol).toFixed(2)) : 1;
          const high5 = Math.max(...closes), low5 = Math.min(...closes);
          const rangePct = high5 > low5 ? Math.round(((price - low5) / (high5 - low5)) * 100) : 50;
          let streak = 1;
          for (let i = closes.length - 2; i > 0; i--) {
            if ((closes[i] > closes[i - 1]) === (todayPct >= 0)) streak++; else break;
          }
          const sign = todayPct >= 0 ? '+' : '';
          placeholderR.price     = price.toFixed(2);
          placeholderR.change    = `${sign}${todayPct.toFixed(2)}%`;
          placeholderR.weekData  = closes.slice(-5).map(p => parseFloat(p.toFixed(2)));
          placeholderR.direction = todayPct >= 0 ? 'up' : 'down';
          placeholderR.weekTrend = weekPct >= 0 ? 'up' : 'down';
          placeholderR.weekPct   = parseFloat(weekPct.toFixed(2));
          placeholderR.rsi = rsi; placeholderR.volRatio = volRatio;
          placeholderR.rangePct = rangePct; placeholderR.streak = streak;
          placeholderR.name = meta.longName || meta.shortName || name || ticker;
        }
      }
    }
  } catch { /* use placeholder */ }
  const ai = await fetchAISignal(ticker, placeholderR.price, placeholderR.change, placeholderR.name, {
    rsi: placeholderR.rsi, volRatio: placeholderR.volRatio, rangePct: placeholderR.rangePct,
    streak: placeholderR.streak, weekPct: placeholderR.weekPct,
    weekTrend: placeholderR.weekTrend, direction: placeholderR.direction,
  });
  const resolvedAi = ai || {
    signal: placeholderR.direction === 'up' ? 'BUY' : 'SELL',
    confidence: 'Low', rationale: 'Signal temporarily unavailable.',
    action: '', entry: '', stopLoss: '', positionSize: '',
  };
  const card = grid?.querySelector(`[data-ticker="${ticker}"]`);
  if (card) {
    const tmp = document.createElement('div');
    tmp.innerHTML = _wrapSearchCard(renderRecCard(placeholderR, resolvedAi), ticker);
    card.replaceWith(tmp.firstElementChild);
  }
}

async function useLookupResult(ticker, name) {
  if (_searchedTickers.has(ticker)) {
    $('lookup-results').innerHTML = `<div class="lookup-empty" style="color:var(--text-dim);">${ticker} is already in Searches.</div>`;
    setTimeout(closeLookupPanel, 1400);
    return;
  }
  _searchedTickers.add(ticker);

  // Save to Supabase
  if (_currentUser) {
    db.from('stock_searches').delete()
      .eq('user_id', _currentUser.id).eq('ticker', ticker)
      .then(() => db.from('stock_searches').insert({
        user_id: _currentUser.id, ticker, name: name || ticker,
      }));
  }

  $('lookup-results').innerHTML = `<div class="lookup-empty" style="color:var(--green);">✓ Analysing <strong style="font-family:var(--mono)">${ticker}</strong>…</div>`;
  setTimeout(closeLookupPanel, 900);

  // Add placeholder card to top of searches grid
  const grid = $('recs-grid-searches');
  // Remove empty-state message if present
  const emptyMsg = grid.querySelector('.movers-empty');
  if (emptyMsg) emptyMsg.remove();

  const placeholderR = {
    ticker, name: name || ticker, price: '—', change: '+0.00%',
    weekData: [], direction: 'up', weekTrend: 'up', weekPct: 0,
    rsi: 50, volRatio: 1, rangePct: 50, streak: 1,
  };
  const tmp = document.createElement('div');
  tmp.innerHTML = _wrapSearchCard(renderRecCard(placeholderR, null), ticker);
  grid.insertBefore(tmp.firstElementChild, grid.firstChild);

  _updateSearchesClearBtn();
  setTimeout(() => $('searches-section').scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);

  await _enrichSearchCard(ticker, name || ticker);
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
