/* ========= utilities ========= */
const $ = (sel) => document.querySelector(sel);
const app = $('#app');

/* Responsive drawer */
const desktopMQ = window.matchMedia('(min-width: 900px)');
function applyResponsiveNav(){
  if(!state.user) return;
  const drawer = document.getElementById('drawer');
  if(!drawer) return;
  if(desktopMQ.matches){
    drawer.classList.remove('hidden');
  } else {
    drawer.classList.add('hidden');
    document.body.classList.remove('nav-open');
  }
}
if (desktopMQ.addEventListener) desktopMQ.addEventListener('change', applyResponsiveNav);
else if (desktopMQ.addListener) desktopMQ.addListener(applyResponsiveNav);

/* API base for split hosting */
const rawApiBase = window.API_BASE || (document.querySelector('meta[name="api-base"]')?.content || '');
const API_BASE = rawApiBase.replace(/\/$/, '');
const API_BASE_HAS_API_SEGMENT = (() => {
  if (!API_BASE) return false;
  try {
    const url = new URL(API_BASE, window.location.origin);
    return /\/api(?:\/|$)/.test(url.pathname);
  } catch (e) {
    return /\/api(?:\/|$)/.test(API_BASE);
  }
})();
const apiUrl = (path = '') => {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  if (!API_BASE) return suffix;
  if (API_BASE_HAS_API_SEGMENT && suffix.startsWith('/api')) {
    return API_BASE + suffix.replace(/^\/api/, '');
  }
  return API_BASE + suffix;
};
const TOKEN_KEY = 'hrms_token';
const getToken = ()=>{ try{ return localStorage.getItem(TOKEN_KEY) || ''; }catch{ return ''; } };
const setToken = (v)=>{ try{ if(v) localStorage.setItem(TOKEN_KEY, v); else localStorage.removeItem(TOKEN_KEY); }catch{} };
const authHeaders = (extra={})=>{ const t=getToken(); return { ...(extra||{}), ...(t ? { Authorization: 'Bearer '+t } : {}) }; };

/* ========= API ========= */
const api = {
  async me(){
    const r = await fetch(apiUrl('/api/me'), {
      credentials: API_BASE ? 'include' : 'same-origin',
      headers: authHeaders()
    });
    if (!r.ok) return { user: null };
    return r.json();
  },
  async login(username, password){
    const r = await fetch(apiUrl('/api/auth/login'), {
      method:'POST',
      headers: authHeaders({'Content-Type':'application/json'}),
      credentials: API_BASE ? 'include' : 'same-origin',
      body: JSON.stringify({ username, password })
    });
    if(!r.ok) throw new Error((await r.json()).error || 'Login failed');
    const data = await r.json();
    setToken(data.token);
    return data;
  },
  async logout(){
    try {
      await fetch(apiUrl('/api/auth/logout'), {
        method:'POST',
        headers: authHeaders(),
        credentials: API_BASE ? 'include' : 'same-origin'
      });
    } finally {
      setToken('');
    }
  },
  async listTemplates(){
    const r = await fetch(apiUrl('/api/templates'), { headers:authHeaders(), credentials: API_BASE ? 'include' : 'same-origin' });
    if (!r.ok) return { items: [] };
    return (await r.json()).items || [];
  },
  async createTemplate(t){
    const r = await fetch(apiUrl('/api/templates'), {
      method:'POST', headers:authHeaders({'Content-Type':'application/json'}),
      credentials: API_BASE ? 'include' : 'same-origin', body:JSON.stringify(t)
    });
    if(!r.ok) throw new Error('Create failed');
    return (await r.json()).item;
  },
  async updateTemplate(id, t){
    const r = await fetch(apiUrl(`/api/templates/${id}`), {
      method:'PUT', headers:authHeaders({'Content-Type':'application/json'}),
      credentials: API_BASE ? 'include' : 'same-origin', body:JSON.stringify(t)
    });
    if(!r.ok) throw new Error('Update failed');
    return (await r.json()).item;
  },
  async deleteTemplate(id){
    const r = await fetch(apiUrl(`/api/templates/${id}`), {
      method:'DELETE', headers:authHeaders(), credentials: API_BASE ? 'include' : 'same-origin'
    });
    if(!r.ok) throw new Error('Delete failed');
  },
  async listDocs(){
    const r = await fetch(apiUrl('/api/documents'), { headers:authHeaders(), credentials: API_BASE ? 'include' : 'same-origin' });
    if (!r.ok) return { items: [] };
    return (await r.json()).items || [];
  },
  async render(body){
    const r = await fetch(apiUrl('/api/documents'), {
      method:'POST', headers:authHeaders({'Content-Type':'application/json'}),
      credentials: API_BASE ? 'include' : 'same-origin', body:JSON.stringify(body)
    });
    if(!r.ok) throw new Error('Render failed');
    return (await r.json()).item;
  },

  // Admin
  async listUsers(){
    const r = await fetch(apiUrl('/api/auth/users'), { headers:authHeaders(), credentials: API_BASE ? 'include' : 'same-origin' });
    if(!r.ok) throw new Error((await r.json()).error || 'List users failed');
    return (await r.json()).users || [];
  },
  async createUser(body){
    const r = await fetch(apiUrl('/api/auth/users'), {
      method:'POST', headers:authHeaders({'Content-Type':'application/json'}),
      credentials: API_BASE ? 'include' : 'same-origin', body:JSON.stringify(body)
    });
    if(!r.ok) throw new Error((await r.json()).error || 'Create user failed');
    return (await r.json()).user;
  },
  async updateUser(id, body){
    const r = await fetch(apiUrl(`/api/auth/users/${id}`), {
      method:'PUT', headers:authHeaders({'Content-Type':'application/json'}),
      credentials: API_BASE ? 'include' : 'same-origin', body:JSON.stringify(body)
    });
    if(!r.ok) throw new Error((await r.json()).error || 'Update user failed');
    return (await r.json()).user;
  },
  async deleteUser(id){
    const r = await fetch(apiUrl(`/api/auth/users/${id}`), {
      method:'DELETE', headers:authHeaders(), credentials: API_BASE ? 'include' : 'same-origin'
    });
    if(!r.ok) throw new Error('Delete user failed');
  }
};

