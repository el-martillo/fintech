/* ── main-exchange.js — exchange ticker bar ── */

/* ── Exchange Ticker Bar ── */
const EXCHANGES = [
  { name:'NYSE',    label:'New York SE',     flag:'🇺🇸', tz:'America/New_York', open:'09:30', close:'16:00', yTicker:'IVV'       },
  { name:'NASDAQ',  label:'Nasdaq',          flag:'🇺🇸', tz:'America/New_York', open:'09:30', close:'16:00', yTicker:'QQQ'       },
  { name:'SSE',     label:'Shanghai SE',     flag:'🇨🇳', tz:'Asia/Shanghai',   open:'09:30', close:'15:00', yTicker:'000001.SS' },
  { name:'TSE',     label:'Tokyo SE',        flag:'🇯🇵', tz:'Asia/Tokyo',      open:'09:00', close:'15:30', yTicker:'^N225'     },
  { name:'Euronext',label:'Euronext',        flag:'🇪🇺', tz:'Europe/Paris',    open:'09:00', close:'17:30', yTicker:'^N100'     },
  { name:'LSE',     label:'London SE',       flag:'🇬🇧', tz:'Europe/London',   open:'08:00', close:'16:30', yTicker:'^FTSE'     },
  { name:'NSE',     label:'Nat. SE India',   flag:'🇮🇳', tz:'Asia/Kolkata',    open:'09:15', close:'15:30', yTicker:'^NSEI'     },
  { name:'HKEX',    label:'Hong Kong',       flag:'🇭🇰', tz:'Asia/Hong_Kong',  open:'09:30', close:'16:00', yTicker:'^HSI'      },
  { name:'SZSE',    label:'Shenzhen SE',     flag:'🇨🇳', tz:'Asia/Shanghai',   open:'09:30', close:'15:00', yTicker:'399001.SZ' },
  { name:'TMX',     label:'Toronto SE',      flag:'🇨🇦', tz:'America/Toronto', open:'09:30', close:'16:00', yTicker:'^GSPTSE'   },
];

function isExchOpen(ex) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: ex.tz, hour:'2-digit', minute:'2-digit', hour12:false, weekday:'short' });
  const parts = fmt.formatToParts(now);
  const wd  = parts.find(p=>p.type==='weekday').value;
  const h   = parseInt(parts.find(p=>p.type==='hour').value);
  const m   = parseInt(parts.find(p=>p.type==='minute').value);
  if (wd==='Sat'||wd==='Sun') return false;
  const [oh,om] = ex.open.split(':').map(Number);
  const [ch,cm] = ex.close.split(':').map(Number);
  const now_ = h*60+m, o = oh*60+om, c = ch*60+cm;
  return now_ >= o && now_ < c;
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
  track.innerHTML = inner + inner; // duplicate for seamless loop
}

async function loadExchangeTicker() {
  const items = EXCHANGES.map(ex => ({ex, data:null}));
  renderTickerTrack(items);

  const results = await Promise.all(EXCHANGES.map(async ex => {
    try {
      const r = await yahooFetch(ex.yTicker, '5d', '1d');
      if (!r) return {ex, data:null};
      const closes = (r.indicators?.quote?.[0]?.close||[]).filter(p=>p!=null);
      if (closes.length < 2) return {ex, data:null};
      const price = closes[closes.length-1], prev = closes[closes.length-2];
      return {ex, data:{ change: ((price-prev)/prev)*100 }};
    } catch { return {ex, data:null}; }
  }));

  renderTickerTrack(results);
  setInterval(() => renderTickerTrack(results), 60000); // refresh open/closed badges
}


loadExchangeTicker();
initSections();

// Refresh movers every 5 minutes
setInterval(loadMovers, 300000);
/* ═══════════════════════════════════════════════
   AUTH DROPDOWN  — pure Supabase, no page gate
═══════════════════════════════════════════════ */
