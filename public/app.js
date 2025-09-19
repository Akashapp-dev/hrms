// ---------- tiny DOM helpers ----------
const $ = (sel) => document.querySelector(sel);
const app = $('#app');

// ---------- config ----------
const TOKEN_KEY = 'hrms_token';
const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/$/, '');
const NO_BACKEND = !API_BASE;

// ---------- state ----------
let state = {
  user: null,
  authReady: false,
  templates: [],
  currentId: null,
  data: {},
  varsOrder: [],
  varsPage: 0,
  followPreview: true,
  _followTimer: null,
  alwaysFollowUntilSave: true,
  docs: [],
  docsQuery: '',
  users: [],
  selectedUserId: null,
  creatingUser: false
};

// ---------- storage helpers ----------
function lsGet(k, def){ try{ const v = localStorage.getItem(k); return v?JSON.parse(v):def; }catch{ return def; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch{} }
function getToken(){ try{ return localStorage.getItem(TOKEN_KEY) || ''; }catch{ return ''; } }
function setToken(v){ try{ if(v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); }catch{} }

// ---------- mock database (localStorage) ----------
const DB_KEYS = {
  users: 'hrms_users',
  templates: 'hrms_templates',
  docs: 'hrms_docs'
};
// seed demo users on first load
(function seedDemo(){
  const users = lsGet(DB_KEYS.users, null);
  if(!users){
    lsSet(DB_KEYS.users, [
      { id:1, username:'admin',  name:'Admin',  role:'admin',  password:'admin123', createdAt:Date.now(), updatedAt:Date.now() },
      { id:2, username:'editor', name:'Editor', role:'editor', password:'editor123', createdAt:Date.now(), updatedAt:Date.now() },
      { id:3, username:'viewer', name:'Viewer', role:'viewer', password:'viewer123', createdAt:Date.now(), updatedAt:Date.now() },
    ]);
  }
  if(!lsGet(DB_KEYS.templates, null)){
    const t1 = { id: 1, name: 'Welcome Letter', description:'Sample', content:'Dear {{name}},\nWelcome to the company on {{date}}.\nAddress: {{address}}' };
    lsSet(DB_KEYS.templates, [t1]);
  }
  if(!lsGet(DB_KEYS.docs, null)){ lsSet(DB_KEYS.docs, []); }
})();

function nextId(arr){ return (arr.reduce((m,x)=>Math.max(m, x.id||0), 0) || 0) + 1; }

// ---------- mock API (used when NO_BACKEND === true) ----------
const mockApi = {
  async me(){
    const t = getToken();
    if(!t) return { user: null };
    const users = lsGet(DB_KEYS.users, []);
    const user = users.find(u=> String(u.id) === String(t));
    return { user: user ? { id:user.id, username:user.username, name:user.name, role:user.role, createdAt:user.createdAt, updatedAt:user.updatedAt } : null };
  },
  async login(username, password){
    const users = lsGet(DB_KEYS.users, []);
    const u = users.find(x=>x.username===username && x.password===password);
    if(!u) throw new Error('Invalid credentials');
    setToken(String(u.id));
    return { token:String(u.id), user: { id:u.id, username:u.username, name:u.name, role:u.role, createdAt:u.createdAt, updatedAt:u.updatedAt } };
  },
  async logout(){ setToken(''); return { ok:true }; },

  // templates
  async listTemplates(){
    return lsGet(DB_KEYS.templates, []).slice();
  },
  async createTemplate(t){
    const list = lsGet(DB_KEYS.templates, []);
    const item = { id: nextId(list), ...t };
    list.push(item); lsSet(DB_KEYS.templates, list);
    return item;
  },
  async updateTemplate(id, t){
    const list = lsGet(DB_KEYS.templates, []);
    const i = list.findIndex(x=> String(x.id)===String(id));
    if(i<0) throw new Error('Not found');
    list[i] = { ...list[i], ...t }; lsSet(DB_KEYS.templates, list);
    return list[i];
  },
  async deleteTemplate(id){
    let list = lsGet(DB_KEYS.templates, []);
    list = list.filter(x=> String(x.id)!==String(id)); lsSet(DB_KEYS.templates, list);
    return { ok:true };
  },

  // documents
  async listDocs(){
    return lsGet(DB_KEYS.docs, []).slice();
  },
  async render(body){
    const docs = lsGet(DB_KEYS.docs, []);
    const item = { id: nextId(docs), content: body.content || '', data: body.data || {}, createdAt: Date.now(), fileName: null };
    docs.push(item); lsSet(DB_KEYS.docs, docs);
    return item;
  },

  // admin users
  async listUsers(){
    const users = lsGet(DB_KEYS.users, []);
    return users.map(u=>({ id:u.id, username:u.username, name:u.name, role:u.role, createdAt:u.createdAt, updatedAt:u.updatedAt }));
  },
  async createUser(body){
    const users = lsGet(DB_KEYS.users, []);
    if(users.some(u=>u.username===body.username)) throw new Error('Username already exists');
    const user = { id: nextId(users), username: body.username, name: body.name||'', role: body.role||'editor', password: body.password||'changeme', createdAt: Date.now(), updatedAt: Date.now() };
    users.push(user); lsSet(DB_KEYS.users, users);
    return { id:user.id, username:user.username, name:user.name, role:user.role, createdAt:user.createdAt, updatedAt:user.updatedAt };
  },
  async updateUser(id, body){
    const users = lsGet(DB_KEYS.users, []);
    const i = users.findIndex(u=> String(u.id)===String(id)); if(i<0) throw new Error('Not found');
    users[i] = { ...users[i], ...body, updatedAt: Date.now() };
    lsSet(DB_KEYS.users, users);
    const u = users[i];
    return { id:u.id, username:u.username, name:u.name, role:u.role, createdAt:u.createdAt, updatedAt:u.updatedAt };
  },
  async deleteUser(id){
    let users = lsGet(DB_KEYS.users, []);
    users = users.filter(u=> String(u.id)!==String(id)); lsSet(DB_KEYS.users, users);
    return { ok:true };
  },
};

// ---------- real API wrapper (used if API_BASE is set) ----------
function authHeaders(extra={}){ const t=getToken(); return { ...(extra||{}), ...(t ? { Authorization:'Bearer '+t } : {}) }; }
const realApi = {
  async me(){ const r = await fetch(API_BASE + '/api/me', { credentials:'include', headers:authHeaders() }); return safeJson(r); },
  async login(username,password){ const r=await fetch(API_BASE + '/api/auth/login',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),credentials:'include',body:JSON.stringify({username,password})}); const d=await safeJson(r); if(!r.ok) throw new Error(d.error||'Login failed'); setToken(d.token); return d; },
  async logout(){ await fetch(API_BASE + '/api/auth/logout',{method:'POST',headers:authHeaders(),credentials:'include'}); setToken(''); },
  async listTemplates(){ const r=await fetch(API_BASE + '/api/templates',{headers:authHeaders(),credentials:'include'}); const d=await safeJson(r); return d.items||[]; },
  async createTemplate(t){ const r=await fetch(API_BASE + '/api/templates',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),credentials:'include',body:JSON.stringify(t)}); const d=await safeJson(r); if(!r.ok) throw new Error('Create failed'); return d.item; },
  async updateTemplate(id,t){ const r=await fetch(API_BASE + `/api/templates/${id}`,{method:'PUT',headers:authHeaders({'Content-Type':'application/json'}),credentials:'include',body:JSON.stringify(t)}); const d=await safeJson(r); if(!r.ok) throw new Error('Update failed'); return d.item; },
  async deleteTemplate(id){ const r=await fetch(API_BASE + `/api/templates/${id}`,{method:'DELETE',headers:authHeaders(),credentials:'include'}); if(!r.ok) throw new Error('Delete failed'); },
  async listDocs(){ const r=await fetch(API_BASE + '/api/documents',{headers:authHeaders(),credentials:'include'}); const d=await safeJson(r); return d.items||[]; },
  async render(body){ const r=await fetch(API_BASE + '/api/documents',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),credentials:'include',body:JSON.stringify(body)}); const d=await safeJson(r); if(!r.ok) throw new Error('Render failed'); return d.item; },
  async listUsers(){ const r=await fetch(API_BASE + '/api/auth/users',{headers:authHeaders(),credentials:'include'}); const d=await safeJson(r); if(!r.ok) throw new Error(d.error||'List users failed'); return d.users||[]; },
  async createUser(body){ const r=await fetch(API_BASE + '/api/auth/users',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),credentials:'include',body:JSON.stringify(body)}); const d=await safeJson(r); if(!r.ok) throw new Error(d.error||'Create user failed'); return d.user; },
  async updateUser(id, body){ const r=await fetch(API_BASE + `/api/auth/users/${id}`,{method:'PUT',headers:authHeaders({'Content-Type':'application/json'}),credentials:'include',body:JSON.stringify(body)}); const d=await safeJson(r); if(!r.ok) throw new Error(d.error||'Update user failed'); return d.user; },
  async deleteUser(id){ const r=await fetch(API_BASE + `/api/auth/users/${id}`,{method:'DELETE',headers:authHeaders(),credentials:'include'}); if(!r.ok) throw new Error('Delete user failed'); },
};
async function safeJson(res){
  // Avoid "Unexpected end of JSON input"
  const ct = res.headers.get('content-type')||'';
  if(ct.includes('application/json')) return res.json();
  const text = await res.text();
  try{ return JSON.parse(text||'{}'); }catch{ return { ok: res.ok, status: res.status, text }; }
}

