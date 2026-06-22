/* ── recs-auth.js — theme, auth panel, session management ── */

/* ── Theme ── */
function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
  $('icon-moon').style.display = isLight ? 'none'  : '';
  $('icon-sun').style.display  = isLight ? ''      : 'none';
  $('theme-label').textContent = isLight ? 'Dark'  : 'Light';
}
(function initTheme() {
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light');
    if ($('icon-moon')) $('icon-moon').style.display = 'none';
    if ($('icon-sun'))  $('icon-sun').style.display  = '';
    if ($('theme-label')) $('theme-label').textContent = 'Dark';
  }
})();

/* ── Auth panel ── */
function toggleAuthPanel() { _panelOpen ? closeAuthPanel() : openAuthPanel(); }
function openAuthPanel() {
  $('auth-dropdown').classList.add('open');
  $('auth-trigger-btn')?.setAttribute('aria-expanded','true');
  _panelOpen = true;
  setTimeout(() => document.addEventListener('click', _outsideClick), 0);
}
function closeAuthPanel() {
  $('auth-dropdown').classList.remove('open');
  $('auth-trigger-btn')?.setAttribute('aria-expanded','false');
  _panelOpen = false;
  document.removeEventListener('click', _outsideClick);
  adpClearMsg();
}
function _outsideClick(e) { if (!e.target.closest('.auth-trigger-wrap')) closeAuthPanel(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAuthPanel(); });

function adpTab(tab) {
  adpClearMsg();
  ['signin','signup','reset'].forEach(t => { $(('adp-' + t)).style.display = t === tab ? 'block' : 'none'; });
  $('adp-tabs')?.style.setProperty('display', tab === 'reset' ? 'none' : 'flex');
  ['signin','signup'].forEach(t => { $('tab-' + t)?.classList.toggle('active', t === tab); });
}
function adpClearMsg() {
  const e=$('adp-err'),s=$('adp-ok');
  if(e){e.style.display='none';e.textContent='';}
  if(s){s.style.display='none';s.textContent='';}
}
function adpErr(msg){const el=$('adp-err');if(!el)return;el.textContent=msg;el.style.display='block';$('adp-ok').style.display='none';}
function adpOk(msg){const el=$('adp-ok');if(!el)return;el.textContent=msg;el.style.display='block';$('adp-err').style.display='none';}
function adpSpin(id,loading,label){const b=$(id);if(!b)return;b.disabled=loading;b.innerHTML=loading?'<span class="adp-spin"></span>':label;}
function adpTogglePw(id,btn){const inp=$(id);const show=inp.type==='password';inp.type=show?'text':'password';btn.innerHTML=show?'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.06-5.94M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>':'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';}

async function adpSignIn(){const email=$('si-email')?.value.trim(),pw=$('si-pw')?.value;if(!email||!pw){adpErr('Please fill in all fields.');return;}adpClearMsg();adpSpin('si-btn',true,'Sign in');try{const{error}=await db.auth.signInWithPassword({email,password:pw});if(error)throw error;}catch(e){adpErr(e.message||'Sign in failed.');adpSpin('si-btn',false,'Sign in');}}
async function adpSignUp(){const email=$('su-email')?.value.trim(),pw=$('su-pw')?.value,pw2=$('su-pw2')?.value;if(!email||!pw){adpErr('Please fill in all fields.');return;}if(pw.length<8){adpErr('Password must be at least 8 characters.');return;}if(pw!==pw2){adpErr('Passwords do not match.');return;}adpClearMsg();adpSpin('su-btn',true,'Create account');try{const{error}=await db.auth.signUp({email,password:pw});if(error)throw error;adpOk('✓ Check your email to confirm, then sign in.');}catch(e){adpErr(e.message||'Sign up failed.');}adpSpin('su-btn',false,'Create account');}
async function adpResetPw(){const email=$('rp-email')?.value.trim();if(!email){adpErr('Please enter your email.');return;}adpClearMsg();adpSpin('rp-btn',true,'Sending…');try{const{error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.href});if(error)throw error;adpOk('✓ Reset link sent — check your inbox.');}catch(e){adpErr(e.message||'Could not send reset email.');}adpSpin('rp-btn',false,'Send reset link');}
async function adpGoogle(){adpClearMsg();try{const{error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:'https://el-martillo.github.io/fintech/',queryParams:{access_type:'offline',prompt:'consent'}}});if(error){if(error.message?.includes('provider is not enabled')||error.status===400)adpErr('Google sign-in not yet configured — use email/password for now.');else adpErr(error.message);}}catch(e){adpErr('Google sign-in unavailable — use email/password.');}}
async function adpSignOut(){closeAuthPanel();await db.auth.signOut();}

