/* ── main-init.js — boot: called last after all scripts loaded ── */

async function initSections() {
  loadHistory();
  loadMovers();
  await delay(1000);
  loadNews();
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Boot — all scripts loaded, safe to call everything
initAuth();
initSections();
loadExchangeTicker();