// choose api
const api = NO_BACKEND ? mockApi : realApi;

// ---------- responsive nav ----------
const desktopMQ = window.matchMedia('(min-width: 900px)');
function applyResponsiveNav(){
  if(!state.user) return;
  const drawer = document.getElementById('drawer');
  if(!drawer) return;
  if(desktopMQ.matches){ drawer.classList.remove('hidden'); }
  else { drawer.classList.add('hidden'); document.body.classList.remove('nav-open'); }
}
if (desktopMQ.addEventListener) desktopMQ.addEventListener('change', applyResponsiveNav);
else if (desktopMQ.addListener) desktopMQ.addListener(applyResponsiveNav);

// ---------- auth / UI helpers ----------
function setUser(user){
  state.user = user;
  $('#user-info').textContent = user ? `${user.username} (${user.role})` : '';
  $('#logout-btn').classList.toggle('hidden', !user);
  $('#burger').classList.toggle('hidden', !user);
  document.body.classList.toggle('authed', !!user);
  document.body.classList.toggle('guest', !user);
  document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden', !(user && user.role==='admin')));
  const navCmp = document.querySelector('nav a[href="#/compose"]');
  const isViewer = !!user && user.role === 'viewer';
  if(navCmp) navCmp.classList.toggle('hidden', isViewer);
  const drawer = document.getElementById('drawer');
  if(!user){ drawer.classList.add('hidden'); document.body.classList.remove('nav-open'); }
  else { applyResponsiveNav(); }
}
function showLoginOverlay(){ const o = document.getElementById('login'); if(o) o.style.display = 'grid'; }
function hideLoginOverlay(){ const o = document.getElementById('login'); if(o) o.style.display = 'none'; }
function bindOverlayLogin(){
  const form = document.getElementById('overlay-login-form');
  if(!form) return;
  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const username = document.getElementById('ov-username').value.trim();
    const password = document.getElementById('ov-password').value;
    if(!username || !password) return;
    try{
      const res = await api.login(username, password);
      setUser(res.user);
      await bootstrapData();
      hideLoginOverlay();
      navigate('#/home');
    }catch(err){ alert(err.message || 'Login failed'); }
  });
}