function _renderTrigger(user) {
  const wrap=$('auth-trigger-btn');if(!wrap)return;
  if(!user){wrap.className='navbar-account auth-trigger';wrap.title='Sign in / Register';wrap.innerHTML=`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;}
  else{const ini=(user.email||'U').slice(0,2).toUpperCase();wrap.className='adp-user-btn';wrap.title='My account';wrap.innerHTML=ini;}
}
function _renderLoggedIn(user) {
  const lo=$('auth-logged-out'),li=$('auth-logged-in');if(!lo||!li)return;
  if(!user){lo.style.display='block';li.style.display='none';adpTab('signin');return;}
  lo.style.display='none';li.style.display='block';
  const ini=(user.email||'U').slice(0,2).toUpperCase();
  const av=$('adp-avatar'),em=$('adp-user-email'),si=$('adp-user-since');
  if(av)av.textContent=ini;if(em)em.textContent=user.email;
  if(si&&user.created_at)si.textContent='Member since '+new Date(user.created_at).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const adminLink=$('adp-admin-link');
  if(adminLink)adminLink.style.display=ADMIN_EMAILS.includes(user.email)?'flex':'none';
}

document.addEventListener('keydown', e => {
  if(e.key!=='Enter')return;
  const id=document.activeElement?.id;
  if(id==='si-email'||id==='si-pw')adpSignIn();
  else if(id==='su-email'||id==='su-pw'||id==='su-pw2')adpSignUp();
  else if(id==='rp-email')adpResetPw();
});

/* ── Auth gate ── */
function showPage() {
  if ($('auth-gate').style.display === 'none') return; // already shown
  $('auth-gate').style.display = 'none';
  $('recs-page').style.display = 'block';
  loadRecommendations();
  loadFavourites();
  loadAlerts();
  loadSavedSearches();
  loadExchangeTicker();
  if (_currentUser) {
    db.from('profiles').select('whatsapp_number, callmebot_apikey').eq('id', _currentUser.id).single()
      .then(({ data }) => {
        if (data?.whatsapp_number) _whatsappNumber = data.whatsapp_number;
        if (data?.callmebot_apikey) _callmebotKey = data.callmebot_apikey;
      });
  }
  const urlParams = new URLSearchParams(window.location.search);
  const autoLookup = urlParams.get('lookup');
  if (autoLookup) {
    history.replaceState(null, '', window.location.pathname);
    setTimeout(() => useLookupResult(autoLookup.toUpperCase(), ''), 800);
  }
}

function initAuth() {
  db.auth.onAuthStateChange((event, session) => {
    _currentUser = session?.user ?? null;
    _renderTrigger(_currentUser);
    _renderLoggedIn(_currentUser);
    if (_currentUser) {
      showPage();
      if (window.location.hash.includes('access_token'))
        history.replaceState(null, '', window.location.pathname);
      setTimeout(closeAuthPanel, 700);
    }
  });
  db.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      _currentUser = session.user;
      _renderTrigger(_currentUser);
      _renderLoggedIn(_currentUser);
      showPage();
    }
  });
}
