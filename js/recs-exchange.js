/* ── recs-exchange.js — exchange ticker bar ── */

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