// ---------- router ----------
const routes = [];
function addRoute(path, render, options={}){ routes.push({ path, render, auth: !!options.auth, roles: options.roles||null }); }
function navigate(path){ location.hash = path; }
window.addEventListener('hashchange', handleRoute);

async function handleRoute(){
  const path = location.hash || '#/login';
  const route = routes.find(r => r.path === path) || routes.find(r => r.path === '#/not-found');
  if(route?.auth && !state.authReady) return;
  if(route?.auth && !state.user){ showLoginOverlay(); return; }
  if(route?.roles && state.user && !route.roles.includes(state.user.role)){ return navigate('#/home'); }
  app.innerHTML = '';
  await route.render();
}

// ---------- templating helpers ----------
function extractVars(tpl){ const set = new Set(); const re = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g; let m; while((m=re.exec(tpl))) set.add(m[1]); return [...set]; }
function renderPreviewWithAnchors(tpl, data){
  return tpl.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_, k)=> String(data[k] ?? '') + `<span class="ph-anchor" data-ph="${k}"></span>`);
}
function scrollPreviewToVar(key, opts={}){
  const scroller = document.querySelector('.preview-scroll');
  const target = document.querySelector(`#preview .ph-anchor[data-ph="${key}"]`);
  if(!scroller || !target) return;
  try{ target.scrollIntoView({ block: opts.block||'center', inline:'nearest', behavior: opts.behavior||'auto' }); }catch{}
}
function isAnchorVisible(key){
  const scroller = document.querySelector('.preview-scroll');
  const target = document.querySelector(`#preview .ph-anchor[data-ph="${key}"]`);
  if(!scroller || !target) return false;
  const sr = scroller.getBoundingClientRect(), tr = target.getBoundingClientRect(), m=24;
  return tr.top >= sr.top + m && tr.bottom <= sr.bottom - m;
}
function initPreviewFollow(){
  const scroller = document.querySelector('.preview-scroll'); if(!scroller) return;
  const onUserScroll = ()=>{ if(state.alwaysFollowUntilSave) return; state.followPreview=false; if(state._followTimer) clearTimeout(state._followTimer); state._followTimer=setTimeout(()=>{state.followPreview=true;},900); };
  scroller.addEventListener('wheel', onUserScroll, { passive:true });
  scroller.addEventListener('touchstart', onUserScroll, { passive:true });
  scroller.addEventListener('scroll', onUserScroll, { passive:true });
}

// ---------- views (same UI as before) ----------
/* ... TEMPLATES, COMPOSE, LETTERS, HOME, PROFILE, ADMIN USERS ...
   (unchanged except: downloadPdf now saves HTML file client-side)
*/

async function viewTemplates(){
  const tpl = `
  <div class="templates-grid">
    <section class="list-panel">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">Templates</h2>
        <div class="row" style="gap:6px">
          <button id="new-template-btn">New</button>
          <input id="upload-input" type="file" accept=".html,.htm,.docx,.txt" style="display:none" />
          <button id="upload-btn" class="secondary">Upload</button>
        </div>
      </div>
      <select id="template-list" size="10"></select>
      <div class="row" style="gap:8px;margin-top:10px">
        <button id="save-template-btn" disabled>Save</button>
        <button id="delete-template-btn" disabled class="danger">Delete</button>
      </div>
    </section>
    <section class="editor-panel">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">Editor</h2>
        <button class="secondary" id="go-compose">Go to Compose →</button>
      </div>
      <div class="field-grid">
        <div><label>Name</label><input id="template-name" placeholder="Template name" /></div>
        <div><label>Description</label><input id="template-desc" placeholder="Optional" /></div>
      </div>
      <label>Content (use {{placeholders}})</label>
      <textarea id="template-content" rows="18" placeholder="Dear {{employee}},\nWelcome to {{company}}."></textarea>
      <p class="help">Tip: Use placeholders like {{name}}, {{date}}. Then open Compose to fill data and preview.</p>
    </section>
  </div>`;
  app.innerHTML = tpl;
  renderTemplates();
  $('#new-template-btn').addEventListener('click', ()=>{ state.currentId=null; $('#template-name').value=''; $('#template-desc').value=''; $('#template-content').value=''; updateVars(); $('#save-template-btn').disabled=false; });
  $('#save-template-btn').addEventListener('click', saveTemplate);
  $('#delete-template-btn').addEventListener('click', deleteTemplate);
  $('#upload-btn').addEventListener('click', ()=> document.getElementById('upload-input').click());
  document.getElementById('upload-input').addEventListener('change', onUploadTemplate);
  $('#template-list').addEventListener('change', (e)=>{ state.currentId=e.target.value; state.varsPage = 0; renderTemplates(); });
  $('#template-content').addEventListener('input', updateVars);

  if (state.user?.role === 'viewer') {
    ['new-template-btn','upload-btn','save-template-btn','delete-template-btn'].forEach(id=>{ const el = document.getElementById(id); if (el) el.disabled = true; });
    ['template-name','template-desc','template-content'].forEach(id=>{ const el = document.getElementById(id); if (el) el.setAttribute('readonly','true'); });
    const goCompose = document.getElementById('go-compose'); if(goCompose) goCompose.classList.add('hidden');
  } else {
    $('#go-compose').addEventListener('click', ()=> navigate('#/compose'));
  }
}

