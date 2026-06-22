/* ── main-config.js — Supabase client, constants, shared globals ── */

const SUPABASE_URL      = 'https://undxlihtxjlntmixcdse.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuZHhsaWh0eGpsbnRtaXhjZHNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDE1MjIsImV4cCI6MjA5NzI3NzUyMn0.pQ2lHoYfnvhET561Zuc-gWL-IQtfIsHrWNLj8oCDEmI';
// Anthropic calls are proxied via Supabase Edge Function — no client-side key needed
/* ═══════════════════════════════════════════════════ */

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
});
const ADMIN_EMAILS = ['giacomo.medici@gmail.com'];
const isAdmin = () => ADMIN_EMAILS.includes(_currentUser?.email);

/* ── UI helpers ── */
const $  = id => document.getElementById(id);
const show = id => $(id).style.display = 'block';
const hide = id => $(id).style.display = 'none';

// Stores live price/change data from Yahoo Finance — keyed by ticker
const liveMarketData = {};
