/* ── main-modal.js — fullscreen chart modal, save PNG, image analysis ── */

/* ── Chart modal (fullscreen) ── */
let modalChart = null;
let modalChartType = 'candle';
let modalPeriod = '1D';

function openChartModal() {
  if (!currentChartTicker) return;
  const modal = $('chart-modal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Sync ticker label and active tab/type with main chart
  $('modal-ticker-label').textContent = currentChartTicker;
  $('modal-company-label').textContent = currentChartCompany
    ? `${currentChartCompany}${currentChartSector ? ' · ' + currentChartSector : ''} · Daily candles`
    : '';
  modalChartType = currentChartType;
  const activeTab = document.querySelector('.chart-tab.active');
  modalPeriod = activeTab ? activeTab.textContent.trim() : '1D';

  // Sync tab highlights
  document.querySelectorAll('#modal-chart-tabs .chart-tab').forEach(b => {
    b.classList.toggle('active', b.textContent.trim() === modalPeriod);
  });
  // Sync type buttons
  $('modal-btn-candle').classList.toggle('active', modalChartType === 'candle');
  $('modal-btn-line').classList.toggle('active',   modalChartType === 'line');

  renderModalChart(currentChartTicker, modalPeriod);
}

function closeChartModal(e) {
  if (e && e.target !== $('chart-modal')) return; // only close on backdrop click
  $('chart-modal').style.display = 'none';
  document.body.style.overflow = '';
  if (modalChart) { modalChart.destroy(); modalChart = null; }
}

function switchModalTab(btn, period) {
  modalPeriod = period;
  document.querySelectorAll('#modal-chart-tabs .chart-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderModalChart(currentChartTicker, period);
}

function switchModalType(type, btn) {
  modalChartType = type;
  document.querySelectorAll('#chart-modal .chart-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Re-render from cache
  const cacheKey = `${currentChartTicker}_${modalPeriod}`;
  if (chartCache[cacheKey]) {
    _renderModalFromCandles(chartCache[cacheKey], modalPeriod);
  }
}

async function renderModalChart(ticker, period) {
  const cacheKey = `${ticker}_${period}`;
  $('modal-chart-loading').style.display = 'flex';
  if (modalChart) { modalChart.destroy(); modalChart = null; }

  let candles = chartCache[cacheKey];
  if (!candles) {
    try {
      const { range, interval } = CHART_PARAMS[period] || CHART_PARAMS['1D'];
      const result = await yahooFetch(ticker, range, interval);
      if (!result) throw new Error('No data');
      const timestamps = result.timestamp || [];
      const q = result.indicators?.quote?.[0] || {};
      candles = timestamps.map((t, i) => ({
        t: t * 1000, o: q.open?.[i], h: q.high?.[i], l: q.low?.[i], c: q.close?.[i], v: q.volume?.[i] || 0,
      })).filter(x => x.o != null && x.c != null);
      chartCache[cacheKey] = candles;
    } catch(e) {
      $('modal-chart-loading').style.display = 'none';
      return;
    }
  }
  _renderModalFromCandles(candles, period);
}

function _renderModalFromCandles(candles, period) {
  $('modal-chart-loading').style.display = 'none';
  if (modalChart) { modalChart.destroy(); modalChart = null; }

  const canvas = $('price-chart-modal');
  const footer = $('modal-chart-footer');
  _chartFooter(candles, period, footer);

  const c = _chartColors();
  const timeUnit = 'day';
  const maxVol = candles.reduce((m,x) => Math.max(m, x.v), 0);

  const allHigh = candles.map(x => x.h).filter(Boolean);
  const allLow  = candles.map(x => x.l).filter(Boolean);
  const priceMax = Math.max(...allHigh);
  const priceMin = Math.min(...allLow);
  const pricePad = (priceMax - priceMin) * 0.08;
  const yMin = priceMin - pricePad;
  const yMax = priceMax + pricePad;
  const priceRange = yMax - yMin;
  const volMax = maxVol / 0.22 * (priceRange / yMax) * yMax;

  if (modalChartType === 'candle') {
    modalChart = new Chart(canvas, {
      data: { datasets: [
        {
          type: 'candlestick', label: 'Price',
          data: candles.map(x => ({ x: x.t, o: x.o, h: x.h, l: x.l, c: x.c })),
          color: { up: '#22c55e', down: '#ef4444', unchanged: '#8b90a0' },
          borderColor: { up: '#22c55e', down: '#ef4444', unchanged: '#8b90a0' },
          borderWidth: 1, yAxisID: 'y',
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
          yAxisID: 'vol', order: 10, barPercentage: 0.85, categoryPercentage: 0.9,
        },
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
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
                return r?.o != null ? [` O: $${r.o.toFixed(2)}`, ` H: $${r.h.toFixed(2)}`, ` L: $${r.l.toFixed(2)}`, ` C: $${r.c.toFixed(2)}`] : '';
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: timeUnit, displayFormats: { hour: 'HH:mm', day: 'd MMM', week: 'd MMM' } },
            grid: { display: false }, border: { display: false },
            ticks: { color: c.tick, font: { size: 11 }, maxTicksLimit: 10, maxRotation: 0, autoSkip: true },
          },
          y: {
            position: 'right', min: yMin, max: yMax,
            grid: { color: c.grid }, border: { display: false },
            ticks: { color: c.tick, font: { size: 11 }, callback: v => '$' + v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) },
          },
          vol: { position: 'left', min: 0, max: volMax, grid: { display: false }, border: { display: false }, ticks: { display: false } },
        }
      }
    });
  } else {
    const prices = candles.map(x => x.c);
    const isUp = prices[prices.length-1] >= prices[0];
    const clr  = isUp ? '#22c55e' : '#ef4444';
    const fmt  = ts => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    modalChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: candles.map(x => fmt(x.t)),
        datasets: [{
          data: prices, borderColor: clr,
          backgroundColor: isUp ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: true, tension: 0.3,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.ttBg, titleColor: c.ttTitle, bodyColor: c.ttBody,
            borderColor: c.ttBord, borderWidth: 1, padding: 10,
            callbacks: { label: ctx => ` $${ctx.parsed.y.toFixed(2)}` }
          }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: c.tick, font: { size: 11 }, maxTicksLimit: 8, maxRotation: 0 } },
          y: { position: 'right', grid: { color: c.grid }, border: { display: false }, ticks: { color: c.tick, font: { size: 11 }, callback: v => '$' + v.toFixed(0) } },
        }
      }
    });
  }
}