/* ========= state ========= */
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

function setUser(user){
  state.user = user;
  $('#user-info').textContent = user ? `${user.username} (${user.role})` : '';
  $('#logout-btn').classList.toggle('hidden', !user);
  $('#burger').classList.toggle('hidden', !user);
  document.body.classList.toggle('authed', !!user);
  document.body.classList.toggle('guest', !user);
  document.querySelectorAll('.admin-only').forEach(el=>{
    el.classList.toggle('hidden', !(user && user.role==='admin'));
  });
  const navCmp = document.querySelector('nav a[href="#/compose"]');
  const isViewer = !!user && user.role === 'viewer';
  if(navCmp) navCmp.classList.toggle('hidden', isViewer);
  const drawer = document.getElementById('drawer');
  if(!user){
    drawer.classList.add('hidden');
    document.body.classList.remove('nav-open');
  } else {
    applyResponsiveNav();
  }
}

/* ---------- Login overlay helpers ---------- */
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
    }catch(err){
      alert(err.message || 'Login failed');
    }
  });
}

/* ---------- Router ---------- */
const routes = [];
function addRoute(path, render, options={}){ routes.push({ path, render, auth: !!options.auth, roles: options.roles||null, title: options.title||'' }); }
function navigate(path){ location.hash = path; }
function redirectTo(path){ navigate(path); }
window.redirectTo = redirectTo;

window.addEventListener('hashchange', handleRoute);

async function handleRoute(){
  const path = location.hash || '#/login';
  const route = routes.find(r => r.path === path) || routes.find(r => r.path === '#/not-found');
  if(route?.auth && !state.authReady){ return; }
  if(route?.auth && !state.user){
    showLoginOverlay();
    return;
  }
  if(route?.roles && state.user && !route.roles.includes(state.user.role)){
    return redirectTo('#/home');
  }
  app.innerHTML = '';
  await route.render();
}

/* ---------- Views ---------- */
function viewLogin(){ app.innerHTML = ''; }