async function viewCompose(){
  const tpl = `
  <section>
    <div class="row" style="justify-content:space-between;align-items:center">
      <h2 style="margin:0">Compose</h2>
      <div class="row" style="gap:8px">
        <label style="margin:0">Template</label>
        <select id="compose-template"></select>
      </div>
    </div>
    <div class="editor-preview" style="margin-top:8px">
      <div class="placeholders-panel">
        <h3 class="subhead" style="margin:0 0 6px">Placeholders</h3>
        <div id="vars"></div>
        <h3 class="subhead">Common Fields</h3>
        <div id="custom-fields"></div>
        <div class="row"><button id="render-btn" disabled>Render & Save</button></div>
      </div>
      <div class="preview-panel">
        <div class="preview-toolbar">
          <h3 class="subhead" style="margin:0">Live Preview</h3>
          <div class="row" style="gap:6px">
            <div class="zoom-controls">
              <button id="zoom-out" class="secondary" title="Zoom out">-</button>
              <button id="zoom-in" class="secondary" title="Zoom in">+</button>
            </div>
            <button id="download-btn" class="secondary">Download</button>
          </div>
        </div>
        <div class="preview-scroll" style="margin-top:6px"><div id="preview" class="preview a4-page"></div></div>
      </div>
    </div>
  </section>`;
  app.innerHTML = tpl;
  state.alwaysFollowUntilSave = true;
  state.followPreview = true;
  state.varsPage = 0;
  const sel = document.getElementById('compose-template');
  sel.innerHTML = '';
  state.templates.forEach(t=>{ const opt=document.createElement('option'); opt.value=t.id; opt.textContent=t.name; if(t.id===state.currentId) opt.selected=true; sel.appendChild(opt); });
  if(!state.currentId && state.templates[0]) state.currentId = state.templates[0].id;
  renderCustomFields(); updateVars(); livePreview();
  sel.addEventListener('change', (e)=>{ state.currentId = e.target.value; state.varsPage = 0; updateVars(); livePreview(); });
  document.getElementById('download-btn')?.addEventListener('click', downloadDocClient);
  document.getElementById('render-btn')?.addEventListener('click', renderDocument);
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const getZoom=()=> parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--preview-zoom')||'1')||1;
  document.getElementById('zoom-in')?.addEventListener('click', ()=>{ const z=clamp(getZoom()+0.05,0.7,1.5); document.documentElement.style.setProperty('--preview-zoom', z); });
  document.getElementById('zoom-out')?.addEventListener('click', ()=>{ const z=clamp(getZoom()-0.05,0.7,1.5); document.documentElement.style.setProperty('--preview-zoom', z); });
  initPreviewFollow();
}

