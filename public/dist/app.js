var u=e=>document.querySelector(e),f=u("#app"),k=window.matchMedia("(min-width: 900px)");function q(){if(!t.user)return;let e=document.getElementById("drawer");e&&(k.matches?e.classList.remove("hidden"):(e.classList.add("hidden"),document.body.classList.remove("nav-open")))}k.addEventListener?k.addEventListener("change",q):k.addListener&&k.addListener(q);var c=(window.API_BASE||document.querySelector('meta[name="api-base"]')?.content||"").replace(/\/$/,""),D="hrms_token";function J(){try{return localStorage.getItem(D)||""}catch{return""}}function R(e){try{e?localStorage.setItem(D,e):localStorage.removeItem(D)}catch{}}function g(e={}){let n=J();return{...e||{},...n?{Authorization:"Bearer "+n}:{}}}var v={async me(){return(await fetch(c+"/api/me",{credentials:c?"include":"same-origin",headers:g()})).json()},async login(e,n){let a=await fetch(c+"/api/auth/login",{method:"POST",headers:g({"Content-Type":"application/json"}),credentials:c?"include":"same-origin",body:JSON.stringify({username:e,password:n})});if(!a.ok)throw new Error((await a.json()).error||"Login failed");let s=await a.json();return R(s.token),s},async logout(){await fetch(c+"/api/auth/logout",{method:"POST",headers:g(),credentials:c?"include":"same-origin"}),R("")},async listTemplates(){return(await(await fetch(c+"/api/templates",{headers:g(),credentials:c?"include":"same-origin"})).json()).items},async createTemplate(e){let n=await fetch(c+"/api/templates",{method:"POST",headers:g({"Content-Type":"application/json"}),credentials:c?"include":"same-origin",body:JSON.stringify(e)});if(!n.ok)throw new Error("Create failed");return(await n.json()).item},async updateTemplate(e,n){let a=await fetch(c+`/api/templates/${e}`,{method:"PUT",headers:g({"Content-Type":"application/json"}),credentials:c?"include":"same-origin",body:JSON.stringify(n)});if(!a.ok)throw new Error("Update failed");return(await a.json()).item},async deleteTemplate(e){if(!(await fetch(c+`/api/templates/${e}`,{method:"DELETE",headers:g(),credentials:c?"include":"same-origin"})).ok)throw new Error("Delete failed")},async listDocs(){return(await(await fetch(c+"/api/documents",{headers:g(),credentials:c?"include":"same-origin"})).json()).items},async render(e){let n=await fetch(c+"/api/documents",{method:"POST",headers:g({"Content-Type":"application/json"}),credentials:c?"include":"same-origin",body:JSON.stringify(e)});if(!n.ok)throw new Error("Render failed");return(await n.json()).item},async listUsers(){let e=await fetch(c+"/api/auth/users",{headers:g(),credentials:c?"include":"same-origin"});if(!e.ok)throw new Error((await e.json()).error||"List users failed");return(await e.json()).users},async createUser(e){let n=await fetch(c+"/api/auth/users",{method:"POST",headers:g({"Content-Type":"application/json"}),credentials:c?"include":"same-origin",body:JSON.stringify(e)});if(!n.ok)throw new Error((await n.json()).error||"Create user failed");return(await n.json()).user},async updateUser(e,n){let a=await fetch(c+`/api/auth/users/${e}`,{method:"PUT",headers:g({"Content-Type":"application/json"}),credentials:c?"include":"same-origin",body:JSON.stringify(n)});if(!a.ok)throw new Error((await a.json()).error||"Update user failed");return(await a.json()).user},async deleteUser(e){if(!(await fetch(c+`/api/auth/users/${e}`,{method:"DELETE",headers:g(),credentials:c?"include":"same-origin"})).ok)throw new Error("Delete user failed")}},t={user:null,authReady:!1,templates:[],currentId:null,data:{},varsOrder:[],varsPage:0,followPreview:!0,_followTimer:null,alwaysFollowUntilSave:!0,docs:[],docsQuery:"",users:[],selectedUserId:null,creatingUser:!1};function H(e){t.user=e,u("#user-info").textContent=e?`${e.username} (${e.role})`:"",u("#logout-btn").classList.toggle("hidden",!e),u("#burger").classList.toggle("hidden",!e),document.body.classList.toggle("authed",!!e),document.body.classList.toggle("guest",!e),document.querySelectorAll(".admin-only").forEach(o=>{o.classList.toggle("hidden",!(e&&e.role==="admin"))});let n=document.querySelector('nav a[href="#/compose"]'),a=!!e&&e.role==="viewer";n&&n.classList.toggle("hidden",a);let s=document.getElementById("drawer");e?q():(s.classList.add("hidden"),document.body.classList.remove("nav-open"))}function z(){let e=document.getElementById("login");e&&(e.style.display="grid")}function F(){let e=document.getElementById("login");e&&(e.style.display="none")}function Z(){let e=document.getElementById("overlay-login-form");e&&e.addEventListener("submit",async n=>{n.preventDefault();let a=document.getElementById("ov-username").value.trim(),s=document.getElementById("ov-password").value;if(!(!a||!s))try{let o=await v.login(a,s);H(o.user),await Q(),F(),I("#/home")}catch(o){alert(o.message||"Login failed")}})}var O=[];function T(e,n,a={}){O.push({path:e,render:n,auth:!!a.auth,roles:a.roles||null,title:a.title||""})}function I(e){location.hash=e}function _(e){I(e)}window.redirectTo=_;window.addEventListener("hashchange",V);async function V(){let e=location.hash||"#/login",n=O.find(a=>a.path===e)||O.find(a=>a.path==="#/not-found");if(!(n?.auth&&!t.authReady)){if(n?.auth&&!t.user){z();return}if(n?.roles&&t.user&&!n.roles.includes(t.user.role))return _("#/home");f.innerHTML="",await n.render()}}function W(){f.innerHTML=""}function G(e){let n=new Set,a=/{{\s*([a-zA-Z0-9_.]+)\s*}}/g,s;for(;s=a.exec(e);)n.add(s[1]);return[...n]}function K(e,n){return e.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g,(a,s)=>{let o=n[s]??"";return String(o)+`<span class="ph-anchor" data-ph="${s}"></span>`})}function $(e,n={}){let a=document.querySelector(".preview-scroll"),s=document.querySelector(`#preview .ph-anchor[data-ph="${e}"]`);if(!a||!s)return;let o=Array.isArray(t.varsOrder)&&t.varsOrder[t.varsOrder.length-1]===e,r=n.block||(o?"end":"center");if(o){try{a.scrollTo({top:a.scrollHeight,behavior:n.behavior||"auto"})}catch{a.scrollTop=a.scrollHeight}return}try{s.scrollIntoView({block:r,inline:"nearest",behavior:n.behavior||"auto"})}catch{let i=s.getBoundingClientRect(),d=a.getBoundingClientRect(),l=i.top-d.top-(r==="end"?d.height*.85:d.height/2);a.scrollTop+=l}}function Y(e){let n=document.querySelector(".preview-scroll"),a=document.querySelector(`#preview .ph-anchor[data-ph="${e}"]`);if(!n||!a)return!1;let s=n.getBoundingClientRect(),o=a.getBoundingClientRect(),r=24;return o.top>=s.top+r&&o.bottom<=s.bottom-r}function X(){let e=document.querySelector(".preview-scroll");if(!e)return;let n=()=>{t.alwaysFollowUntilSave||(t.followPreview=!1,t._followTimer&&clearTimeout(t._followTimer),t._followTimer=setTimeout(()=>{t.followPreview=!0},900))};e.addEventListener("wheel",n,{passive:!0}),e.addEventListener("touchstart",n,{passive:!0}),e.addEventListener("scroll",n,{passive:!0})}async function ee(){let e=`
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
        <button class="secondary" id="go-compose">Go to Compose \u2192</button>
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
      <textarea id="template-content" rows="18" placeholder="Dear {{employee}},
Welcome to {{company}}."></textarea>
      <p class="help">Tip: Use placeholders like {{name}}, {{date}}. Then open Compose to fill data and preview.</p>
    </section>
  </div>`;if(f.innerHTML=e,N(),u("#new-template-btn").addEventListener("click",()=>{t.currentId=null,u("#template-name").value="",u("#template-desc").value="",u("#template-content").value="",L(),u("#save-template-btn").disabled=!1}),u("#save-template-btn").addEventListener("click",ae),u("#delete-template-btn").addEventListener("click",se),u("#upload-btn").addEventListener("click",()=>document.getElementById("upload-input").click()),document.getElementById("upload-input").addEventListener("change",ie),u("#template-list").addEventListener("change",n=>{t.currentId=n.target.value,t.varsPage=0,N()}),u("#template-content").addEventListener("input",L),u("#go-compose").addEventListener("click",()=>I("#/compose")),t.user?.role==="viewer"){["new-template-btn","upload-btn","save-template-btn","delete-template-btn"].forEach(a=>{let s=document.getElementById(a);s&&(s.disabled=!0)}),["template-name","template-desc","template-content"].forEach(a=>{let s=document.getElementById(a);s&&s.setAttribute("readonly","true")});let n=document.getElementById("go-compose");n&&n.classList.add("hidden")}}async function te(){let e=`
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
  </section>`;f.innerHTML=e,t.alwaysFollowUntilSave=!0,t.followPreview=!0,t.varsPage=0;let n=document.getElementById("compose-template");n.innerHTML="",t.templates.forEach(l=>{let m=document.createElement("option");m.value=l.id,m.textContent=l.name,l.id===t.currentId&&(m.selected=!0),n.appendChild(m)}),!t.currentId&&t.templates[0]&&(t.currentId=t.templates[0].id),ne(),L(),A(),n.addEventListener("change",l=>{t.currentId=l.target.value,t.varsPage=0,L(),A()});let a=document.getElementById("download-btn");a&&a.addEventListener("click",re);let s=document.getElementById("render-btn");s&&s.addEventListener("click",oe);let o=document.getElementById("zoom-in"),r=document.getElementById("zoom-out"),i=(l,m,B)=>Math.max(m,Math.min(B,l)),d=()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--preview-zoom")||"1")||1;o&&o.addEventListener("click",()=>{let l=i(d()+.05,.7,1.5);document.documentElement.style.setProperty("--preview-zoom",l)}),r&&r.addEventListener("click",()=>{let l=i(d()-.05,.7,1.5);document.documentElement.style.setProperty("--preview-zoom",l)}),X()}function N(){let e=u("#template-list");if(!e)return;e.innerHTML="",t.templates.forEach(a=>{let s=document.createElement("option");s.value=a.id,s.textContent=a.name,a.id===t.currentId&&(s.selected=!0),e.appendChild(s)});let n=t.templates.find(a=>a.id===t.currentId);u("#template-name").value=n?.name||"",u("#template-desc").value=n?.description||"",u("#template-content").value=n?.content||"",u("#save-template-btn").disabled=!n,u("#delete-template-btn").disabled=!n,L()}function j(){let e=document.getElementById("template-content");if(e)return e.value||"";let n=document.getElementById("compose-template");return n&&t.templates.find(s=>s.id===n.value)?.content||""}function L(){let e=j(),n=G(e).slice();t.varsOrder=n.slice();let a=u("#vars");if(!a)return;a.innerHTML="";let s=p=>{let y=String(p||"").replace(/[._-]+/g," ").replace(/\s+/g," ").trim();return y?y.charAt(0).toUpperCase()+y.slice(1):p},o=p=>{p&&(p.style.height="auto",p.style.height=Math.min(400,Math.max(38,p.scrollHeight))+"px")},r=7,i=n.length,d=Math.max(1,Math.ceil(i/r));Number.isInteger(t.varsPage)||(t.varsPage=0),t.varsPage=Math.max(0,Math.min(t.varsPage,d-1));let l=t.varsPage*r,m=l+r;if(n.slice(l,m).forEach(p=>{let y=document.createElement("div");y.className="row placeholder-row";let w=document.createElement("label");w.textContent=s(p);let h=document.createElement("textarea");if(h.rows=2,h.placeholder="Enter "+s(p),h.value=t.data[p]||"",o(h),t.user?.role==="viewer")h.setAttribute("readonly","true"),h.disabled=!0;else{let x=n[n.length-1]===p;h.addEventListener("input",b=>{t.data[p]=b.target.value,o(b.target),A(p,{force:x})}),h.addEventListener("focus",()=>{$(p,{behavior:"smooth"})})}y.appendChild(w),y.appendChild(h),a.appendChild(y)}),i>r){let p=document.createElement("div");p.className="row",p.style.justifyContent="space-between",p.style.alignItems="center",p.style.marginTop="6px";let y=document.createElement("div");y.className="hint",y.textContent=`Placeholders ${l+1}-${Math.min(m,i)} of ${i}`;let w=document.createElement("div");w.className="row",w.style.gap="6px";let h=document.createElement("button");h.textContent="Prev",h.className="secondary",h.disabled=t.varsPage<=0,h.addEventListener("click",()=>{let b=Math.max(0,t.varsPage-1),S=n[b*r];t.varsPage=b,L(),a.scrollTop=0,S&&setTimeout(()=>$(S,{behavior:"smooth"}),0)});let x=document.createElement("button");x.textContent="Next",x.className="secondary",x.disabled=t.varsPage>=d-1,x.addEventListener("click",()=>{let b=Math.min(d-1,t.varsPage+1),S=n[b*r];t.varsPage=b,L(),a.scrollTop=0,S&&setTimeout(()=>$(S,{behavior:"smooth"}),0)}),w.appendChild(h),w.appendChild(x),p.appendChild(y),p.appendChild(w),a.appendChild(p)}let C=u("#render-btn");C&&(C.disabled=!t.user||t.user.role==="viewer"||!e);let U=document.getElementById("download-btn");U&&(U.disabled=!e),A()}function A(e,n={}){let a=j(),s=u("#preview");s&&(s.innerHTML=K(a,t.data),e&&(n.force===!0||t.followPreview&&!Y(e))&&setTimeout(()=>$(e,{behavior:"smooth",...n}),0))}function ne(){let e=document.getElementById("custom-fields");if(!e)return;let n=[{key:"name",label:"Name"},{key:"address",label:"Address",multiline:!0},{key:"ctc",label:"CTC"},{key:"annual_salary",label:"Annual Salary"}];e.innerHTML="",n.forEach(a=>{let s=document.createElement("div");s.className="row";let o=document.createElement("label");o.textContent=a.label;let r=a.multiline?document.createElement("textarea"):document.createElement("input");if(a.multiline&&(r.rows=2),r.placeholder=a.label,r.value=t.data[a.key]||"",t.user?.role==="viewer")r.setAttribute("readonly","true"),r.disabled=!0;else{let i=Array.isArray(t.varsOrder)&&t.varsOrder[t.varsOrder.length-1]===a.key;r.addEventListener("input",d=>{t.data[a.key]=d.target.value,A(a.key,{force:i})}),r.addEventListener("focus",()=>{$(a.key,{behavior:"smooth"})})}s.appendChild(o),s.appendChild(r),e.appendChild(s)})}async function ae(){let e={name:u("#template-name").value,description:u("#template-desc").value,content:u("#template-content").value};if(!e.name||!e.content)return alert("Name and content required");if(t.currentId){let n=await v.updateTemplate(t.currentId,e),a=t.templates.findIndex(s=>s.id===t.currentId);t.templates[a]=n}else{let n=await v.createTemplate(e);t.templates.push(n),t.currentId=n.id}N()}async function se(){t.currentId&&confirm("Delete template?")&&(await v.deleteTemplate(t.currentId),t.templates=t.templates.filter(e=>e.id!==t.currentId),t.currentId=null,N())}async function oe(){let e=j();if(!e)return alert("No template content");try{let n=await v.render({content:e,data:t.data});t.docs.push(n),t.alwaysFollowUntilSave=!1,alert("Document saved. See Letters page to download.")}catch{alert("Render failed")}}async function re(){let e=j();if(!e)return alert("Add some content first");let n=t.templates.find(r=>r.id===t.currentId),a=new Date().toISOString().slice(0,10),s=`${n?.name||"document"}-${a}`,o=prompt("Enter PDF file name",s);if(o!=null){o=o.trim()||s,o.toLowerCase().endsWith(".pdf")||(o+=".pdf");try{let r=await fetch(c+"/api/documents/pdf",{method:"POST",headers:{"Content-Type":"application/json"},credentials:c?"include":"same-origin",body:JSON.stringify({content:e,data:t.data,templateId:t.currentId||null,fileName:o})});if(!r.ok){try{let m=await r.json();alert(m.error||"Failed to generate PDF")}catch{alert("Failed to generate PDF")}return}let i=await r.blob(),d=URL.createObjectURL(i),l=document.createElement("a");l.href=d,l.download=o,document.body.appendChild(l),l.click(),l.remove(),URL.revokeObjectURL(d);try{t.docs=await v.listDocs()}catch{}}catch(r){alert(r.message)}}}async function ie(e){let n=e.target.files&&e.target.files[0];if(!n)return;let a=new FormData;a.append("file",n);let s=await fetch(c+"/api/templates/import",{method:"POST",body:a,credentials:c?"include":"same-origin"});if(!s.ok){alert("Import failed");return}let{name:o,content:r,vars:i,defaults:d}=await s.json();document.getElementById("template-name").value=o||"Imported Template",document.getElementById("template-content").value=r||"",t.data={...d},L()}async function le(){f.innerHTML=`
    <section class="center container">
      <h2>Previous Letters</h2>
      <div class="row" style="margin-top:6px; align-items:center">
        <input id="doc-search" type="search" placeholder="Search by name, id, or data..." />
        <button id="doc-clear" class="secondary" style="display:none">Clear</button>
        <div id="doc-meta" style="margin-left:auto; color:var(--muted); font-size:12px"></div>
      </div>
      <ul id="docs"></ul>
    </section>`,t.docs.length||(t.docs=await v.listDocs());let e=document.getElementById("doc-search");e&&(e.value=t.docsQuery||"",e.addEventListener("input",()=>{t.docsQuery=e.value,M()}));let n=document.getElementById("doc-clear");n&&(n.onclick=()=>{t.docsQuery="",e&&(e.value=""),M()}),M()}function M(){let e=u("#docs");if(!e)return;e.innerHTML="";let n=document.getElementById("doc-meta"),a=(t.docsQuery||"").trim().toLowerCase(),s=t.docs.slice().reverse();if(a){let i=d=>(d||"").toString().toLowerCase().includes(a);s=s.filter(d=>{let l=(d.id||"").toString(),m=d.fileName||"",B="";try{d.data&&typeof d.data=="object"&&(B=Object.values(d.data).filter(C=>C!=null).join(" "))}catch{}return i(l)||i(m)||i(B)})}let o=s.length;s=s.slice(0,20);let r=document.getElementById("doc-clear");if(r&&(r.style.display=a?"":"none"),n){let i=s.length;n.textContent=`${i}/${o} shown${a?` for "${t.docsQuery}"`:""}`}if(s.length===0){let i=document.createElement("li");i.textContent=a?"No matching letters":"No letters yet",e.appendChild(i);return}s.forEach(i=>{let d=document.createElement("li"),l=document.createElement("a"),m=i.fileName||`Doc ${i.id}`;l.textContent=m,l.href=(c||"")+(i.fileName?`/api/documents/${i.id}/download-pdf`:`/api/documents/${i.id}/download`),l.target="_blank",d.appendChild(l),e.appendChild(d)})}async function de(){let e=t.templates.length,n=t.user?.role==="admin",s=`
  <section class="center container">
    <h2>Home</h2>
    <p style="color:var(--muted)">Start by choosing a template to create a letter, or manage your templates.</p>
    <div class="tile-grid" style="margin-top:8px">
      <div class="tile" id="tile-templates">
        <h3 style="margin-top:0">Templates</h3>
        <p style="color:var(--muted)">${e} available</p>
        <div class="row" style="gap:8px"><button id="go-templates" class="secondary">Manage</button><button id="qc-create" class="success">Quick Create</button></div>
        <div class="row" style="gap:6px;margin-top:6px"><input id="qc-name" placeholder="Template name" /></div>
      </div>
      <div class="tile">
        <h3 style="margin-top:0">Letters</h3>
        <p style="color:var(--muted)">Review and download previous letters</p>
        <button id="go-letters" class="secondary">Open Letters</button>
      </div>
      ${n?`
    <div class="tile">
      <h3 style="margin-top:0">Quick Add User (Admin)</h3>
      <div class="row" style="gap:6px"><input id="qu-username" placeholder="Username" /><input id="qu-name" placeholder="Name" /></div>
      <div class="row" style="gap:6px;margin-top:6px"><select id="qu-role"><option>editor</option><option>viewer</option><option>admin</option></select><input id="qu-pass" type="password" placeholder="Password" /><button id="qu-create">Add</button></div>
      <small style="color:var(--muted)">Full user management is under Users.</small>
    </div>`:""}
    </div>
  </section>`;if(f.innerHTML=s,document.getElementById("go-templates").onclick=()=>I("#/templates"),document.getElementById("go-letters").onclick=()=>I("#/letters"),document.getElementById("qc-create").onclick=async()=>{let o=document.getElementById("qc-name").value.trim();if(!o)return;let r=await v.createTemplate({name:o,description:"",content:"Hello {{name}}"});t.templates.push(r),t.currentId=r.id,I("#/templates")},t.user?.role==="viewer"){let o=document.getElementById("qc-create"),r=document.getElementById("qc-name");o&&o.classList.add("hidden"),r&&(r.disabled=!0)}if(n){let o=document.getElementById("qu-create");o&&(o.onclick=async()=>{let r=document.getElementById("qu-username").value.trim(),i=document.getElementById("qu-name").value.trim(),d=document.getElementById("qu-role").value,l=document.getElementById("qu-pass").value;if(!r||!l)return alert("Username and password required");try{let m=await v.createUser({username:r,name:i,role:d,password:l});try{t.users=await v.listUsers()}catch{}t.selectedUserId=m?.id||null,alert("User created"),document.getElementById("qu-username").value="",document.getElementById("qu-name").value="",document.getElementById("qu-pass").value=""}catch(m){alert(m.message)}})}}async function ce(){let e=t.user||{},n=(e.name||e.username||"?").toString().charAt(0).toUpperCase(),a=e.createdAt?new Date(e.createdAt).toLocaleDateString():"-",s=e.updatedAt?new Date(e.updatedAt).toLocaleDateString():"-";f.innerHTML=`
  <section class="center container profile-card">
    <div class="profile-header">
      <div class="avatar xl">${n}</div>
      <div class="meta">
        <div class="name">${e.name||e.username||""}</div>
        <div class="username">@${e.username||""}</div>
        <span class="badge ${e.role}">${e.role||""}</span>
      </div>
    </div>
    <div class="profile-grid">
      <div class="item"><label>Username</label><div class="value">${e.username||""}</div></div>
      <div class="item"><label>Role</label><div class="value">${e.role||""}</div></div>
      <div class="item"><label>Name</label><div class="value">${e.name||"\u2014"}</div></div>
      <div class="item"><label>Joined</label><div class="value">${a}</div></div>
      <div class="item"><label>Last Updated</label><div class="value">${s}</div></div>
    </div>
  </section>`}async function ue(){f.innerHTML=`
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
  </section>`,t.users=await v.listUsers(),!t.selectedUserId&&t.users.length&&(t.selectedUserId=t.users[0].id),E(),P();let e=document.getElementById("user-search");e&&e.addEventListener("input",()=>E());let n=document.getElementById("user-add-btn");n&&n.addEventListener("click",()=>{t.creatingUser=!0,t.selectedUserId=null,E(),P()})}function E(){let e=document.getElementById("users-list");if(!e)return;e.innerHTML="";let n=(document.getElementById("user-search")?.value||"").toLowerCase(),a=t.users.filter(s=>!n||(s.username||"").toLowerCase().includes(n)||(s.name||"").toLowerCase().includes(n));if(!a.length){e.innerHTML='<p style="color:var(--muted)">No users found.</p>';return}a.forEach(s=>{let o=document.createElement("button");o.type="button";let r=s.id===t.selectedUserId&&!t.creatingUser;o.className="user-card"+(r?" selected":"");let i=(s.name||s.username||"?").charAt(0).toUpperCase();o.innerHTML=`
      <div class="avatar">${i}</div>
      <div class="meta">
        <div class="name">${s.name||s.username}</div>
        <div class="username">@${s.username}</div>
        <span class="badge ${s.role}">${s.role}</span>
      </div>`,o.onclick=()=>{t.creatingUser=!1,t.selectedUserId=s.id,E(),P()},e.appendChild(o)})}function P(){let e=document.getElementById("user-detail");if(!e)return;if(t.creatingUser||!t.selectedUserId){e.innerHTML=`
      <h3 style="margin-top:0">Create User</h3>
      <div class="row" style="margin-top:6px"><label style="width:30%">Username</label><input id="cu-username" placeholder="Username" /></div>
      <div class="row" style="margin-top:6px"><label style="width:30%">Name</label><input id="cu-name" placeholder="Full name (optional)" /></div>
      <div class="row" style="margin-top:6px"><label style="width:30%">Role</label><select id="cu-role"><option value="editor">editor</option><option value="viewer">viewer</option><option value="admin">admin</option></select></div>
      <div class="row" style="margin-top:6px"><label style="width:30%">Password</label><input id="cu-pass" type="password" placeholder="Password" /></div>
      <div class="user-actions" style="margin-top:12px">
        <button id="cu-create" class="success">Create User</button>
        <button id="cu-cancel" class="secondary">Cancel</button>
      </div>
    `;let i=document.getElementById("cu-create"),d=document.getElementById("cu-cancel");i&&(i.onclick=async()=>{let l=document.getElementById("cu-username").value.trim(),m=document.getElementById("cu-name").value.trim(),B=document.getElementById("cu-role").value,C=document.getElementById("cu-pass").value;if(!l||!C)return alert("Username and password required");try{let U=await v.createUser({username:l,name:m,role:B,password:C});try{t.users=await v.listUsers()}catch{t.users.push(U)}t.selectedUserId=U?.id||null,t.creatingUser=!1,E(),P(),alert("User created")}catch(U){alert(U.message)}}),d&&(d.onclick=()=>{t.creatingUser=!1,!t.selectedUserId&&t.users[0]&&(t.selectedUserId=t.users[0].id),E(),P()});return}let n=t.users.find(i=>i.id===t.selectedUserId);if(!n){e.innerHTML='<p style="color:var(--muted)">Select a user to manage.</p>';return}e.innerHTML=`
    <div class="user-header">
      <div class="avatar lg">${(n.name||n.username||"?").charAt(0).toUpperCase()}</div>
      <div class="meta">
        <div class="name">${n.name||n.username}</div>
        <div class="username">@${n.username}</div>
      </div>
    </div>
    <div class="row" style="margin-top:12px">
      <label style="width:30%">Name</label>
      <input id="ud-name" value="${n.name||""}" placeholder="Name" />
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
  `;let a=document.getElementById("ud-role");a&&(a.value=n.role);let s=document.getElementById("ud-save"),o=document.getElementById("ud-reset"),r=document.getElementById("ud-delete");s&&(s.onclick=async()=>{try{let i={name:document.getElementById("ud-name").value,role:document.getElementById("ud-role").value},d=await v.updateUser(n.id,i),l=t.users.findIndex(m=>m.id===n.id);l>-1&&(t.users[l]=d),E(),P(),alert("User updated")}catch(i){alert(i.message)}}),o&&(o.onclick=async()=>{let i=prompt(`Set a new password for ${n.username}`);if(i==null)return;let d=i.trim();if(!d)return alert("Password required");try{await v.updateUser(n.id,{password:d}),alert("Password reset")}catch(l){alert(l.message)}}),r&&(r.onclick=async()=>{if(confirm(`Delete user ${n.username}?`))try{await v.deleteUser(n.id),t.users=t.users.filter(i=>i.id!==n.id),t.selectedUserId=t.users[0]?.id||null,E(),P()}catch(i){alert(i.message)}})}T("#/login",W,{title:"Login"});T("#/home",async()=>{await de()},{auth:!0,title:"Home"});T("#/templates",ee,{auth:!0,title:"Templates"});T("#/compose",te,{auth:!0,roles:["admin","editor"],title:"Compose"});T("#/letters",le,{auth:!0,title:"Letters"});T("#/profile",async()=>{await ce()},{auth:!0,title:"Profile"});T("#/admin/users",ue,{auth:!0,roles:["admin"],title:"Users"});T("#/not-found",async()=>{f.innerHTML="<section><h2>Not found</h2></section>"});async function Q(){t.user&&(t.templates=await v.listTemplates(),t.docs=await v.listDocs())}u("#logout-btn").addEventListener("click",async()=>{await v.logout(),H(null);let e=document.getElementById("login");e&&(e.style.display="grid"),I("#/login")});u("#burger").addEventListener("click",()=>{document.getElementById("drawer").classList.toggle("hidden")?document.body.classList.remove("nav-open"):document.body.classList.add("nav-open")});document.querySelectorAll("[data-route]").forEach(e=>e.addEventListener("click",()=>{window.innerWidth<900&&(document.getElementById("drawer").classList.add("hidden"),document.body.classList.remove("nav-open"))}));(async function(){let n=await v.me();H(n.user),t.authReady=!0,Z(),t.user&&F(),t.user?(await Q(),(!location.hash||location.hash==="#/login")&&I("#/home")):z(),V(),q()})();
