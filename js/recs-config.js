/* ── recs-config.js — Supabase client, constants, shared globals ── */

const SUPABASE_URL      = 'https://undxlihtxjlntmixcdse.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuZHhsaWh0eGpsbnRtaXhjZHNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDE1MjIsImV4cCI6MjA5NzI3NzUyMn0.pQ2lHoYfnvhET561Zuc-gWL-IQtfIsHrWNLj8oCDEmI';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
});
const ADMIN_EMAILS = ['giacomo.medici@gmail.com'];
const $ = id => document.getElementById(id);

let _currentUser = null;
let _panelOpen   = false;
const liveMarketData = {};
