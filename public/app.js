const $ = (sel) => document.querySelector(sel);
const app = $('#app');

// -------- API --------
const api = {
  async me() { const r = await fetch('/api/me', { credentials:'same-origin' }); return r.json(); },
  async login(username, password){
    const r = await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({username,password})});
    if(!r.ok) throw new Error((await r.json()).error||'Login failed');
    return r.json();
  },
  async logout(){ await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'}); },
  async listTemplates(){ const r=await fetch('/api/templates',{credentials:'same-origin'}); return (await r.json()).items; },
  async createTemplate(t){ const r=await fetch('/api/templates',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(t)}); if(!r.ok) throw new Error('Create failed'); return (await r.json()).item; },
  async updateTemplate(id,t){ const r=await fetch(`/api/templates/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(t)}); if(!r.ok) throw new Error('Update failed'); return (await r.json()).item; },
  async deleteTemplate(id){ const r=await fetch(`/api/templates/${id}`,{method:'DELETE',credentials:'same-origin'}); if(!r.ok) throw new Error('Delete failed'); },
  async listDocs(){ const r=await fetch('/api/documents',{credentials:'same-origin'}); return (await r.json()).items; },
  async render(body){ const r=await fetch('/api/documents',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)}); if(!r.ok) throw new Error('Render failed'); return (await r.json()).item; },
  // Admin
  async listUsers(){ const r = await fetch('/api/auth/users',{credentials:'same-origin'}); if(!r.ok) throw new Error((await r.json()).error||'List users failed'); return (await r.json()).users; },
  async createUser(body){ const r = await fetch('/api/auth/users',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)}); if(!r.ok) throw new Error((await r.json()).error||'Create user failed'); return (await r.json()).user; },
  async updateUser(id, body){ const r = await fetch(`/api/auth/users/${id}`,{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)}); if(!r.ok) throw new Error((await r.json()).error||'Update user failed'); return (await r.json()).user; },
  async deleteUser(id){ const r = await fetch(`/api/auth/users/${id}`,{method:'DELETE',credentials:'same-origin'}); if(!r.ok) throw new Error((await r.json()).error||'Delete user failed'); }
};
// (reserved) PDF helper can be added here if needed

// -------- State --------
let state = {
  user: null,
  templates: [],
  currentId: null,
  data: {},
  docs: [],
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
  // Hide Compose for viewers (Templates remain visible read-only)
  const navCmp = document.querySelector('nav a[href="#/compose"]');
  const isViewer = !!user && user.role === 'viewer';
  if(navCmp) navCmp.classList.toggle('hidden', isViewer);
  const drawer = document.getElementById('drawer');
  if(!user){
    drawer.classList.add('hidden');
    document.body.classList.remove('nav-open');
  } else {
    // Responsive: hide drawer by default on small screens, dock on large
    if(window.innerWidth >= 900){
      drawer.classList.remove('hidden');
      document.body.classList.add('nav-open');
    } else {
      drawer.classList.add('hidden');
      document.body.classList.remove('nav-open');
    }
  }
}

/* ---------- Overlay login bindings ---------- */
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
      // hide overlay and go home
      const overlay = document.getElementById('login');
      if(overlay) overlay.style.display = 'none';
      navigate('#/home');
    }catch(err){
      alert(err.message || 'Login failed');
    }
  });
}

// -------- Router --------
const routes = [];
function addRoute(path, render, options={}){ routes.push({ path, render, auth: !!options.auth, roles: options.roles||null, title: options.title||'' }); }
function navigate(path){ location.hash = path; }
function redirectTo(path){ navigate(path); }
window.redirectTo = redirectTo;

window.addEventListener('hashchange', handleRoute);

async function handleRoute(){
  const path = location.hash || '#/login';
  const route = routes.find(r => r.path === path) || routes.find(r => r.path === '#/not-found');
  // auth guard
  if(route?.auth && !state.user){ return redirectTo('#/login'); }
  if(route?.roles && state.user && !route.roles.includes(state.user.role)){
    return redirectTo('#/home');
  }
  app.innerHTML = '';
  await route.render();
}

// -------- Views --------
function viewLogin(){
  // Overlay login is used; keep route but render nothing to avoid duplicate forms.
  app.innerHTML = '';
}

function extractVars(tpl){
  const set = new Set(); const re = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g; let m; while((m=re.exec(tpl))) set.add(m[1]); return [...set];
}
function simpleRender(tpl, data){ return tpl.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g,(_,k)=> data[k] ?? ''); }

async function viewTemplates(){
  // Templates management only
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
  // events
  $('#new-template-btn').addEventListener('click', ()=>{ state.currentId=null; $('#template-name').value=''; $('#template-desc').value=''; $('#template-content').value=''; updateVars(); $('#save-template-btn').disabled=false; });
  $('#save-template-btn').addEventListener('click', saveTemplate);
  $('#delete-template-btn').addEventListener('click', deleteTemplate);
  $('#upload-btn').addEventListener('click', ()=> document.getElementById('upload-input').click());
  document.getElementById('upload-input').addEventListener('change', onUploadTemplate);
  $('#template-list').addEventListener('change', (e)=>{ state.currentId=e.target.value; renderTemplates(); });
  $('#template-content').addEventListener('input', updateVars);
  $('#go-compose').addEventListener('click', ()=> navigate('#/compose'));

  // Role-based UI: viewers can only view
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

// Compose view: select template, enter data, live preview + download
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
  // populate templates select
  const sel = document.getElementById('compose-template');
  sel.innerHTML = '';
  state.templates.forEach(t=>{ const opt=document.createElement('option'); opt.value=t.id; opt.textContent=t.name; if(t.id===state.currentId) opt.selected=true; sel.appendChild(opt); });
  if(!state.currentId && state.templates[0]) state.currentId = state.templates[0].id;
  renderCustomFields();
  updateVars();
  livePreview();
  sel.addEventListener('change', (e)=>{ state.currentId = e.target.value; updateVars(); livePreview(); });
  const dl = document.getElementById('download-btn'); if(dl) dl.addEventListener('click', downloadPdf);
  const rb = document.getElementById('render-btn'); if(rb) rb.addEventListener('click', renderDocument);
  const zin = document.getElementById('zoom-in');
  const zout = document.getElementById('zoom-out');
  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
  const getZoom = ()=> parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--preview-zoom')||'1') || 1;
  if(zin) zin.addEventListener('click', ()=>{
    const z = clamp(getZoom() + 0.05, 0.7, 1.5);
    document.documentElement.style.setProperty('--preview-zoom', z);
  });
  if(zout) zout.addEventListener('click', ()=>{
    const z = clamp(getZoom() - 0.05, 0.7, 1.5);
    document.documentElement.style.setProperty('--preview-zoom', z);
  });
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
  const vars = extractVars(content).slice().sort((a,b)=>a.localeCompare(b));
  const panel = $('#vars'); if(!panel) return; panel.innerHTML='';
  vars.forEach(v=>{
    const row = document.createElement('div');
    row.className = 'row';
    const label = document.createElement('label');
    label.textContent = v;
    const input = document.createElement('textarea');
    input.rows = 2;
    input.value = state.data[v] || '';
    if(state.user?.role === 'viewer'){
      input.setAttribute('readonly','true');
      input.disabled = true;
    } else {
      input.addEventListener('input', (e)=>{ state.data[v] = e.target.value; livePreview(); });
    }
    row.appendChild(label);
    row.appendChild(input);
    panel.appendChild(row);
  });
  const btn = $('#render-btn'); if(btn) btn.disabled = !state.user || state.user.role==='viewer' || !content;
  const dBtn = document.getElementById('download-btn'); if(dBtn) dBtn.disabled = !content;
  livePreview();
}
function livePreview(){ const content=getActiveContent(); const prev=$('#preview'); if(prev) prev.innerHTML = simpleRender(content, state.data); }
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
      control.addEventListener('input', (e)=>{ state.data[f.key] = e.target.value; livePreview(); });
    }
    row.appendChild(label);
    row.appendChild(control);
    container.appendChild(row);
  });
}
async function saveTemplate(){
  const t = { name: $('#template-name').value, description: $('#template-desc').value, content: $('#template-content').value };
  if(!t.name || !t.content) return alert('Name and content required');
  if(state.currentId){ const updated = await api.updateTemplate(state.currentId,t); const idx=state.templates.findIndex(x=>x.id===state.currentId); state.templates[idx]=updated; }
  else { const created = await api.createTemplate(t); state.templates.push(created); state.currentId=created.id; }
  renderTemplates();
}
async function deleteTemplate(){ if(!state.currentId) return; if(!confirm('Delete template?')) return; await api.deleteTemplate(state.currentId); state.templates=state.templates.filter(x=>x.id!==state.currentId); state.currentId=null; renderTemplates(); }
async function renderDocument(){ const t=getActiveContent(); if(!t) return alert('No template content'); const doc=await api.render({ content:t, data:state.data }); state.docs.push(doc); alert('Document saved. See Letters page to download.'); }

async function downloadPdf(){
  const content = getActiveContent();
  if(!content) return alert('Add some content first');
  const t = state.templates.find(x=>x.id===state.currentId);
  const date = new Date().toISOString().slice(0,10);
  const suggested = `${(t?.name||'document')}-${date}`;
  let name = prompt('Enter PDF file name', suggested);
  if(name==null) return; // cancelled
  name = name.trim() || suggested;
  if(!name.toLowerCase().endsWith('.pdf')) name += '.pdf';
  try{
    const r = await fetch('/api/documents/pdf', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials:'same-origin',
      body: JSON.stringify({ content, data: state.data, templateId: state.currentId || null, fileName: name })
    });
    if(!r.ok){ try{ const j=await r.json(); alert(j.error||'Failed to generate PDF'); }catch{ alert('Failed to generate PDF'); } return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    // refresh docs list so Letters shows the saved PDF name
    try { state.docs = await api.listDocs(); } catch {}
  }catch(e){ alert(e.message); }
}

async function onUploadTemplate(e){
  const f = e.target.files && e.target.files[0]; if(!f) return;
  const fd = new FormData(); fd.append('file', f);
  const r = await fetch('/api/templates/import',{ method:'POST', body: fd, credentials:'same-origin' });
  if(!r.ok){ alert('Import failed'); return; }
  const { name, content, vars, defaults } = await r.json();
  document.getElementById('template-name').value = name || 'Imported Template';
  document.getElementById('template-content').value = content || '';
  // seed defaults into state.data
  state.data = { ...defaults };
  updateVars();
}

async function viewDocuments(){
  app.innerHTML = `<section class="center container"><h2>Previous Letters</h2><ul id="docs"></ul></section>`;
  if(!state.docs.length) state.docs = await api.listDocs();
  renderDocs();
}
function renderDocs(){
  const ul=$('#docs'); if(!ul) return; ul.innerHTML='';
  state.docs.slice().reverse().slice(0,20).forEach(d=>{
    const li=document.createElement('li');
    const a=document.createElement('a');
    const label = d.fileName || `Doc ${d.id}`;
    a.textContent = label;
    a.href = d.fileName ? `/api/documents/${d.id}/download-pdf` : `/api/documents/${d.id}/download`;
    a.target='_blank';
    li.appendChild(a);
    ul.appendChild(li);
  });
}

// Home view
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
        <p style="color:var(--muted)">${count} available</p>
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
  // For viewers, disable Quick Create (still allow Manage to view Templates)
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
          // Refresh users cache so Admin > Users lists the new account
          try { state.users = await api.listUsers(); } catch {}
          state.selectedUserId = created?.id || null;
          alert('User created');
          // Clear quick-add inputs
          document.getElementById('qu-username').value = '';
          document.getElementById('qu-name').value = '';
          document.getElementById('qu-pass').value = '';
        }catch(e){ alert(e.message); }
      };
    }
  }
}

// Profile view
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
        // Update local cache and select the new user
        try { state.users = await api.listUsers(); } catch { state.users.push(created); }
        state.selectedUserId = created?.id || null;
        state.creatingUser = false;
        renderUserList(); renderUserDetail();
        alert('User created');
      }catch(e){ alert(e.message); }
    };
    if(cancelBtn) cancelBtn.onclick = ()=>{ state.creatingUser = false; if(!state.selectedUserId && state.users[0]) state.selectedUserId = state.users[0].id; renderUserList(); renderUserDetail(); };
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

// Register routes
addRoute('#/login', viewLogin, { title:'Login' });
addRoute('#/home', async ()=>{ await viewHome(); }, { auth:true, title:'Home' });
addRoute('#/templates', viewTemplates, { auth:true, title:'Templates' });
addRoute('#/compose', viewCompose, { auth:true, roles:['admin','editor'], title:'Compose' });
addRoute('#/letters', viewDocuments, { auth:true, title:'Letters' });
addRoute('#/profile', async ()=>{ await viewProfile(); }, { auth:true, title:'Profile' });
addRoute('#/admin/users', viewAdminUsers, { auth:true, roles:['admin'], title:'Users' });
addRoute('#/not-found', async()=>{ app.innerHTML='<section><h2>Not found</h2></section>'; });

// Boot
async function bootstrapData(){
  if(!state.user) return;
  state.templates = await api.listTemplates();
  state.docs = await api.listDocs();
}

$('#logout-btn').addEventListener('click', async ()=>{
  await api.logout();
  setUser(null);
  const overlay = document.getElementById('login');
  if(overlay) overlay.style.display = 'grid'; // show login overlay again
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

(async function init(){
  const me = await api.me(); setUser(me.user);

  // Bind overlay form
  bindOverlayLogin();

  // Hide overlay if already authed
  const overlay = document.getElementById('login');
  if(state.user && overlay) overlay.style.display = 'none';

  if(state.user){
    await bootstrapData();
    if(!location.hash || location.hash==='#/login') navigate('#/home');
  } else {
    navigate('#/login');
  }
  handleRoute();

  window.addEventListener('resize', ()=>{
    if(!state.user) return;
    const drawer = document.getElementById('drawer');
    if(window.innerWidth >= 900){
      drawer.classList.remove('hidden');
      document.body.classList.add('nav-open');
    } else {
      drawer.classList.add('hidden');
      document.body.classList.remove('nav-open');
    }
  });
})();