async function viewDocuments(){
  app.innerHTML = `
    <section class="center container">
      <h2>Previous Letters</h2>
      <div class="row" style="margin-top:6px; align-items:center">
        <input id="doc-search" type="search" placeholder="Search by name, id, or data..." />
        <button id="doc-clear" class="secondary" style="display:none">Clear</button>
        <div id="doc-meta" style="margin-left:auto; color:var(--muted); font-size:12px"></div>
      </div>
      <ul id="docs"></ul>
    </section>`;
  if(!state.docs.length) state.docs = await api.listDocs();
  const input = document.getElementById('doc-search');
  if(input){ input.value = state.docsQuery || ''; input.addEventListener('input', ()=>{ state.docsQuery = input.value; renderDocs(); }); }
  const clearBtn=document.getElementById('doc-clear'); if(clearBtn){ clearBtn.onclick=()=>{ state.docsQuery=''; if(input) input.value=''; renderDocs(); }; }
  renderDocs();
}
function renderDocs(){
  const ul=$('#docs'); if(!ul) return; ul.innerHTML='';
  const meta = document.getElementById('doc-meta');
  const q = (state.docsQuery||'').trim().toLowerCase();
  let docs = state.docs.slice().reverse();
  if(q){
    const includes=(s)=> (s||'').toString().toLowerCase().includes(q);
    docs = docs.filter(d=>{
      const idStr=(d.id||'').toString(), fname=d.fileName||'', dataVals = d.data?Object.values(d.data).filter(v=>v!=null).join(' '):'';
      return includes(idStr)||includes(fname)||includes(dataVals);
    });
  }
  const total = docs.length;
  docs = docs.slice(0,20);
  const clearBtn=document.getElementById('doc-clear'); if(clearBtn) clearBtn.style.display = q ? '' : 'none';
  if(meta){ const showing = docs.length; meta.textContent = `${showing}/${total} shown${q?` for "${state.docsQuery}"`:''}`; }
  if(docs.length===0){ const li=document.createElement('li'); li.textContent = q ? 'No matching letters' : 'No letters yet'; ul.appendChild(li); return; }
  docs.forEach(d=>{
    const li=document.createElement('li');
    const a=document.createElement('a');
    a.textContent = d.fileName || `Doc ${d.id}`;
    a.href = '#'; a.onclick=(e)=>{ e.preventDefault(); previewSavedDoc(d); };
    li.appendChild(a); ul.appendChild(li);
  });
}
function previewSavedDoc(d){
  const html = `<html><head><meta charset="utf-8"><title>${d.fileName||('Doc '+d.id)}</title></head><body><pre style="white-space:pre-wrap;font:14px/1.4 -apple-system,Segoe UI,Roboto,Arial">${renderText(getActiveContentFromId(d.templateId)||d.content, d.data)}</pre></body></html>`;
  const blob = new Blob([html], { type:'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// ---------- shared editors ----------
function renderTemplates(){
  const list = $('#template-list'); if(!list) return;
  list.innerHTML='';
  state.templates.forEach(t=>{ const opt=document.createElement('option'); opt.value=t.id; opt.textContent=t.name; if(t.id===state.currentId) opt.selected=true; list.appendChild(opt); });
  const t = state.templates.find(x=>x.id==state.currentId);
  $('#template-name').value = t?.name || '';
  $('#template-desc').value = t?.description || '';
  $('#template-content').value = t?.content || '';
  $('#save-template-btn').disabled = !t;
  $('#delete-template-btn').disabled = !t;
  updateVars();
}
function getActiveContent(){
  const editor = document.getElementById('template-content');
  if(editor) return editor.value || '';
  const sel = document.getElementById('compose-template');
  if(sel){ const t = state.templates.find(x=>x.id==sel.value); return t?.content || ''; }
  return '';
}
function getActiveContentFromId(id){
  const t = state.templates.find(x=>x.id==id);
  return t?.content || '';
}
function updateVars(){
  const content = getActiveContent();
  const vars = extractVars(content).slice();
  state.varsOrder = vars.slice();
  const panel = $('#vars'); if(!panel) return; panel.innerHTML='';

  const fmt = (k)=> (String(k||'').replace(/[._-]+/g,' ').trim().replace(/\s+/g,' ')).replace(/^./,c=>c.toUpperCase());
  const autoResize = (ta)=>{ ta.style.height='auto'; ta.style.height=Math.min(400, Math.max(38, ta.scrollHeight))+'px'; };

  const PAGE_SIZE = 7;
  const total = vars.length, totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if(!Number.isInteger(state.varsPage)) state.varsPage=0;
  state.varsPage = Math.max(0, Math.min(state.varsPage, totalPages-1));
  const start = state.varsPage * PAGE_SIZE, end = start + PAGE_SIZE, pageVars = vars.slice(start, end);

  pageVars.forEach(v=>{
    const row = document.createElement('div'); row.className='row placeholder-row';
    const label = document.createElement('label'); label.textContent = fmt(v);
    const input = document.createElement('textarea'); input.rows=2; input.placeholder='Enter '+fmt(v); input.value = state.data[v] || ''; autoResize(input);
    if(state.user?.role === 'viewer'){ input.readOnly=true; input.disabled=true; }
    else{
      const isLast = vars[vars.length-1]===v;
      input.addEventListener('input', (e)=>{ state.data[v]=e.target.value; autoResize(e.target); livePreview(v, { force:isLast }); });
      input.addEventListener('focus', ()=> scrollPreviewToVar(v, { behavior:'smooth' }));
    }
    row.appendChild(label); row.appendChild(input); panel.appendChild(row);
  });

  if(total>PAGE_SIZE){
    const nav=document.createElement('div');
    nav.className='placeholder-nav';
    const info=document.createElement('div');
    info.className='hint page-info';
    info.textContent='Placeholders '+(start+1)+'-'+Math.min(end,total)+' of '+total;
    const btns=document.createElement('div');
    btns.className='pager-buttons';
    const prev=document.createElement('button');
    prev.type='button';
    prev.className='secondary pager-btn';
    prev.textContent='Prev';
    prev.disabled=state.varsPage<=0;
    prev.setAttribute('aria-label','Previous placeholders');
    prev.onclick=()=>{ const newPage=Math.max(0,state.varsPage-1); const firstKey=vars[newPage*PAGE_SIZE]; state.varsPage=newPage; updateVars(); panel.scrollTop=0; if(firstKey) setTimeout(()=>scrollPreviewToVar(firstKey,{behavior:'smooth'}),0); };
    const next=document.createElement('button');
    next.type='button';
    next.className='secondary pager-btn';
    next.textContent='Next';
    next.disabled=state.varsPage>=totalPages-1;
    next.setAttribute('aria-label','Next placeholders');
    next.onclick=()=>{ const newPage=Math.min(totalPages-1,state.varsPage+1); const firstKey=vars[newPage*PAGE_SIZE]; state.varsPage=newPage; updateVars(); panel.scrollTop=0; if(firstKey) setTimeout(()=>scrollPreviewToVar(firstKey,{behavior:'smooth'}),0); };
    btns.appendChild(prev);
    btns.appendChild(next);
    nav.appendChild(info);
    nav.appendChild(btns);
    panel.appendChild(nav);
  }
  const btn = $('#render-btn'); if(btn) btn.disabled = !state.user || state.user.role==='viewer' || !content;
  const dBtn = document.getElementById('download-btn'); if(dBtn) dBtn.disabled = !content;
  livePreview();
}
function livePreview(activeKey, opts={}){
  const content = getActiveContent();
  const prev = $('#preview');
  if(prev){
    prev.innerHTML = renderPreviewWithAnchors(content, state.data);
    if(activeKey){
      const shouldScroll = (opts.force===true) || (state.followPreview && !isAnchorVisible(activeKey));
      if(shouldScroll){ setTimeout(()=> scrollPreviewToVar(activeKey, { behavior:'smooth', ...opts }), 0); }
    }
  }
}
function renderCustomFields(){
  const container = document.getElementById('custom-fields'); if(!container) return;
  const fields = [{key:'name',label:'Name'},{key:'address',label:'Address',multiline:true},{key:'ctc',label:'CTC'},{key:'annual_salary',label:'Annual Salary'}];
  container.innerHTML = '';
  fields.forEach(f=>{
    const row=document.createElement('div'); row.className='row';
    const label=document.createElement('label'); label.textContent=f.label;
    const control=f.multiline?document.createElement('textarea'):document.createElement('input');
    if(f.multiline) control.rows=2;
    control.placeholder=f.label; control.value=state.data[f.key]||'';
    if(state.user?.role==='viewer'){ control.readOnly=true; control.disabled=true; }
    else{
      const isLastCommon = Array.isArray(state.varsOrder) && state.varsOrder[state.varsOrder.length-1]===f.key;
      control.addEventListener('input',(e)=>{ state.data[f.key]=e.target.value; livePreview(f.key,{ force:isLastCommon }); });
      control.addEventListener('focus',()=> scrollPreviewToVar(f.key,{ behavior:'smooth' }));
    }
    row.appendChild(label); row.appendChild(control); container.appendChild(row);
  });
}

// CRUD actions
async function saveTemplate(){
  const t = { name: $('#template-name').value.trim(), description: $('#template-desc').value.trim(), content: $('#template-content').value };
  if(!t.name || !t.content) return alert('Name and content required');
  if(state.currentId){ const updated = await api.updateTemplate(state.currentId,t); const idx=state.templates.findIndex(x=>x.id==state.currentId); state.templates[idx]=updated; }
  else { const created = await api.createTemplate(t); state.templates.push(created); state.currentId=created.id; }
  renderTemplates();
}
async function deleteTemplate(){ if(!state.currentId) return; if(!confirm('Delete template?')) return; await api.deleteTemplate(state.currentId); state.templates=state.templates.filter(x=>x.id!=state.currentId); state.currentId=null; renderTemplates(); }
async function renderDocument(){
  const t = getActiveContent(); if(!t) return alert('No template content');
  try{
    const doc = await api.render({ content:t, data:state.data, templateId: state.currentId || null });
    state.docs.push(doc);
    state.alwaysFollowUntilSave = false;
    alert('Document saved. See Letters page to open.');
  }catch(e){ alert('Render failed: '+(e.message||'')); }
}

// Download (client-only): saves rendered HTML file
function renderText(tpl, data){
  return tpl.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_,k)=> String(data[k] ?? ''));
}
async function downloadDocClient(){
  const content = getActiveContent(); if(!content) return alert('Add some content first');
  const tpl = state.templates.find(x=>x.id==state.currentId);
  const date = new Date().toISOString().slice(0,10);
  let desired = prompt('Enter file name', `${(tpl?.name||'document')}-${date}.pdf`);
  if(desired == null) return;
  desired = (desired || '').trim();
  if(!desired) desired = `document-${date}.pdf`;
  if(!/\.pdf$/i.test(desired)) desired += '.pdf';

  if(NO_BACKEND){
    alert('PDF download requires the server API. Falling back to HTML download.');
    const html = `<!doctype html><meta charset="utf-8"><title>${desired}</title><pre style="white-space:pre-wrap;font:14px/1.4 -apple-system,Segoe UI,Roboto,Arial">${renderText(content, state.data)}</pre>`;
    const blob = new Blob([html], { type:'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = desired.replace(/\.pdf$/i, '.html'); document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    return;
  }

  try{
    const payload = {
      templateId: state.currentId || null,
      content,
      data: state.data,
      fileName: desired,
    };
    const res = await fetch(API_BASE + '/api/documents/pdf', {
      method:'POST',
      headers: authHeaders({ 'Content-Type':'application/json' }),
      credentials:'include',
      body: JSON.stringify(payload),
    });
    if(!res.ok){
      const errText = await res.text();
      throw new Error(errText || `Request failed with ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = desired; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    try { state.docs = await api.listDocs(); } catch {}
  } catch (err) {
    console.error('PDF download failed:', err);
    alert('Failed to download PDF: ' + (err.message || 'Unknown error'));
  }
}

// upload/import basic
async function onUploadTemplate(e){
  const f = e.target.files && e.target.files[0]; if(!f) return;
  const text = await f.text();
  document.getElementById('template-name').value = (f.name||'Imported').replace(/\.[^.]+$/, '');
  document.getElementById('template-content').value = text || '';
  state.data = {};
  updateVars();
}

// Home/Profile/Admin (unchanged UI)
async function viewHome(){
  const count = state.templates.length;
  const isAdmin = state.user?.role === 'admin';
  const adminTile = isAdmin ? `
    <div class="tile">
      <h3 style="margin-top:0">Quick Add User (Admin)</h3>
      <div class="row" style="gap:6px"><input id="qu-username" placeholder="Username" /><input id="qu-name" placeholder="Name" /></div>
      <div class="row" style="gap:6px;margin-top:6px"><select id="qu-role"><option>editor</option><option>viewer</option><option>admin</option></select><input id="qu-pass" type="password" placeholder="Password" /><button id="qu-create">Add</button></div>
      <small style="color:var(--muted)">Full user management is under Users.</small>
    </div>` : '';

  const home = `
  <section class="center container">
    <h2>Home</h2>
    <p style="color:var(--muted)">Start by choosing a template to create a letter, or manage your templates.</p>
    <div class="tile-grid" style="margin-top:8px">
      <div class="tile" id="tile-templates">
        <h3 style="margin-top:0">Templates</h3>
        <p style="color:var(--muted)}">${count} available</p>
        <div class="row" style="gap:8px"><button id="go-templates" class="secondary">Manage</button><button id="qc-create" class="success">Quick Create</button></div>
        <div class="row" style="gap:6px;margin-top:6px"><input id="qc-name" placeholder="Template name" /></div>
      </div>
      <div class="tile">
        <h3 style="margin-top:0">Letters</h3>
        <p style="color:var(--muted)">Review and open previous letters</p>
        <button id="go-letters" class="secondary">Open Letters</button>
      </div>
      ${adminTile}
    </div>
  </section>`;
  app.innerHTML = home;
  document.getElementById('go-templates').onclick = ()=> navigate('#/templates');
  document.getElementById('go-letters').onclick = ()=> navigate('#/letters');
  document.getElementById('qc-create').onclick = async ()=>{
    const name = document.getElementById('qc-name').value.trim(); if(!name) return;
    const created = await api.createTemplate({ name, description:'', content:'Hello {{name}}' });
    state.templates.push(created); state.currentId = created.id; navigate('#/templates');
  };
  if(state.user?.role === 'viewer'){
    document.getElementById('qc-create')?.classList.add('hidden');
    const qcName = document.getElementById('qc-name'); if(qcName) qcName.disabled = true;
  }
  if(isAdmin){
    document.getElementById('qu-create')?.addEventListener('click', async ()=>{
      const username = document.getElementById('qu-username').value.trim();
      const name = document.getElementById('qu-name').value.trim();
      const role = document.getElementById('qu-role').value;
      const password = document.getElementById('qu-pass').value;
      if(!username || !password) return alert('Username and password required');
      try{
        const created = await api.createUser({ username, name, role, password });
        state.users = await api.listUsers();
        state.selectedUserId = created?.id || null;
        alert('User created');
        document.getElementById('qu-username').value=''; document.getElementById('qu-name').value=''; document.getElementById('qu-pass').value='';
      }catch(e){ alert(e.message); }
    });
  }
}

async function viewProfile(){
  const u = state.user || {};
  const initial = (u.name || u.username || '?').toString().charAt(0).toUpperCase();
  const joined = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-';
  const updated = u.updatedAt ? new Date(u.updatedAt).toLocaleDateString() : '-';
  app.innerHTML = `
  <section class="center container profile-card">
    <div class="profile-header">
      <div class="avatar xl">${initial}</div>
      <div class="meta">
        <div class="name">${u.name || u.username || ''}</div>
        <div class="username">@${u.username || ''}</div>
        <span class="badge ${u.role}">${u.role || ''}</span>
      </div>
    </div>
    <div class="profile-grid">
      <div class="item"><label>Username</label><div class="value">${u.username || ''}</div></div>
      <div class="item"><label>Role</label><div class="value">${u.role || ''}</div></div>
      <div class="item"><label>Name</label><div class="value">${u.name || '—'}</div></div>
      <div class="item"><label>Joined</label><div class="value">${joined}</div></div>
      <div class="item"><label>Last Updated</label><div class="value">${updated}</div></div>
    </div>
  </section>`;
}

async function viewAdminUsers(){
  app.innerHTML = `
  <section>
    <div class="row" style="justify-content:space-between; align-items:center">
      <h2 style="margin:0">Admin: Users</h2>
      <div class="row" style="gap:6px">
        <input id="user-search" placeholder="Search users" style="max-width:220px" />
        <button id="user-add-btn" class="success">Add User</button>
      </div>
    </div>
    <div class="users-grid" style="margin-top:8px">
      <div><div id="users-list" class="user-list"></div></div>
      <div><div id="user-detail" class="user-detail"></div></div>
    </div>
  </section>`;
  state.users = await api.listUsers();
  if(!state.selectedUserId && state.users.length){ state.selectedUserId = state.users[0].id; }
  renderUserList(); renderUserDetail();
  document.getElementById('user-search')?.addEventListener('input', ()=> renderUserList());
  document.getElementById('user-add-btn')?.addEventListener('click', ()=>{ state.creatingUser = true; state.selectedUserId = null; renderUserList(); renderUserDetail(); });
}
function renderUserList(){
  const container = document.getElementById('users-list'); if(!container) return; container.innerHTML='';
  const q = (document.getElementById('user-search')?.value || '').toLowerCase();
  const items = state.users.filter(u=> !q || (u.username||'').toLowerCase().includes(q) || (u.name||'').toLowerCase().includes(q));
  if(!items.length){ container.innerHTML = '<p style="color:var(--muted)">No users found.</p>'; return; }
  items.forEach(u=>{
    const card = document.createElement('button'); card.type='button';
    const selected = u.id===state.selectedUserId && !state.creatingUser;
    card.className = 'user-card' + (selected ? ' selected' : '');
    const initial = (u.name||u.username||'?').charAt(0).toUpperCase();
    card.innerHTML = `<div class="avatar">${initial}</div><div class="meta"><div class="name">${u.name||u.username}</div><div class="username">@${u.username}</div><span class="badge ${u.role}">${u.role}</span></div>`;
    card.onclick = ()=>{ state.creatingUser = false; state.selectedUserId = u.id; renderUserList(); renderUserDetail(); };
    container.appendChild(card);
  });
}
function renderUserDetail(){
  const panel = document.getElementById('user-detail'); if(!panel) return;
  if(state.creatingUser || !state.selectedUserId){
    panel.innerHTML = `
      <h3 style="margin-top:0">Create User</h3>
      <div class="row" style="margin-top:6px"><label style="width:30%">Username</label><input id="cu-username" placeholder="Username" /></div>
      <div class="row" style="margin-top:6px"><label style="width:30%">Name</label><input id="cu-name" placeholder="Full name (optional)" /></div>
      <div class="row" style="margin-top:6px"><label style="width:30%">Role</label><select id="cu-role"><option value="editor">editor</option><option value="viewer">viewer</option><option value="admin">admin</option></select></div>
      <div class="row" style="margin-top:6px"><label style="width:30%">Password</label><input id="cu-pass" type="password" placeholder="Password" /></div>
      <div class="user-actions" style="margin-top:12px">
        <button id="cu-create" class="success">Create User</button>
        <button id="cu-cancel" class="secondary">Cancel</button>
      </div>`;
    document.getElementById('cu-create')?.addEventListener('click', async ()=>{
      const username = document.getElementById('cu-username').value.trim();
      const name = document.getElementById('cu-name').value.trim();
      const role = document.getElementById('cu-role').value;
      const password = document.getElementById('cu-pass').value;
      if(!username || !password) return alert('Username and password required');
      try{
        const created = await api.createUser({ username, name, role, password });
        state.users = await api.listUsers();
        state.selectedUserId = created?.id || null;
        state.creatingUser = false; renderUserList(); renderUserDetail();
        alert('User created');
      }catch(e){ alert(e.message); }
    });
    document.getElementById('cu-cancel')?.addEventListener('click', ()=>{ state.creatingUser=false; if(!state.selectedUserId && state.users[0]) state.selectedUserId=state.users[0].id; renderUserList(); renderUserDetail(); });
    return;
  }
  const u = state.users.find(x=>x.id===state.selectedUserId);
  if(!u){ panel.innerHTML = '<p style="color:var(--muted)">Select a user to manage.</p>'; return; }
  panel.innerHTML = `
    <div class="user-header">
      <div class="avatar lg">${(u.name||u.username||'?').charAt(0).toUpperCase()}</div>
      <div class="meta">
        <div class="name">${u.name||u.username}</div>
        <div class="username">@${u.username}</div>
      </div>
    </div>
    <div class="row" style="margin-top:12px"><label style="width:30%">Name</label><input id="ud-name" value="${u.name||''}" placeholder="Name" /></div>
    <div class="row" style="margin-top:6px"><label style="width:30%">Role</label><select id="ud-role"><option value="admin">admin</option><option value="editor">editor</option><option value="viewer">viewer</option></select></div>
    <div class="user-actions" style="margin-top:12px">
      <button id="ud-save" class="success">Save Changes</button>
      <button id="ud-reset">Reset Password</button>
      <button id="ud-delete" class="danger">Delete Account</button>
    </div>`;
  document.getElementById('ud-role').value = u.role;
  document.getElementById('ud-save')?.addEventListener('click', async ()=>{
    try{
      const body = { name: document.getElementById('ud-name').value, role: document.getElementById('ud-role').value };
      const updated = await api.updateUser(u.id, body);
      const idx = state.users.findIndex(x=>x.id===u.id); if(idx>-1) state.users[idx]=updated;
      renderUserList(); renderUserDetail(); alert('User updated');
    }catch(e){ alert(e.message); }
  });
  document.getElementById('ud-reset')?.addEventListener('click', async ()=>{
    const pwd = prompt(`Set a new password for ${u.username}`); if(pwd==null) return; const p=pwd.trim(); if(!p) return alert('Password required');
    try{ await api.updateUser(u.id, { password: p }); alert('Password reset'); }catch(e){ alert(e.message); }
  });
  document.getElementById('ud-delete')?.addEventListener('click', async ()=>{
    if(!confirm(`Delete user ${u.username}?`)) return;
    try{ await api.deleteUser(u.id); state.users = state.users.filter(x=>x.id!==u.id); state.selectedUserId = state.users[0]?.id || null; renderUserList(); renderUserDetail(); }catch(e){ alert(e.message); }
  });
}

// ---------- routes ----------
addRoute('#/login', ()=>{ app.innerHTML=''; });
addRoute('#/home', async ()=>{ await viewHome(); }, { auth:true });
addRoute('#/templates', viewTemplates, { auth:true });
addRoute('#/compose', viewCompose, { auth:true, roles:['admin','editor'] });
addRoute('#/letters', viewDocuments, { auth:true });
addRoute('#/profile', async ()=>{ await viewProfile(); }, { auth:true });
addRoute('#/admin/users', viewAdminUsers, { auth:true, roles:['admin'] });
addRoute('#/not-found', async()=>{ app.innerHTML='<section><h2>Not found</h2></section>'; });

// ---------- boot ----------
async function bootstrapData(){
  if(!state.user) return;
  state.templates = await (NO_BACKEND ? mockApi.listTemplates() : realApi.listTemplates());
  state.docs = await (NO_BACKEND ? mockApi.listDocs() : realApi.listDocs());
}
$('#logout-btn').addEventListener('click', async ()=>{ await api.logout(); setUser(null); showLoginOverlay(); navigate('#/login'); });
$('#burger').addEventListener('click', ()=>{ const d=document.getElementById('drawer'); const hidden=d.classList.toggle('hidden'); if(hidden){ document.body.classList.remove('nav-open'); } else { document.body.classList.add('nav-open'); } });
document.querySelectorAll('[data-route]').forEach(a=>a.addEventListener('click', ()=>{ if(window.innerWidth<900){ document.getElementById('drawer').classList.add('hidden'); document.body.classList.remove('nav-open'); } }));

(async function init(){
  const me = await api.me();
  setUser(me.user);
  state.authReady = true;
  bindOverlayLogin();
  if(state.user) hideLoginOverlay(); else showLoginOverlay();

  if(state.user){
    await bootstrapData();
    if(!location.hash || location.hash==='#/login') navigate('#/home');
  }
  handleRoute();
  applyResponsiveNav();
})();
