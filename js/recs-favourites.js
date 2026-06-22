/* ── recs-favourites.js — price alerts, favourites, star toggle ── */
/* ── Price Alerts ── */
let _alerts = new Set();
let _whatsappNumber = '';
let _callmebotKey = '';

function openAlertModal(ticker, name, currentPrice, e) {
  if (e) e.stopPropagation();
  document.getElementById('alert-modal-overlay')?.remove();
  const existing = _alerts.has(ticker);
  const overlay = document.createElement('div');
  overlay.id = 'alert-modal-overlay';
  overlay.className = 'alert-modal-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="alert-modal">
      <h3>🔔 Price Alert — ${ticker.replace('-USD','')}</h3>
      <p>${name} · Current: $${currentPrice}</p>
      ${existing ? `<p style="color:var(--accent);font-size:12px;margin-top:-8px;margin-bottom:12px;">⚡ Alert already set — saving will update it.</p>` : ''}
      <div class="alert-field">
        <label>Notify when price is</label>
        <select id="alert-direction">
          <option value="above">Above target</option>
          <option value="below">Below target</option>
        </select>
      </div>
      <div class="alert-field">
        <label>Target price ($)</label>
        <input type="number" id="alert-price" placeholder="e.g. 250.00" step="0.01" min="0" value="${parseFloat(currentPrice).toFixed(2)}"/>
      </div>
      <div class="alert-field">
        <label>WhatsApp number (with country code)</label>
        <input type="tel" id="alert-phone" placeholder="e.g. +447911123456" value="${_whatsappNumber || ''}"/>
      </div>
      <div class="alert-field">
        <label>CallMeBot API Key</label>
        <input type="text" id="alert-apikey" placeholder="Your CallMeBot API key" value="${_callmebotKey || ''}"/>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">
          First time? WhatsApp <strong>+34 644 81 58 78</strong> with <em>"I allow callmebot to send me messages"</em> — free, no signup.
        </div>
      </div>
      <div id="alert-msg" style="display:none;font-size:12px;padding:7px 10px;border-radius:6px;margin-top:8px;"></div>
      <div class="alert-btn-row">
        <button class="alert-cancel-btn" onclick="document.getElementById('alert-modal-overlay').remove()">Cancel</button>
        ${existing ? `<button class="alert-cancel-btn" style="color:var(--red);border-color:rgba(239,68,68,0.3);" onclick="deleteAlert('${ticker}')">Remove</button>` : ''}
        <button class="alert-save-btn" onclick="saveAlert('${ticker}','${name.replace(/'/g,"\\'")}')">Save Alert</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function loadAlerts() {
  if (!_currentUser) return;
  try {
    const { data } = await db.from('price_alerts').select('ticker').eq('user_id', _currentUser.id).eq('triggered', false);
    _alerts = new Set((data || []).map(a => a.ticker));
    // Refresh bell icons
    document.querySelectorAll('.alert-btn').forEach(btn => {
      const card = btn.closest('[data-ticker]');
      if (!card) return;
      const active = _alerts.has(card.dataset.ticker);
      btn.classList.toggle('alert-active', active);
      const svg = btn.querySelector('svg');
      if (svg) svg.setAttribute('fill', active ? 'rgba(108,99,255,0.2)' : 'none');
    });
  } catch { /* silent */ }
}

async function saveAlert(ticker, name) {
  const price  = parseFloat(document.getElementById('alert-price')?.value);
  const dir    = document.getElementById('alert-direction')?.value;
  const phone  = document.getElementById('alert-phone')?.value?.trim();
  const apikey = document.getElementById('alert-apikey')?.value?.trim();

  if (!price || price <= 0) { _alertMsg('Enter a valid price.', 'err'); return; }
  if (!phone || !phone.startsWith('+')) { _alertMsg('Enter phone with country code e.g. +447911123456', 'err'); return; }
  if (!apikey) { _alertMsg('Enter your CallMeBot API key.', 'err'); return; }

  _whatsappNumber = phone;
  _callmebotKey   = apikey;

  // Save phone + apikey to profile
  db.from('profiles').upsert({ id: _currentUser.id, whatsapp_number: phone, callmebot_apikey: apikey }, { onConflict: 'id' });

  _alertMsg('Saving…', 'ok');
  try {
    const { error } = await db.from('price_alerts').upsert({
      user_id: _currentUser.id, ticker, name: name || ticker,
      target_price: price, direction: dir || 'above',
      triggered: false,
    }, { onConflict: 'user_id,ticker' });
    if (error) throw error;

    _alerts.add(ticker);
    document.querySelectorAll(`[data-ticker="${ticker}"] .alert-btn`).forEach(btn => {
      btn.classList.add('alert-active');
      const svg = btn.querySelector('svg'); if (svg) svg.setAttribute('fill', 'rgba(108,99,255,0.2)');
    });
    _alertMsg(`✓ Alert set — notify when ${dir === 'below' ? 'below' : 'above'} $${price}`, 'ok');
    setTimeout(() => document.getElementById('alert-modal-overlay')?.remove(), 1400);
  } catch(e) { _alertMsg('Failed to save — ' + (e.message || 'try again.'), 'err'); }
}

