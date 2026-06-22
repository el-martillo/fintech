/* ── main-analysis.js — stock analysis, history, theme, ticker lookup ── */

function setTicker(t) {
  $('ticker-input').value = t;
  analyzeStock();
}

// Called by mover cards — passes real Yahoo Finance figures through
function setTickerFromMover(ticker, price, change) {
  liveMarketData[ticker] = { price, change };
  $('ticker-input').value = ticker;
  analyzeStock();
}

function showError(msg) {
  const el = $('error-msg');
  el.textContent = msg;
  el.style.display = 'block';
}
function clearError() { $('error-msg').style.display = 'none'; }

function setBtnLoading(loading) {
  const btn = $('analyze-btn');
  btn.disabled = loading;
  $('btn-label').innerHTML = loading
    ? '<span class="spinner"></span>'
    : 'Analyze';
}

/* ── Main analysis ── */
async function analyzeStock() {
  const raw = $('ticker-input').value.trim().toUpperCase();
  if (!raw) { showError('Please enter a ticker symbol.'); return; }
  clearError();
  hide('result');
  show('loading-state');
  setBtnLoading(true);

  try {
    const analysis = await fetchAnalysis(raw);
    // Override AI-estimated figures with real Yahoo Finance data if available
    const live = liveMarketData[raw];
    if (live) {
      analysis.price        = live.price;
      analysis.priceChange1d = live.change;
    }
    await saveToSupabase(analysis);
    renderResult(analysis);
    loadHistory();
  } catch (err) {
    hide('loading-state');
    showError(err.message || 'Analysis failed. Please try again.');
  } finally {
    setBtnLoading(false);
  }
}

/* ── Call Anthropic via Supabase Edge Function proxy (avoids CORS) ── */
async function fetchAnalysis(ticker) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-stock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ ticker })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return await res.json();
}

/* ── localStorage history (max 5) ── */
const LS_KEY = 'etoro_history';

function lsSave(a) {
  let history = lsLoad();
  history = history.filter(h => h.ticker !== a.ticker); // dedupe: move to top
  history.unshift({
    ticker:       a.ticker,
    companyName:  a.companyName,
    signal:       a.signal,
    confidence:   a.confidence,
    price:        a.price,
    priceChange1d: a.priceChange1d,
    weekChange:   a.weekChange,
    peRatio:      a.peRatio,
    marketCap:    a.marketCap,
    sector:       a.sector,
    pros:         a.pros,
    cons:         a.cons,
    neutral:      a.neutral,
    tradeSummary: a.tradeSummary,
    etoroUrl:     a.etoroUrl,
    savedAt:      new Date().toISOString()
  });
  history = history.slice(0, 4);
  try { localStorage.setItem(LS_KEY, JSON.stringify(history)); } catch(e) {}
}

function lsLoad() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch(e) { return []; }
}

/* ── Save to Supabase ── */
async function saveToSupabase(a) {
  lsSave(a);
  if (!_currentUser) return;
  const { error } = await db.from('stock_analyses').insert({
    ticker:        a.ticker, company_name: a.companyName, signal: a.signal,
    confidence:    a.confidence, price: a.price, price_change: a.priceChange1d,
    week_change:   a.weekChange, pe_ratio: a.peRatio, market_cap: a.marketCap,
    sector:        a.sector, pros: a.pros, cons: a.cons, neutral: a.neutral,
    trade_summary: a.tradeSummary, etoro_url: a.etoroUrl, user_id: _currentUser.id
  });
  if (error) console.warn('Supabase save failed:', error.message);
}

/* ── Render result ── */
function renderResult(d) {
  hide('loading-state');

  $('res-ticker').textContent  = d.ticker;
  $('res-company').textContent = `${d.companyName} · ${d.sector}`;

  // Update chart title labels
  currentChartCompany = d.companyName || '';
  currentChartSector  = d.sector || '';
  _updateChartTitles();

  $('res-signal').innerHTML = `<span class="signal-pill signal-${d.signal}">${signalIcon(d.signal)} ${d.signal} · ${d.confidence}</span>`;

  const isPos1d = (d.priceChange1d || '').startsWith('+');
  const isPosWk = (d.weekChange    || '').startsWith('+');
  $('res-metrics').innerHTML = [
    { label: 'Price',     value: '$' + d.price,       sub: `<span class="${isPos1d ? 'pos' : 'neg'}">${d.priceChange1d} today</span>` },
    { label: '1-week',    value: d.weekChange,         sub: `<span class="${isPosWk ? 'pos' : 'neg'}">performance</span>` },
    { label: 'P/E ratio', value: d.peRatio,            sub: 'valuation' },
    { label: 'Mkt cap',   value: d.marketCap,          sub: '' }
  ].map(m => `
    <div class="metric">
      <div class="metric-label">${m.label}</div>
      <div class="metric-value">${m.value}</div>
      <div class="metric-sub">${m.sub}</div>
    </div>`).join('');

  const items = [
    ...(d.pros    || []).map(p => `<li><span class="f-icon pos">+</span><span>${p}</span></li>`),
    ...(d.cons    || []).map(c => `<li><span class="f-icon neg">−</span><span>${c}</span></li>`),
    ...(d.neutral || []).map(n => `<li><span class="f-icon" style="color:var(--text-dim)">·</span><span>${n}</span></li>`)
  ];
  $('res-factors').innerHTML = items.join('');
  $('res-trade').textContent = d.tradeSummary;

  const link = $('res-etoro-link');
  link.href = d.etoroUrl || `https://www.etoro.com/markets/${d.ticker.toLowerCase()}`;

  show('result');

  // Load price chart for this ticker
  currentChartTicker = d.ticker;
  chartCache = {}; // clear cache for new ticker
  document.querySelectorAll('.chart-tab').forEach((b,i) => b.classList.toggle('active', i===0));
  loadPriceChart(d.ticker, '1D');
}