// Close modal on Escape key
document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('chart-modal').style.display = 'none'; document.body.style.overflow = ''; if (modalChart) { modalChart.destroy(); modalChart = null; } } });

/* ── Save chart as PNG ── */
function _downloadChartCanvas(canvas, ticker, period) {
  if (!canvas) return;
  const dark = !document.body.classList.contains('light');
  const bg   = dark ? '#0d0f14' : '#f4f5f7';
  const textCol   = dark ? '#e8eaf0' : '#111318';
  const mutedCol  = dark ? '#8b90a0' : '#4b5060';

  // Draw onto an off-screen canvas with title header
  const headerH = 56;
  const footerH = 32;
  const padX    = 20;
  const W = canvas.width;
  const H = canvas.height;
  const out = document.createElement('canvas');
  out.width  = W;
  out.height = H + headerH + footerH;
  const ctx = out.getContext('2d');

  // Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, out.width, out.height);

  // Header — ticker title
  ctx.fillStyle = textCol;
  ctx.font = 'bold 16px "JetBrains Mono", monospace';
  ctx.fillText(`${ticker} — Price History`, padX, 22);

  // Header — subtitle
  const periodLabel = { '1D':'5 Days','5D':'1 Month','1M':'3 Months','3M':'6 Months','6M':'1 Year','1Y':'2 Years' }[period] || period;
  const subtitle = `${currentChartCompany}${currentChartSector ? ' · '+currentChartSector : ''} · Daily candles · ${periodLabel}`;
  ctx.fillStyle = mutedCol;
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.fillText(subtitle, padX, 42);

  // Chart
  ctx.drawImage(canvas, 0, headerH, W, H);

  // Footer — watermark + date
  const now = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  ctx.fillStyle = mutedCol;
  ctx.font = '10px Inter, system-ui, sans-serif';
  ctx.fillText('Stock Advisor · el-martillo.github.io/fintech', padX, H + headerH + 20);
  ctx.textAlign = 'right';
  ctx.fillText(`Generated ${now}`, W - padX, H + headerH + 20);

  // Download
  const a = document.createElement('a');
  a.download = `${ticker}_${period}_chart.png`;
  a.href = out.toDataURL('image/png');
  a.click();
}