async function deleteAlert(ticker) {
  await db.from('price_alerts').delete().eq('user_id', _currentUser.id).eq('ticker', ticker);
  _alerts.delete(ticker);
  document.querySelectorAll(`[data-ticker="${ticker}"] .alert-btn`).forEach(btn => {
    btn.classList.remove('alert-active');
    const svg = btn.querySelector('svg'); if (svg) svg.setAttribute('fill', 'none');
  });
  document.getElementById('alert-modal-overlay')?.remove();
}

function _alertMsg(msg, type) {
  const el = document.getElementById('alert-msg');
  if (!el) return;
  el.style.display = 'block';
  el.textContent = msg;
  el.style.background = type === 'err' ? 'var(--red-bg)' : 'var(--green-bg)';
  el.style.color = type === 'err' ? 'var(--red)' : 'var(--green)';
  el.style.border = type === 'err' ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(34,197,94,0.2)';
}
let _favourites = new Set(); // Set of tickers

async function loadFavourites() {
  if (!_currentUser) return;
  const grid = $('recs-grid-favs');
  try {
    const { data, error } = await db.from('stock_favourites').select('ticker').eq('user_id', _currentUser.id);
    if (error) throw error;
    _favourites = new Set((data || []).map(r => r.ticker));
    renderFavsSection();
    updateFavCount();
  } catch (e) {
    // Show error state inside the favourites grid
    if (grid) grid.innerHTML = `<div class="favs-empty" style="color:var(--text-dim);">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;margin-right:5px;opacity:0.5;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Could not load favourites — <button onclick="loadFavourites()" style="background:none;border:none;color:var(--accent);cursor:pointer;font-family:inherit;font-size:inherit;padding:0;text-decoration:underline;">retry</button>
    </div>`;
  }
}

async function toggleFavourite(ticker, name, e) {
  if (e) e.stopPropagation();
  if (!_currentUser) return;
  const isFav = _favourites.has(ticker);
  if (isFav) {
    _favourites.delete(ticker);
    await db.from('stock_favourites').delete().eq('user_id', _currentUser.id).eq('ticker', ticker);
  } else {
    _favourites.add(ticker);
    await db.from('stock_favourites').upsert({ user_id: _currentUser.id, ticker, name }, { onConflict: 'user_id,ticker' });
  }
  // Update all star buttons for this ticker everywhere on page
  document.querySelectorAll(`[data-ticker="${ticker}"] .fav-btn`).forEach(btn => {
    btn.classList.toggle('fav-active', !isFav);
    const svg = btn.querySelector('svg');
    if (svg) {
      svg.setAttribute('fill', !isFav ? 'var(--amber)' : 'none');
      svg.setAttribute('stroke', !isFav ? 'var(--amber)' : 'currentColor');
    }
  });
  renderFavsSection();
  updateFavCount();
}

function updateFavCount() {
  const n = _favourites.size;
  const countEl = $('favs-count');
  if (countEl) countEl.textContent = n;
  const navCount = $('nav-fav-count');
  if (navCount) { navCount.textContent = n; navCount.style.display = n ? 'inline' : 'none'; }
}

async function renderFavsSection() {
  const grid = $('recs-grid-favs');
  if (!grid) return;
  if (!_favourites.size) {
    grid.innerHTML = '<div class="favs-empty">Star any stock card to add it to your favourites list.</div>';
    return;
  }
  const MAX_FAVS = 6;
  const allTickers = [..._favourites];
  const tickers = allTickers.slice(0, MAX_FAVS);
  const overflow = allTickers.length - tickers.length;

  grid.innerHTML = tickers.map(ticker => {
    const md = liveMarketData[ticker];
    const placeholder = {
      ticker, name: ticker, price: md?.price || '—',
      change: md?.change || '—', direction: 'up',
      weekData: [], rsi: 50, volRatio: 1, rangePct: 50, streak: 1,
      weekPct: 0, weekTrend: 'up',
    };
    return renderRecCard(placeholder, null);
  }).join('') + (overflow > 0 ? `<div class="favs-limit-note" style="grid-column:1/-1;">+${overflow} more · showing first 6</div>` : '');

  for (const ticker of tickers) {
    enrichFavCard(ticker);
  }
}