function signalIcon(signal) {
  return signal === 'BUY'
    ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>'
    : signal === 'SELL'
    ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>'
    : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
}

/* ── Load history — localStorage primary, Supabase fallback ── */
async function loadHistory() {
  const local = lsLoad();

  if (local.length) {
    renderHistory(local.map(h => ({
      ticker:       h.ticker,
      company_name: h.companyName,
      signal:       h.signal,
      confidence:   h.confidence,
      created_at:   h.savedAt,
      _local:       h
    })));
    return;
  }

  // Fallback: Supabase if localStorage is empty
  const { data, error } = await db
    .from('stock_analyses')
    .select('id, ticker, company_name, signal, confidence, created_at')
    .eq('user_id', _currentUser.id)
    .order('created_at', { ascending: false })
    .limit(12);

  if (error || !data?.length) {
    $('history-grid').innerHTML = '<div class="history-empty">No analyses yet.</div>';
    $('history-count').textContent = '';
    return;
  }
  renderHistory(data);
}

function renderHistory(rows) {
  $('history-count').textContent = `${rows.length} saved`;
  $('history-clear-btn').style.display = 'inline';
  $('history-grid').innerHTML = rows.map(row => {
    const date  = new Date(row.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const color = row.signal === 'BUY' ? 'var(--green)' : row.signal === 'SELL' ? 'var(--red)' : 'var(--amber)';
    const clickHandler = row._local
      ? `loadFromLocal('${row.ticker}')`
      : `loadFromHistory(${row.id})`;
    return `
      <div class="history-card" onclick="${clickHandler}">
        <div class="history-ticker">${row.ticker}</div>
        <div class="history-meta">${row.company_name || ''} · ${date}</div>
        <div class="history-signal" style="color:${color}">${row.signal} · ${row.confidence}</div>
      </div>`;
  }).join('');
}

function clearHistory() {
  try { localStorage.removeItem(LS_KEY); } catch(e) {}
  $('history-grid').innerHTML = '<div class="history-empty">No analyses yet. Search a ticker above.</div>';
  $('history-count').textContent = '';
  $('history-clear-btn').style.display = 'none';
}

function loadFromLocal(ticker) {
  const history = lsLoad();
  const a = history.find(h => h.ticker === ticker);
  if (!a) { showError('Could not load saved analysis.'); return; }
  $('ticker-input').value = a.ticker;
  clearError();
  hide('loading-state');
  renderResult(a);
}

async function loadFromHistory(id) {
  const { data, error } = await db
    .from('stock_analyses')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) { showError('Could not load saved analysis.'); return; }

  const a = {
    ticker:       data.ticker,
    companyName:  data.company_name,
    signal:       data.signal,
    confidence:   data.confidence,
    price:        data.price,
    priceChange1d: data.price_change,
    weekChange:   data.week_change,
    peRatio:      data.pe_ratio,
    marketCap:    data.market_cap,
    sector:       data.sector,
    pros:         data.pros,
    cons:         data.cons,
    neutral:      data.neutral,
    tradeSummary: data.trade_summary,
    etoroUrl:     data.etoro_url
  };
  $('ticker-input').value = a.ticker;
  clearError();
  hide('loading-state');
  renderResult(a);
}

/* ── Keyboard support ── */
$('ticker-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') analyzeStock();
});

/* ── Theme toggle ── */
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  document.getElementById('theme-label').textContent = isLight ? 'Dark mode' : 'Light mode';
  document.getElementById('icon-moon').style.display = isLight ? 'none' : 'block';
  document.getElementById('icon-sun').style.display  = isLight ? 'block' : 'none';
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
}
if (localStorage.getItem('theme') === 'light') toggleTheme();

/* ── Ticker lookup — via Edge Function proxy ── */
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
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    const results = data.lookupResults || [];
    if (!results.length) {
      $('lookup-results').innerHTML = '<div class="lookup-empty">No matches found.</div>';
    } else {
      $('lookup-results').innerHTML = results.map(r => `
        <div class="lookup-item" onclick="useLookupResult('${r.ticker}')">
          <span class="lookup-ticker">${r.ticker}</span>
          <span class="lookup-name">${r.name}</span>
          <span class="lookup-use">Use →</span>
        </div>`).join('');
    }
  } catch (err) {
    $('lookup-error').textContent = 'Lookup failed. Try again.';
  } finally {
    $('lookup-loading').style.display = 'none';
    $('lookup-btn').disabled = false;
  }
}

function useLookupResult(ticker) {
  $('ticker-input').value = ticker;
  $('lookup-results').innerHTML = '';
  $('lookup-input').value = '';
  $('lookup-clear-btn').style.display = 'none';
  analyzeStock();
}

function clearLookup() {
  $('lookup-input').value = '';
  $('lookup-results').innerHTML = '';
  $('lookup-error').textContent = '';
  $('lookup-clear-btn').style.display = 'none';
  $('lookup-input').focus();
}

function toggleLookupClear() {
  $('lookup-clear-btn').style.display = $('lookup-input').value.length ? 'flex' : 'none';
}

function clearResult() {
  hide('result');
  $('ticker-input').value = '';
  clearError();
}

$('lookup-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') lookupTicker();
});
