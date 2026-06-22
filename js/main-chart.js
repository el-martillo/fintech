/* ── main-chart.js — price chart, candlestick, line chart ── */

/* ── Price chart ── */
let priceChart         = null;
let currentChartTicker = '';
let currentChartCompany = '';
let currentChartSector  = '';
let chartCache         = {};
let currentChartType   = 'candle';

function _updateChartTitles() {
  const activeTab = document.querySelector('.chart-tabs .chart-tab.active');
  const period = activeTab ? activeTab.textContent.trim() : '';
  const periodLabel = { '1D':'5 Days', '5D':'1 Month', '1M':'3 Months', '3M':'6 Months', '6M':'1 Year', '1Y':'2 Years' }[period] || period;
  const el = $('chart-title-ticker');
  const sub = $('chart-title-sub');
  if (el) el.textContent = currentChartTicker ? `${currentChartTicker} — Price History` : 'Price History';
  if (sub) sub.textContent = currentChartTicker
    ? `${currentChartCompany}${currentChartSector ? ' · ' + currentChartSector : ''} · Daily candles${periodLabel ? ' · ' + periodLabel : ''}`
    : 'Enter a ticker above to load chart data';
}

// Maps UI tab labels to Yahoo Finance range/interval params
const CHART_PARAMS = {
  '1D': { range: '5d',   interval: '1d' },
  '5D': { range: '1mo',  interval: '1d' },
  '1M': { range: '3mo',  interval: '1d' },
  '3M': { range: '6mo',  interval: '1d' },
  '6M': { range: '1y',   interval: '1d' },
  '1Y': { range: '2y',   interval: '1d' },
};

async function loadPriceChart(ticker, period) {
  const canvas  = $('price-chart');
  const loading = $('chart-loading');
  const error   = $('chart-error');
  const footer  = $('chart-footer');

  loading.style.display = 'flex';
  canvas.style.display  = 'none';
  error.style.display   = 'none';
  if (footer) footer.textContent = '';

  const cacheKey = `${ticker}_${period}`;
  if (chartCache[cacheKey]) {
    dispatchChart(chartCache[cacheKey], period);
    return;
  }

  try {
    const { range, interval } = CHART_PARAMS[period] || CHART_PARAMS['1D'];
    const result = await yahooFetch(ticker, range, interval);
    if (!result) throw new Error('Yahoo Finance unavailable');

    const timestamps = result.timestamp || [];
    const q          = result.indicators?.quote?.[0] || {};

    const candles = timestamps.map((t, i) => ({
      t:  t * 1000,
      o:  q.open?.[i],
      h:  q.high?.[i],
      l:  q.low?.[i],
      c:  q.close?.[i],
      v:  q.volume?.[i] || 0,
    })).filter(x => x.o != null && x.c != null);

    if (candles.length < 2) throw new Error('Insufficient data');

    chartCache[cacheKey] = candles;
    dispatchChart(candles, period);
  } catch(e) {
    loading.style.display = 'none';
    error.style.display   = 'block';
    error.textContent     = 'Could not load chart — market may be closed or ticker unavailable.';
    console.warn('Chart error:', e);
  }
}

// Route to correct renderer based on currentChartType
function dispatchChart(candles, period) {
  if (currentChartType === 'candle') renderCandleChart(candles, period);
  else renderLineChart(candles, period);
}

/* shared helpers */
function _chartColors() {
  const dark = !document.body.classList.contains('light');
  return {
    grid:    dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
    tick:    dark ? '#555a6e' : '#9099b0',
    ttBg:    dark ? 'rgba(20,23,31,0.97)' : 'rgba(255,255,255,0.97)',
    ttTitle: dark ? '#8b90a0' : '#4b5060',
    ttBody:  dark ? '#e8eaf0' : '#111318',
    ttBord:  dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
  };
}

function _chartFooter(candles, period, footer) {
  if (!footer) return;
  const first = candles[0].c, last = candles[candles.length-1].c;
  const isUp  = last >= first;
  const clr   = isUp ? '#22c55e' : '#ef4444';
  const sign  = isUp ? '+' : '';
  const pct   = (((last - first) / first) * 100).toFixed(2);
  const fmt   = ts => new Date(ts).toLocaleDateString('en-GB', {day:'numeric',month:'short'});
  footer.innerHTML = `<span style="color:var(--text-dim);font-size:11px;">${fmt(candles[0].t)} → ${fmt(candles[candles.length-1].t)}</span><span style="font-size:12px;font-weight:600;color:${clr};margin-left:auto;">${sign}${pct}%</span>`;
}

function _calcMA(candles, n) {
  return candles.map((_, i) => {
    if (i < n - 1) return null;
    const avg = candles.slice(i-n+1, i+1).reduce((s,c)=>s+c.c,0)/n;
    return { x: candles[i].t, y: +avg.toFixed(2) };
  }).filter(Boolean);
}