async function enrichFavCard(ticker) {
  const grid = $('recs-grid-favs');
  if (!grid) return;
  const placeholderR = {
    ticker, name: ticker, price: '—', change: '—', direction: 'up',
    weekData: [], rsi: 50, volRatio: 1, rangePct: 50, streak: 1,
    weekPct: 0, weekTrend: 'up',
  };
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d&includeAdjustedClose=true`;
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const result = json.chart?.result?.[0];
      if (result) {
        const meta   = result.meta || {};
        const closes = result.indicators?.adjclose?.[0]?.adjclose || result.indicators?.quote?.[0]?.close || [];
        const vols   = result.indicators?.quote?.[0]?.volume || [];
        const price  = meta.regularMarketPrice || closes[closes.length-1] || 0;
        const prev   = meta.chartPreviousClose || closes[0] || price;
        const todayPct = prev ? ((price - prev) / prev) * 100 : 0;
        const weekPct  = closes.length > 1 ? ((closes[closes.length-1] - closes[0]) / Math.abs(closes[0])) * 100 : 0;
        const gains = []; for (let i=1;i<closes.length;i++) gains.push(closes[i]-closes[i-1]>0?closes[i]-closes[i-1]:0);
        const losses= []; for (let i=1;i<closes.length;i++) losses.push(closes[i]-closes[i-1]<0?Math.abs(closes[i]-closes[i-1]):0);
        const avgG=gains.reduce((a,b)=>a+b,0)/Math.max(gains.length,1), avgL=losses.reduce((a,b)=>a+b,0)/Math.max(losses.length,1);
        const rsi = Math.round(avgL===0 ? 100 : 100-(100/(1+(avgG/avgL))));
        const todayVol = vols[vols.length-1]||0, avgVol = vols.slice(0,-1).reduce((a,b)=>a+b,0)/Math.max(vols.length-1,1);
        const volRatio = avgVol>0 ? parseFloat((todayVol/avgVol).toFixed(2)) : 1;
        const high5=Math.max(...closes), low5=Math.min(...closes);
        const rangePct = high5>low5 ? Math.round(((price-low5)/(high5-low5))*100) : 50;
        let streak=1; for (let i=closes.length-2;i>0;i--) { if((closes[i]>closes[i-1])===(todayPct>=0))streak++;else break; }
        const sign=todayPct>=0?'+':'';
        placeholderR.price    = price.toFixed(2);
        placeholderR.change   = `${sign}${todayPct.toFixed(2)}%`;
        placeholderR.weekData = closes.slice(-5).map(p=>parseFloat(p.toFixed(2)));
        placeholderR.direction= todayPct>=0?'up':'down';
        placeholderR.weekTrend= weekPct>=0?'up':'down';
        placeholderR.weekPct  = parseFloat(weekPct.toFixed(2));
        placeholderR.rsi=rsi; placeholderR.volRatio=volRatio;
        placeholderR.rangePct=rangePct; placeholderR.streak=streak;
        placeholderR.name = meta.longName || meta.shortName || ticker;
        liveMarketData[ticker] = { price: placeholderR.price, change: placeholderR.change };
      }
    }
  } catch(e) { /* use placeholder */ }
  const ai = await fetchAISignal(ticker, placeholderR.price, placeholderR.change, placeholderR.name, {
    rsi: placeholderR.rsi, volRatio: placeholderR.volRatio, rangePct: placeholderR.rangePct,
    streak: placeholderR.streak, weekPct: placeholderR.weekPct, weekTrend: placeholderR.weekTrend, direction: placeholderR.direction
  });
  const resolvedAi = ai || { signal: placeholderR.direction==='up'?'BUY':'SELL', confidence:'Low', rationale:'Signal temporarily unavailable.', action:'', entry:'', stopLoss:'', positionSize:'' };
  if (grid) {
    const card = grid.querySelector(`[data-ticker="${ticker}"]`);
    if (card) {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderRecCard(placeholderR, resolvedAi);
      card.replaceWith(tmp.firstElementChild);
    }
  }
}

function toggleFavsSection() {
  const row  = $('favs-toggle-row');
  const body = $('favs-body');
  if (!row || !body) return;
  const isOpen = body.classList.toggle('open');
  row.classList.toggle('open', isOpen);
  if (isOpen) renderFavsSection();
}

function scrollToFavourites() {
  const section = $('favs-section');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Open if closed
    const body = $('favs-body');
    if (body && !body.classList.contains('open')) toggleFavsSection();
  }
}

