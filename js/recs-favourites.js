/* ── recs-favourites.js — favourites, price alerts, enrichFavCard ── */

/* ── Favourites & Alerts state ── */
let _favourites     = new Set();
let _alerts         = new Set();
let _whatsappNumber = '';
let _callmebotKey   = '';

async function loadFavourites() {
  if (!_currentUser) return;
  const grid = $('recs-grid-favs');
  try {
    const { data, error } = await db.from('stock_favourites').select('ticker').eq('user_id', _currentUser.id);
    if (error) throw error;
    _favourites = new Set((data || []).map(r => r.ticker));
    renderFavsSection();
    updateFavCount();
  } catch(e) {
    if (grid) grid.innerHTML = '<div style="grid-column:1/-1;font-size:13px;color:var(--text-dim);padding:8px 0;">Could not load favourites — <button onclick="loadFavourites()" style="background:none;border:none;color:var(--accent);cursor:pointer;font-family:inherit;font-size:inherit;padding:0;text-decoration:underline;">retry</button></div>';
  }
}

async function loadAlerts() {
  if (!_currentUser) return;
  try {
    const { data } = await db.from('price_alerts').select('ticker').eq('user_id', _currentUser.id).eq('triggered', false);
    _alerts = new Set((data || []).map(a => a.ticker));
    document.querySelectorAll('.alert-btn').forEach(btn => {
      const card = btn.closest('[data-ticker]'); if (!card) return;
      const active = _alerts.has(card.dataset.ticker);
      btn.classList.toggle('alert-active', active);
      const svg = btn.querySelector('svg');
      if (svg) { svg.setAttribute('fill', active ? 'rgba(108,99,255,0.2)' : 'none'); svg.setAttribute('stroke', active ? 'var(--accent)' : 'currentColor'); }
    });
  } catch { /* silent */ }
}

async function toggleFavourite(ticker, name, e) {
  if (e) e.stopPropagation();
  if (!_currentUser) return;
  const isFav = _favourites.has(ticker);
  if (isFav) { _favourites.delete(ticker); await db.from('stock_favourites').delete().eq('user_id', _currentUser.id).eq('ticker', ticker); }
  else       { _favourites.add(ticker);    await db.from('stock_favourites').upsert({ user_id: _currentUser.id, ticker, name }, { onConflict: 'user_id,ticker' }); }
  document.querySelectorAll(`[data-ticker="${ticker}"] .fav-btn`).forEach(btn => {
    btn.classList.toggle('fav-active', !isFav);
    const svg = btn.querySelector('svg');
    if (svg) { svg.setAttribute('fill', !isFav ? 'var(--amber)' : 'none'); svg.setAttribute('stroke', !isFav ? 'var(--amber)' : 'currentColor'); }
  });
  renderFavsSection();
  updateFavCount();
}

function updateFavCount() {
  const el = $('favs-count'); if (el) el.textContent = _favourites.size;
}

async function renderFavsSection() {
  const grid = $('recs-grid-favs'); if (!grid) return;
  if (!_favourites.size) { grid.innerHTML = '<div style="grid-column:1/-1;font-size:13px;color:var(--text-dim);font-style:italic;padding:8px 0;">Star any stock card to add it to your favourites list.</div>'; return; }
  const tickers = [..._favourites].slice(0, 6);
  const overflow = _favourites.size - tickers.length;
  grid.innerHTML = tickers.map(ticker => {
    const md = liveMarketData[ticker];
    return renderRecCard({ ticker, name: ticker, price: md?.price || '—', change: md?.change || '—', direction: 'up', weekData: [], rsi: 50, volRatio: 1, rangePct: 50, streak: 1, weekPct: 0, weekTrend: 'up' }, null);
  }).join('') + (overflow > 0 ? `<div style="grid-column:1/-1;font-size:11px;color:var(--text-dim);text-align:center;padding:6px 0;">+${overflow} more · showing first 6</div>` : '');
  for (const ticker of tickers) enrichFavCard(ticker);
}