/* ── Candlestick ── */
function renderCandleChart(candles, period) {
  const canvas = $('price-chart'), loading = $('chart-loading'), footer = $('chart-footer');
  loading.style.display = 'none'; canvas.style.display = 'block';
  _chartFooter(candles, period, footer);
  if (priceChart) { priceChart.destroy(); priceChart = null; }

  const c = _chartColors();
  const timeUnit = 'day';
  const maxVol = candles.reduce((m,x) => Math.max(m, x.v), 0);

  // ── Price axis: tight range around actual H/L with 2% padding ──
  const allHigh = candles.map(x => x.h).filter(Boolean);
  const allLow  = candles.map(x => x.l).filter(Boolean);
  const priceMax = Math.max(...allHigh);
  const priceMin = Math.min(...allLow);
  const pricePad = (priceMax - priceMin) * 0.08;
  const yMin = priceMin - pricePad;
  const yMax = priceMax + pricePad;

  // ── Volume axis: bars occupy bottom ~22% of chart ──
  // vol max is set so that maxVol maps to 22% of the price axis height
  const priceRange = yMax - yMin;
  const volMax = maxVol / 0.22 * (priceRange / yMax) * yMax;

  priceChart = new Chart(canvas, {
    data: { datasets: [
      {
        type: 'candlestick',
        label: 'Price',
        data: candles.map(x => ({ x: x.t, o: x.o, h: x.h, l: x.l, c: x.c })),
        color: { up: '#22c55e', down: '#ef4444', unchanged: '#8b90a0' },
        borderColor: { up: '#22c55e', down: '#ef4444', unchanged: '#8b90a0' },
        borderWidth: 1,
        yAxisID: 'y',
      },
      {
        type: 'line', label: 'MA20',
        data: _calcMA(candles, 20),
        borderColor: 'rgba(108,99,255,0.85)', borderWidth: 1.5,
        pointRadius: 0, tension: 0.3, yAxisID: 'y',
      },
      {
        type: 'bar', label: 'Volume',
        data: candles.map(x => ({ x: x.t, y: x.v })),
        backgroundColor: candles.map(x => x.c >= x.o ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'),
        yAxisID: 'vol', order: 10,
        barPercentage: 0.85, categoryPercentage: 0.9,
      },
    ]},
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      layout: { padding: { top: 12, right: 8, bottom: 0, left: 0 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.ttBg, titleColor: c.ttTitle, bodyColor: c.ttBody,
          borderColor: c.ttBord, borderWidth: 1, padding: 10,
          callbacks: {
            title: items => {
              const ts = items[0]?.raw?.x ?? items[0]?.parsed?.x;
              if (!ts) return '';
              return new Date(ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
            },
            label: ctx => {
              if (ctx.dataset.label === 'Volume') {
                const v = ctx.raw?.y || 0;
                return ` Vol: ${v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v}`;
              }
              if (ctx.dataset.label === 'MA20') return ` MA20: $${ctx.parsed.y?.toFixed(2)}`;
              const r = ctx.raw;
              return r?.o != null
                ? [` O: $${r.o.toFixed(2)}`, ` H: $${r.h.toFixed(2)}`, ` L: $${r.l.toFixed(2)}`, ` C: $${r.c.toFixed(2)}`]
                : '';
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: timeUnit, displayFormats: { hour: 'HH:mm', day: 'd MMM', week: 'd MMM' } },
          grid: { display: false },
          border: { display: false },
          ticks: { color: c.tick, font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0, autoSkip: true },
        },
        y: {
          position: 'right',
          min: yMin,
          max: yMax,
          grid: { color: c.grid },
          border: { display: false },
          ticks: {
            color: c.tick, font: { size: 10 },
            callback: v => '$' + v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
          },
        },
        vol: {
          position: 'left',
          min: 0,
          max: volMax,
          grid: { display: false },
          border: { display: false },
          ticks: { display: false },
        },
      }
    }
  });
}

/* ── Line chart ── */
function renderLineChart(candles, period) {
  const canvas = $('price-chart'), loading = $('chart-loading'), footer = $('chart-footer');
  loading.style.display = 'none'; canvas.style.display = 'block';
  _chartFooter(candles, period, footer);
  if (priceChart) priceChart.destroy();

  const c      = _chartColors();
  const prices = candles.map(x => x.c);
  const isUp   = prices[prices.length-1] >= prices[0];
  const clr    = isUp ? '#22c55e' : '#ef4444';
  const fill   = isUp ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
  const fmt    = period === '1D'
    ? ts => new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})
    : ts => new Date(ts).toLocaleDateString('en-GB',{day:'numeric',month:'short'});

  priceChart = new Chart(canvas, {
    type:'line',
    data:{
      labels: candles.map(x=>fmt(x.t)),
      datasets:[{
        data: prices, borderColor:clr, backgroundColor:fill,
        borderWidth:2, pointRadius:0, pointHoverRadius:4,
        fill:true, tension:0.3,
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{intersect:false,mode:'index'},
      plugins:{ legend:{display:false}, tooltip:{
        backgroundColor:c.ttBg, titleColor:c.ttTitle, bodyColor:c.ttBody,
        borderColor:c.ttBord, borderWidth:1, padding:10,
        callbacks:{ label: ctx => ` $${ctx.parsed.y.toFixed(2)}` }
      }},
      scales:{
        x:{ grid:{display:false}, border:{display:false},
          ticks:{color:c.tick,font:{size:10},maxTicksLimit:6,maxRotation:0} },
        y:{ position:'right', grid:{color:c.grid}, border:{display:false},
          ticks:{color:c.tick,font:{size:10},callback:v=>'$'+v.toFixed(0)} },
      }
    }
  });
}

/* ── Chart type toggle ── */
function switchChartType(type, btn) {
  currentChartType = type;
  document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Re-render from cache if data available
  if (currentChartTicker) {
    document.querySelectorAll('.chart-tab').forEach(b => {
      if (b.classList.contains('active')) {
        const period = b.textContent.trim();
        const cached = chartCache[`${currentChartTicker}_${period}`];
        if (cached) dispatchChart(cached, period);
        else loadPriceChart(currentChartTicker, period);
      }
    });
  }
}

function switchChartTab(btn, period) {
  document.querySelectorAll('.chart-tabs .chart-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _updateChartTitles();
  if (currentChartTicker) loadPriceChart(currentChartTicker, period);
}

/* ── Staggered init to avoid rate limits ── */
async function initSections() {
  loadHistory();
  loadMovers();
  await delay(1000);
  loadNews();
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