function saveChart() {
  if (!priceChart) return;
  const canvas  = $('price-chart');
  const activeTab = document.querySelector('.chart-tabs .chart-tab.active');
  const period = activeTab ? activeTab.textContent.trim() : '1D';
  _downloadChartCanvas(canvas, currentChartTicker, period);
}

function saveModalChart() {
  if (!modalChart) return;
  const canvas = $('price-chart-modal');
  _downloadChartCanvas(canvas, currentChartTicker, modalPeriod);
}

/* ── Chart image upload & vision analysis ── */
let chartFileData = null;
let chartFileMime = null;

function handleChartFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    $('chart-vision-error').textContent = 'File too large. Max 5MB.';
    $('chart-vision-error').style.display = 'block';
    return;
  }
  $('chart-vision-error').style.display = 'none';
  $('chart-vision-result').style.display = 'none';
  chartFileMime = file.type || 'image/png';
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    chartFileData = dataUrl.split(',')[1]; // base64 only
    $('chart-preview-img').src = dataUrl;
    $('chart-preview-wrap').style.display = 'block';
    $('chart-drop-zone').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function handleChartDrop(e) {
  e.preventDefault();
  $('chart-drop-zone').style.borderColor = '';
  $('chart-drop-zone').style.background = '';
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('image/')) handleChartFile(file);
}

function clearChartUpload() {
  chartFileData = null;
  chartFileMime = null;
  $('chart-file-input').value = '';
  $('chart-preview-img').src = '';
  $('chart-preview-wrap').style.display = 'none';
  $('chart-drop-zone').style.display = 'block';
  $('chart-vision-result').style.display = 'none';
  $('chart-vision-error').style.display = 'none';
}

async function analyzeChartImage() {
  if (!chartFileData) return;
  const ticker = $('ticker-input').value.trim().toUpperCase() || 'this stock';
  const chartPrompt = `You are a professional technical analyst. Analyse this chart for ${ticker}.

Identify:
1. **Trend** — current direction and strength
2. **Key levels** — support and resistance
3. **Patterns** — any chart patterns (e.g. head & shoulders, triangle, flag, etc.)
4. **Indicators** — comment on any visible indicators (MA, RSI, MACD, volume, etc.)
5. **Signal** — BUY, SELL, or HOLD with a brief reason
6. **Timeframe suggestion** — recommended trade horizon

Be concise but specific. Format with clear headings.`;

  $('chart-vision-loading').style.display = 'flex';
  $('chart-vision-result').style.display = 'none';
  $('chart-vision-error').style.display = 'none';
  $('chart-analyze-btn').disabled = true;
  $('chart-analyze-label').innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>';

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/analyze-stock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        ticker: '__chart__',
        chartImage: chartFileData,
        chartMime: chartFileMime,
        chartPrompt,
      })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
    $('chart-vision-result').textContent = data.analysis || 'No analysis returned.';
    $('chart-vision-result').style.display = 'block';
  } catch (err) {
    $('chart-vision-error').textContent = err.message || 'Chart analysis failed.';
    $('chart-vision-error').style.display = 'block';
  } finally {
    $('chart-vision-loading').style.display = 'none';
    $('chart-analyze-btn').disabled = false;
    $('chart-analyze-label').textContent = 'Analyse Chart';
  }
}