function extractVars(tpl){
  const set = new Set(); const re = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g; let m;
  while((m=re.exec(tpl))) set.add(m[1]);
  return [...set];
}
function renderPreviewWithAnchors(tpl, data){
  return tpl.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_, k)=>{
    const val = data[k] ?? '';
    return String(val) + `<span class="ph-anchor" data-ph="${k}"></span>`;
  });
}
function scrollPreviewToVar(key, opts={}){
  const scroller = document.querySelector('.preview-scroll');
  const target = document.querySelector(`#preview .ph-anchor[data-ph="${key}"]`);
  if(!scroller || !target) return;
  const isLast = Array.isArray(state.varsOrder) && state.varsOrder[state.varsOrder.length-1] === key;
  const block = opts.block || (isLast ? 'end' : 'center');
  if(isLast){
    try{ scroller.scrollTo({ top: scroller.scrollHeight, behavior: opts.behavior || 'auto' }); }
    catch{ scroller.scrollTop = scroller.scrollHeight; }
    return;
  }
  try{ target.scrollIntoView({ block, inline:'nearest', behavior: opts.behavior || 'auto' }); }
  catch{
    const tRect = target.getBoundingClientRect();
    const sRect = scroller.getBoundingClientRect();
    const delta = tRect.top - sRect.top - (block==='end' ? (sRect.height*0.85) : (sRect.height/2));
    scroller.scrollTop += delta;
  }
}
function isAnchorVisible(key){
  const scroller = document.querySelector('.preview-scroll');
  const target = document.querySelector(`#preview .ph-anchor[data-ph="${key}"]`);
  if(!scroller || !target) return false;
  const sr = scroller.getBoundingClientRect();
  const tr = target.getBoundingClientRect();
  const m = 24;
  return tr.top >= sr.top + m && tr.bottom <= sr.bottom - m;
}
function initPreviewFollow(){
  const scroller = document.querySelector('.preview-scroll');
  if(!scroller) return;
  const onUserScroll = ()=>{
    if(state.alwaysFollowUntilSave) return;
    state.followPreview = false;
    if(state._followTimer) clearTimeout(state._followTimer);
    state._followTimer = setTimeout(()=>{ state.followPreview = true; }, 900);
  };
  scroller.addEventListener('wheel', onUserScroll, { passive:true });
  scroller.addEventListener('touchstart', onUserScroll, { passive:true });
  scroller.addEventListener('scroll', onUserScroll, { passive:true });
}

