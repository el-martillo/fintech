/* ── main-movers.js — daily movers screener, sparkline builder ── */

/* ── Daily movers — Yahoo Finance screener ── */
async function loadMovers() {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ ticker: '__screener__' })
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    const gainers = data.gainers || [];
    const losers  = data.losers  || [];
    if (!gainers.length && !losers.length) {
      $('movers-grid').innerHTML = '<div class="movers-empty">No movers data available.</div>';
      return;
    }
    const renderRow = m => {
      const pos = m.change.startsWith('+');
      return `
        <div class="sidebar-mover-row" onclick="setTickerFromMover('${m.ticker}','${m.price}','${m.change}')">
          <div class="sidebar-mover-left">
            <span class="mover-ticker">${m.ticker.replace('-USD','')}</span>
            <span class="mover-name">${m.name}</span>
          </div>
          <div class="sidebar-mover-right">
            <span class="mover-change ${pos ? 'pos' : 'neg'}">${m.change}</span>
            <span class="mover-price" title="Stock price">$${m.price}</span>
          </div>
        </div>`;
    };
    const now = new Date();
    $('movers-updated').textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    $('movers-grid').innerHTML =
      (gainers.length ? `<div class="movers-divider pos">▲ Top gainers</div>` + gainers.map(renderRow).join('') : '') +
      (losers.length  ? `<div class="movers-divider neg">▼ Top losers</div>`  + losers.map(renderRow).join('')  : '');
  } catch (err) {
    $('movers-grid').innerHTML = '<div class="movers-empty">Could not load movers.</div>';
  }
}



/* ── Sparkline builder ── */
function buildSparkline(data, isPos) {
  if (!data || data.length < 2) return '';
  const w = 120, h = 36, pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = isPos ? 'var(--green)' : 'var(--red)';
  const fillColor = isPos ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
  // Close path for fill
  const firstX = pad;
  const lastX = (w - pad).toFixed(1);
  const baseY = h - pad;
  const fillPts = `${firstX},${baseY} ${pts} ${lastX},${baseY}`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block;width:100%;">
    <polygon points="${fillPts}" fill="${fillColor}" stroke="none"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}