async function enrichFavCard(ticker) {
  const grid = $('recs-grid-favs'); if (!grid) return;
  const r = { ticker, name: ticker, price: '—', change: '—', direction: 'up', weekData: [], rsi: 50, volRatio: 1, rangePct: 50, streak: 1, weekPct: 0, weekTrend: 'up' };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ ticker: '__yahoo__', yTicker: ticker, range: '5d', interval: '1d' })
    });
    if (res.ok) {
      const yData = await res.json();
      const result = yData.result;
      if (result) {
        const meta=result.meta||{}, closes=result.indicators?.adjclose?.[0]?.adjclose||result.indicators?.quote?.[0]?.close||[], vols=result.indicators?.quote?.[0]?.volume||[];
        const price=meta.regularMarketPrice||closes[closes.length-1]||0, prev=meta.chartPreviousClose||closes[0]||price;
        const todayPct=prev?((price-prev)/prev)*100:0, weekPct=closes.length>1?((closes[closes.length-1]-closes[0])/Math.abs(closes[0]))*100:0;
        const gains=[],losses=[]; for(let i=1;i<closes.length;i++){gains.push(closes[i]-closes[i-1]>0?closes[i]-closes[i-1]:0);losses.push(closes[i]-closes[i-1]<0?Math.abs(closes[i]-closes[i-1]):0);}
        const avgG=gains.reduce((a,b)=>a+b,0)/Math.max(gains.length,1),avgL=losses.reduce((a,b)=>a+b,0)/Math.max(losses.length,1);
        const rsi=Math.round(avgL===0?100:100-(100/(1+(avgG/avgL))));
        const todayVol=vols[vols.length-1]||0,avgVol=vols.slice(0,-1).reduce((a,b)=>a+b,0)/Math.max(vols.length-1,1);
        const volRatio=avgVol>0?parseFloat((todayVol/avgVol).toFixed(2)):1;
        const high5=Math.max(...closes),low5=Math.min(...closes),rangePct=high5>low5?Math.round(((price-low5)/(high5-low5))*100):50;
        let streak=1; for(let i=closes.length-2;i>0;i--){if((closes[i]>closes[i-1])===(todayPct>=0))streak++;else break;}
        r.price=price.toFixed(2); r.change=(todayPct>=0?'+':'')+todayPct.toFixed(2)+'%';
        r.weekData=closes.slice(-5).map(p=>parseFloat(p.toFixed(2))); r.direction=todayPct>=0?'up':'down';
        r.weekTrend=weekPct>=0?'up':'down'; r.weekPct=parseFloat(weekPct.toFixed(2));
        r.rsi=rsi; r.volRatio=volRatio; r.rangePct=rangePct; r.streak=streak;
        r.name=meta.longName||meta.shortName||ticker;
        liveMarketData[ticker]={price:r.price,change:r.change};
      }
    }
  } catch(e) { /* use placeholder */ }
  const ai = await fetchAISignal(ticker, r.price, r.change, r.name, { rsi:r.rsi, volRatio:r.volRatio, rangePct:r.rangePct, streak:r.streak, weekPct:r.weekPct, weekTrend:r.weekTrend, direction:r.direction });
  const resolvedAi = ai || { signal: r.direction==='up'?'BUY':'SELL', confidence:'Low', rationale:'Signal temporarily unavailable.', action:'', entry:'', stopLoss:'', positionSize:'' };
  const card = grid.querySelector(`[data-ticker="${ticker}"]`);
  if (card) { const tmp=document.createElement('div'); tmp.innerHTML=renderRecCard(r,resolvedAi); card.replaceWith(tmp.firstElementChild); }
}

function toggleFavsSection() {
  const row=$('favs-toggle-row'), body=$('favs-body'); if(!row||!body)return;
  const isOpen=body.classList.toggle('open'); row.classList.toggle('open',isOpen);
  body.style.display = isOpen ? 'block' : 'none';
  if(isOpen)renderFavsSection();
}

/* ── Price alert modal ── */
function openAlertModal(ticker, name, currentPrice, e) {
  if (e) e.stopPropagation();
  document.getElementById('alert-modal-overlay')?.remove();
  const existing = _alerts.has(ticker);
  const overlay  = document.createElement('div');
  overlay.id = 'alert-modal-overlay';
  overlay.className = 'alert-modal-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="alert-modal">
      <h3>🔔 Price Alert — ${ticker.replace('-USD','')}</h3>
      <p>${name} · Current: $${currentPrice}</p>
      ${existing ? '<p style="color:var(--accent);font-size:12px;margin-top:-8px;margin-bottom:12px;">⚡ Alert already set — saving will update it.</p>' : ''}
      <div class="alert-field"><label>Notify when price is</label><select id="alert-direction"><option value="above">Above target</option><option value="below">Below target</option></select></div>
      <div class="alert-field"><label>Target price ($)</label><input type="number" id="alert-price" placeholder="e.g. 250.00" step="0.01" min="0" value="${parseFloat(currentPrice)||''}"/></div>
      <div id="alert-msg" style="display:none;font-size:12px;padding:7px 10px;border-radius:6px;margin-top:8px;"></div>
      <div class="alert-btn-row">
        <button class="alert-cancel-btn" onclick="document.getElementById('alert-modal-overlay').remove()">Cancel</button>
        ${existing ? '<button class="alert-cancel-btn" style="color:var(--red);border-color:rgba(239,68,68,0.3);" onclick="deleteAlert(\'' + ticker + '\')">Remove</button>' : ''}
        <button class="alert-save-btn" onclick="saveAlert('${ticker}','${name.replace(/'/g,"\\'")}')">Save Alert</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function saveAlert(ticker, name) {
  const price = parseFloat(document.getElementById('alert-price')?.value);
  const dir   = document.getElementById('alert-direction')?.value;
  if (!price || price <= 0) { _alertMsg('Enter a valid price.', 'err'); return; }
  _alertMsg('Saving…', 'ok');
  try {
    const { error } = await db.from('price_alerts').upsert(
      { user_id: _currentUser.id, ticker, name: name || ticker, target_price: price, direction: dir || 'above', triggered: false },
      { onConflict: 'user_id,ticker' }
    );
    if (error) throw error;
    _alerts.add(ticker);
    document.querySelectorAll(`[data-ticker="${ticker}"] .alert-btn`).forEach(btn => {
      btn.classList.add('alert-active');
      const svg = btn.querySelector('svg');
      if (svg) { svg.setAttribute('fill','rgba(108,99,255,0.2)'); svg.setAttribute('stroke','var(--accent)'); }
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
    const svg = btn.querySelector('svg');
    if (svg) { svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor'); }
  });
  document.getElementById('alert-modal-overlay')?.remove();
}

function _alertMsg(msg, type) {
  const el = document.getElementById('alert-msg'); if (!el) return;
  el.style.display='block'; el.textContent=msg;
  el.style.background = type==='err' ? 'var(--red-bg)' : 'var(--green-bg)';
  el.style.color       = type==='err' ? 'var(--red)'   : 'var(--green)';
  el.style.border      = type==='err' ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(34,197,94,0.2)';
}

function loadExchangeTicker() {
  // Render open/closed status immediately (no Yahoo fetch on this page)
  const items = EXCHANGES.map(ex => ({ex, data: null}));
  renderTickerTrack(items);
  setInterval(() => renderTickerTrack(items), 60000);
}
loadExchangeTicker();