async function viewTemplates(){
  const tpl = `
  <div class="templates-grid">
    <section class="list-panel">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">Templates</h2>
        <div class="row" style="gap:6px">
          <button id="new-template-btn">New</button>
          <input id="upload-input" type="file" accept=".html,.htm,.docx" style="display:none" />
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
        <div>
          <label>Name</label>
          <input id="template-name" placeholder="Template name" />
        </div>
        <div>
          <label>Description</label>
          <input id="template-desc" placeholder="Optional" />
        </div>
      </div>
      <label>Content (use {{placeholders}})</label>
      <textarea id="template-content" rows="18" placeholder="Dear {{employee}},\nWelcome to {{company}}."></textarea>
      <p class="help">Tip: Use placeholders like {{name}}, {{date}}. Then open Compose to fill data and preview.</p>
    </section>
  </div>`;
  app.innerHTML = tpl;
  renderTemplates();
  $('#new-template-btn').addEventListener('click', ()=>{
    state.currentId=null; $('#template-name').value=''; $('#template-desc').value=''; $('#template-content').value=''; updateVars(); $('#save-template-btn').disabled=false;
  });
  $('#save-template-btn').addEventListener('click', saveTemplate);
  $('#delete-template-btn').addEventListener('click', deleteTemplate);
  $('#upload-btn').addEventListener('click', ()=> document.getElementById('upload-input').click());
  document.getElementById('upload-input').addEventListener('change', onUploadTemplate);
  $('#template-list').addEventListener('change', (e)=>{ state.currentId=e.target.value; state.varsPage = 0; renderTemplates(); });
  $('#template-content').addEventListener('input', updateVars);

  $('#go-compose').addEventListener('click', ()=> navigate('#/compose'));

  if (state.user?.role === 'viewer') {
    ['new-template-btn','upload-btn','save-template-btn','delete-template-btn'].forEach(id=>{
      const el = document.getElementById(id); if (el) el.disabled = true;
    });
    ['template-name','template-desc','template-content'].forEach(id=>{
      const el = document.getElementById(id); if (el) el.setAttribute('readonly','true');
    });
    const goCompose = document.getElementById('go-compose');
    if(goCompose) goCompose.classList.add('hidden');
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
        <p class="hint" style="color:var(--muted);margin:0 0 8px">Fields appear based on placeholders in the selected template.</p>
        <div id="vars"></div>
        <h3 class="subhead">Common Fields</h3>
        <div id="custom-fields"></div>
        <div class="row">
          <button id="render-btn" disabled>Render & Save</button>
        </div>
      </div>
      <div class="preview-panel">
        <div class="preview-toolbar">
          <h3 class="subhead" style="margin:0">Live Preview</h3>
          <div class="row" style="gap:6px">
            <div class="zoom-controls">
              <button id="zoom-out" class="secondary" title="Zoom out">-</button>
              <button id="zoom-in" class="secondary" title="Zoom in">+</button>
            </div>
            <button id="download-btn" class="secondary">Download PDF</button>
          </div>
        </div>
        <div class="preview-scroll" style="margin-top:6px">
          <div id="preview" class="preview a4-page"></div>
        </div>
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

  renderCustomFields();
  updateVars();
  livePreview();

  sel.addEventListener('change', (e)=>{ state.currentId = e.target.value; state.varsPage = 0; updateVars(); livePreview(); });
  const dl = document.getElementById('download-btn'); if(dl) dl.addEventListener('click', downloadPdf);
  const rb = document.getElementById('render-btn'); if(rb) rb.addEventListener('click', renderDocument);

  const zin = document.getElementById('zoom-in');
  const zout = document.getElementById('zoom-out');
  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
  const getZoom = ()=> parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--preview-zoom')||'1') || 1;
  if(zin) zin.addEventListener('click', ()=>{ const z = clamp(getZoom() + 0.05, 0.7, 1.5); document.documentElement.style.setProperty('--preview-zoom', z); });
  if(zout) zout.addEventListener('click', ()=>{ const z = clamp(getZoom() - 0.05, 0.7, 1.5); document.documentElement.style.setProperty('--preview-zoom', z); });

  initPreviewFollow();
}

function renderTemplates(){
  const list = $('#template-list'); if(!list) return;
  list.innerHTML='';
  state.templates.forEach(t=>{ const opt=document.createElement('option'); opt.value=t.id; opt.textContent=t.name; if(t.id===state.currentId) opt.selected=true; list.appendChild(opt); });
  const t = state.templates.find(x=>x.id===state.currentId);
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
  if(sel){ const t = state.templates.find(x=>x.id===sel.value); return t?.content || ''; }
  return '';
}
function updateVars(){
  const content = getActiveContent();
  const vars = extractVars(content).slice();
  state.varsOrder = vars.slice();
  const panel = $('#vars'); if(!panel) return; panel.innerHTML='';

  const formatPlaceholderLabel = (key)=>{
    const s = String(key || '')
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if(!s) return key;
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  const autoResize = (ta)=>{
    if(!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(400, Math.max(38, ta.scrollHeight)) + 'px';
  };

  const PAGE_SIZE = 7;
  const total = vars.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (!Number.isInteger(state.varsPage)) state.varsPage = 0;
  state.varsPage = Math.max(0, Math.min(state.varsPage, totalPages - 1));
  const start = state.varsPage * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageVars = vars.slice(start, end);

  pageVars.forEach(v=>{
    const row = document.createElement('div');
    row.className = 'row placeholder-row';
    const label = document.createElement('label');
    label.textContent = formatPlaceholderLabel(v);
    const input = document.createElement('textarea');
    input.rows = 2;
    input.placeholder = 'Enter ' + formatPlaceholderLabel(v);
    input.value = state.data[v] || '';
    autoResize(input);
    if(state.user?.role === 'viewer'){
      input.setAttribute('readonly','true');
      input.disabled = true;
    } else {
      const isLast = vars[vars.length-1] === v;
      input.addEventListener('input', (e)=>{ state.data[v] = e.target.value; autoResize(e.target); livePreview(v, { force: isLast }); });
      input.addEventListener('focus', ()=>{ scrollPreviewToVar(v, { behavior:'smooth' }); });
    }
    row.appendChild(label);
    row.appendChild(input);
    panel.appendChild(row);
  });

  if (total > PAGE_SIZE) {
    const nav = document.createElement('div');
    nav.className = 'row';
    nav.style.justifyContent = 'space-between';
    nav.style.alignItems = 'center';
    nav.style.marginTop = '6px';

    const info = document.createElement('div');
    info.className = 'hint';
    info.textContent = `Placeholders ${start + 1}-${Math.min(end, total)} of ${total}`;

    const btns = document.createElement('div');
    btns.className = 'row';
    btns.style.gap = '6px';

    const prev = document.createElement('button');
    prev.textContent = 'Prev';
    prev.className = 'secondary';
    prev.disabled = state.varsPage <= 0;
    prev.addEventListener('click', ()=>{
      const newPage = Math.max(0, state.varsPage - 1);
      const firstKey = vars[newPage * PAGE_SIZE];
      state.varsPage = newPage;
      updateVars();
      panel.scrollTop = 0;
      if (firstKey) setTimeout(()=> scrollPreviewToVar(firstKey, { behavior:'smooth' }), 0);
    });

    const next = document.createElement('button');
    next.textContent = 'Next';
    next.className = 'secondary';
    next.disabled = state.varsPage >= (totalPages - 1);
    next.addEventListener('click', ()=>{
      const newPage = Math.min(totalPages - 1, state.varsPage + 1);
      const firstKey = vars[newPage * PAGE_SIZE];
      state.varsPage = newPage;
      updateVars();
      panel.scrollTop = 0;
      if (firstKey) setTimeout(()=> scrollPreviewToVar(firstKey, { behavior:'smooth' }), 0);
    });

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
      const shouldScroll = (opts.force === true) || (state.followPreview && !isAnchorVisible(activeKey));
      if(shouldScroll){ setTimeout(()=> scrollPreviewToVar(activeKey, { behavior:'smooth', ...opts }), 0); }
    }
  }
}
function renderCustomFields(){
  const container = document.getElementById('custom-fields'); if(!container) return;
  const fields = [
    { key:'name', label:'Name' },
    { key:'address', label:'Address', multiline: true },
    { key:'ctc', label:'CTC' },
    { key:'annual_salary', label:'Annual Salary' }
  ];
  container.innerHTML = '';
  fields.forEach(f=>{
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('label');
    label.textContent = f.label;
    const control = f.multiline ? document.createElement('textarea') : document.createElement('input');
    if(f.multiline){ control.rows = 2; }
    control.placeholder = f.label;
    control.value = state.data[f.key] || '';
    if(state.user?.role === 'viewer'){
      control.setAttribute('readonly','true');
      control.disabled = true;
    } else {
      const isLastCommon = Array.isArray(state.varsOrder) && state.varsOrder[state.varsOrder.length-1] === f.key;
      control.addEventListener('input', (e)=>{ state.data[f.key] = e.target.value; livePreview(f.key, { force: isLastCommon }); });
      control.addEventListener('focus', ()=>{ scrollPreviewToVar(f.key, { behavior:'smooth' }); });
    }
    row.appendChild(label);
    row.appendChild(control);
    container.appendChild(row);
  });
}
async function saveTemplate(){
  const t = { name: $('#template-name').value, description: $('#template-desc').value, content: $('#template-content').value };
  if(!t.name || !t.content) return alert('Name and content required');
  if(state.currentId){
    const updated = await api.updateTemplate(state.currentId,t);
    const idx=state.templates.findIndex(x=>x.id===state.currentId); state.templates[idx]=updated;
  } else {
    const created = await api.createTemplate(t);
    state.templates.push(created); state.currentId=created.id;
  }
  renderTemplates();
}
async function deleteTemplate(){
  if(!state.currentId) return;
  if(!confirm('Delete template?')) return;
  await api.deleteTemplate(state.currentId);
  state.templates=state.templates.filter(x=>x.id!==state.currentId);
  state.currentId=null;
  renderTemplates();
}
async function renderDocument(){
  const t = getActiveContent();
  if(!t) return alert('No template content');
  try{
    const doc = await api.render({ content:t, data:state.data });
    state.docs.push(doc);
    state.alwaysFollowUntilSave = false;
    alert('Document saved. See Letters page to download.');
  }catch(e){
    alert('Render failed');
  }
}
async function downloadPdf(){
  const content = getActiveContent();
  if(!content) return alert('Add some content first');
  const t = state.templates.find(x=>x.id===state.currentId);
  const date = new Date().toISOString().slice(0,10);
  const suggested = `${(t?.name||'document')}-${date}`;
  let name = prompt('Enter PDF file name', suggested);
  if(name==null) return;
  name = name.trim() || suggested;
  if(!name.toLowerCase().endsWith('.pdf')) name += '.pdf';
  try{
    const r = await fetch(apiUrl('/api/documents/pdf'), {
      method:'POST',
      headers:{ 'Content-Type':'application/json', ...authHeaders() },
      credentials: API_BASE ? 'include' : 'same-origin',
      body: JSON.stringify({ content, data: state.data, templateId: state.currentId || null, fileName: name })
    });
    if(!r.ok){
      try{ const j=await r.json(); alert(j.error||'Failed to generate PDF'); }
      catch{ alert('Failed to generate PDF'); }
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    try { state.docs = await api.listDocs(); } catch {}
  }catch(e){ alert(e.message); }
}
async function onUploadTemplate(e){
  const f = e.target.files && e.target.files[0]; if(!f) return;
  const fd = new FormData(); fd.append('file', f);
  const r = await fetch(apiUrl('/api/templates/import'), { method:'POST', body: fd, credentials: API_BASE ? 'include' : 'same-origin', headers: authHeaders() });
  if(!r.ok){ alert('Import failed'); return; }
  const { name, content, defaults } = await r.json();
  document.getElementById('template-name').value = name || 'Imported Template';
  document.getElementById('template-content').value = content || '';
  state.data = { ...defaults };
  updateVars();
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
  if(input){
    input.value = state.docsQuery || '';
    input.addEventListener('input', ()=>{ state.docsQuery = input.value; renderDocs(); });
  }
  const clearBtn = document.getElementById('doc-clear');
  if(clearBtn){
    clearBtn.onclick = ()=>{ state.docsQuery=''; if(input) input.value=''; renderDocs(); };
  }
  renderDocs();
}
function renderDocs(){
  const ul=$('#docs'); if(!ul) return; ul.innerHTML='';
  const meta = document.getElementById('doc-meta');
  const q = (state.docsQuery||'').trim().toLowerCase();
  let docs = state.docs.slice().reverse();
  if(q){
    const includes = (s)=> (s||'').toString().toLowerCase().includes(q);
    docs = docs.filter(d=>{
      const idStr = (d.id||'').toString();
      const fname = d.fileName || '';
      let dataVals = '';
      try{
        if(d.data && typeof d.data === 'object'){
          dataVals = Object.values(d.data).filter(v=>v!=null).join(' ');
        }
      }catch{}
      return includes(idStr) || includes(fname) || includes(dataVals);
    });
  }
  const total = docs.length;
  docs = docs.slice(0,20);
  const clearBtn = document.getElementById('doc-clear');
  if(clearBtn) clearBtn.style.display = q ? '' : 'none';
  if(meta){
    const showing = docs.length;
    meta.textContent = `${showing}/${total} shown${q?` for "${state.docsQuery}"`:''}`;
  }
  if(docs.length===0){
    const li=document.createElement('li');
    li.textContent = q ? 'No matching letters' : 'No letters yet';
    ul.appendChild(li);
    return;
  }
  docs.forEach(d=>{
    const li=document.createElement('li');
    const a=document.createElement('a');
    const label = d.fileName || `Doc ${d.id}`;
    a.textContent = label;
    a.href = (API_BASE || '') + (d.fileName ? `/api/documents/${d.id}/download-pdf` : `/api/documents/${d.id}/download`);
    a.target='_blank';
    li.appendChild(a);
    ul.appendChild(li);
  });
}

/* ---------- Home & Admin ---------- */
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
        <p style="color:var(--muted)">Review and download previous letters</p>
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
    const qcBtn = document.getElementById('qc-create');
    const qcName = document.getElementById('qc-name');
    if(qcBtn) qcBtn.classList.add('hidden');
    if(qcName) qcName.disabled = true;
  }
  if(isAdmin){
    const quCreate = document.getElementById('qu-create');
    if(quCreate){
      quCreate.onclick = async ()=>{
        const username = document.getElementById('qu-username').value.trim();
        const name = document.getElementById('qu-name').value.trim();
        const role = document.getElementById('qu-role').value;
        const password = document.getElementById('qu-pass').value;
        if(!username || !password) return alert('Username and password required');
        try{
          const created = await api.createUser({ username, name, role, password });
          try { state.users = await api.listUsers(); } catch {}
          state.selectedUserId = created?.id || null;
          alert('User created');
          document.getElementById('qu-username').value = '';
          document.getElementById('qu-name').value = '';
          document.getElementById('qu-pass').value = '';
        }catch(e){ alert(e.message); }
      };
    }
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
      <div>
        <div id="users-list" class="user-list"></div>
      </div>
      <div>
        <div id="user-detail" class="user-detail"></div>
      </div>
    </div>
  </section>`;
  state.users = await api.listUsers();
  if(!state.selectedUserId && state.users.length){ state.selectedUserId = state.users[0].id; }
  renderUserList();
  renderUserDetail();
  const s = document.getElementById('user-search');
  if(s) s.addEventListener('input', ()=> renderUserList());
  const addBtn = document.getElementById('user-add-btn');
  if(addBtn) addBtn.addEventListener('click', ()=>{ state.creatingUser = true; state.selectedUserId = null; renderUserList(); renderUserDetail(); });
}
function renderUserList(){
  const container = document.getElementById('users-list'); if(!container) return; container.innerHTML='';
  const q = (document.getElementById('user-search')?.value || '').toLowerCase();
  const items = state.users.filter(u=> !q || (u.username||'').toLowerCase().includes(q) || (u.name||'').toLowerCase().includes(q));
  if(!items.length){ container.innerHTML = '<p style="color:var(--muted)">No users found.</p>'; return; }
  items.forEach(u=>{
    const card = document.createElement('button');
    card.type = 'button';
    const selected = u.id===state.selectedUserId && !state.creatingUser;
    card.className = 'user-card' + (selected ? ' selected' : '');
    const initial = (u.name||u.username||'?').charAt(0).toUpperCase();
    card.innerHTML = `
      <div class="avatar">${initial}</div>
      <div class="meta">
        <div class="name">${u.name||u.username}</div>
        <div class="username">@${u.username}</div>
        <span class="badge ${u.role}">${u.role}</span>
      </div>`;
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
      </div>
    `;
    const createBtn = document.getElementById('cu-create');
    const cancelBtn = document.getElementById('cu-cancel');
    if(createBtn) createBtn.onclick = async ()=>{
      const username = document.getElementById('cu-username').value.trim();
      const name = document.getElementById('cu-name').value.trim();
      const role = document.getElementById('cu-role').value;
      const password = document.getElementById('cu-pass').value;
      if(!username || !password) return alert('Username and password required');
      try{
        const created = await api.createUser({ username, name, role, password });
        try { state.users = await api.listUsers(); } catch { state.users.push(created); }
        state.selectedUserId = created?.id || null;
        state.creatingUser = false;
        renderUserList(); renderUserDetail();
        alert('User created');
      }catch(e){ alert(e.message); }
    };
    if(cancelBtn) cancelBtn.onclick = ()=>{
      state.creatingUser = false;
      if(!state.selectedUserId && state.users[0]) state.selectedUserId = state.users[0].id;
      renderUserList(); renderUserDetail();
    };
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
    <div class="row" style="margin-top:12px">
      <label style="width:30%">Name</label>
      <input id="ud-name" value="${u.name||''}" placeholder="Name" />
    </div>
    <div class="row" style="margin-top:6px">
      <label style="width:30%">Role</label>
      <select id="ud-role"><option value="admin">admin</option><option value="editor">editor</option><option value="viewer">viewer</option></select>
    </div>
    <div class="user-actions" style="margin-top:12px">
      <button id="ud-save" class="success">Save Changes</button>
      <button id="ud-reset">Reset Password</button>
      <button id="ud-delete" class="danger">Delete Account</button>
    </div>
  `;
  const roleSel = document.getElementById('ud-role'); if(roleSel) roleSel.value = u.role;
  const save = document.getElementById('ud-save');
  const reset = document.getElementById('ud-reset');
  const del = document.getElementById('ud-delete');
  if(save) save.onclick = async ()=>{
    try{
      const body = { name: document.getElementById('ud-name').value, role: document.getElementById('ud-role').value };
      const updated = await api.updateUser(u.id, body);
      const idx = state.users.findIndex(x=>x.id===u.id); if(idx>-1) state.users[idx]=updated;
      renderUserList(); renderUserDetail();
      alert('User updated');
    }catch(e){ alert(e.message); }
  };
  if(reset) reset.onclick = async ()=>{
    const pwd = prompt(`Set a new password for ${u.username}`);
    if(pwd==null) return;
    const p = pwd.trim(); if(!p) return alert('Password required');
    try{
      await api.updateUser(u.id, { password: p });
      alert('Password reset');
    }catch(e){ alert(e.message); }
  };
  if(del) del.onclick = async ()=>{
    if(!confirm(`Delete user ${u.username}?`)) return;
    try{
      await api.deleteUser(u.id);
      state.users = state.users.filter(x=>x.id!==u.id);
      state.selectedUserId = state.users[0]?.id || null;
      renderUserList(); renderUserDetail();
    }catch(e){ alert(e.message); }
  };
}

/* ---------- Routes ---------- */
addRoute('#/login', viewLogin, { title:'Login' });
addRoute('#/home', async ()=>{ await viewHome(); }, { auth:true, title:'Home' });
addRoute('#/templates', viewTemplates, { auth:true, title:'Templates' });
addRoute('#/compose', viewCompose, { auth:true, roles:['admin','editor'], title:'Compose' });
addRoute('#/letters', viewDocuments, { auth:true, title:'Letters' });
addRoute('#/profile', async ()=>{ await viewProfile(); }, { auth:true, title:'Profile' });
addRoute('#/admin/users', viewAdminUsers, { auth:true, roles:['admin'], title:'Users' });
addRoute('#/not-found', async()=>{ app.innerHTML='<section><h2>Not found</h2></section>'; });

/* ---------- Boot ---------- */
async function bootstrapData(){
  if(!state.user) return;
  state.templates = await api.listTemplates();
  state.docs = await api.listDocs();
}

$('#logout-btn').addEventListener('click', async ()=>{
  await api.logout();
  setUser(null);
  const overlay = document.getElementById('login');
  if(overlay) overlay.style.display = 'grid';
  navigate('#/login');
});

$('#burger').addEventListener('click', ()=>{
  const d=document.getElementById('drawer');
  const hidden=d.classList.toggle('hidden');
  if(hidden){ document.body.classList.remove('nav-open'); }
  else { document.body.classList.add('nav-open'); }
});

document.querySelectorAll('[data-route]').forEach(a=>a.addEventListener('click', ()=>{
  if(window.innerWidth<900){
    document.getElementById('drawer').classList.add('hidden');
    document.body.classList.remove('nav-open');
  }
}));

/* Safe init: ALWAYS show login if /api/me fails or user missing */
(async function init(){
  try {
    const me = await api.me();
    setUser(me.user);
  } catch (e) {
    console.warn('API /me failed, defaulting to guest', e);
    setUser(null);
  }
  state.authReady = true;

  bindOverlayLogin();

  if(state.user){
    hideLoginOverlay();
    await bootstrapData();
    if(!location.hash || location.hash==='#/login') navigate('#/home');
  } else {
    showLoginOverlay();
    navigate('#/login');
  }

  handleRoute();
  applyResponsiveNav();
})();
