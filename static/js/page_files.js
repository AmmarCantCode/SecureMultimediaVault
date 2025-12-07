import * as C from './crypto.js';

const q = sel => document.querySelector(sel);
const fileList = q('#file-list');
const tabFiles = q('#tab-files');
const tabTrash = q('#tab-trash');
const search = q('#search');

let privateKey = null;
let publicKey = null;
let unlocking = null;

async function ensurePrivateKeyForSession() {
  if (privateKey) return privateKey;
  if (unlocking) return unlocking;
  unlocking = (async () => {
    const pass = smvGetPassphrase();
    if (!pass) { unlocking = null; throw new Error("Passphrase required."); }
    const r = await fetch("/auth/key/status/full");
    if (!r.ok) { unlocking = null; throw new Error("Key metadata missing"); }
    const j = await r.json();
    const { enc_private_key_b64, kdf_salt_b64, kdf_iters, public_key_pem } = j;
    const kek = await C.deriveKEK(pass, C.b64ToBytes(kdf_salt_b64), kdf_iters);
    privateKey = await C.openPrivateKey(enc_private_key_b64, kek);
    publicKey = await C.importPublicKeyPEM(public_key_pem);
    return privateKey;
  })();
  try { return await unlocking; } finally { unlocking = null; }
}

function typeInfo(mime, name){
  const lc = (mime||'').toLowerCase();
  if (lc.startsWith('image/')) return {label:'Image', cls:'image'};
  if (lc === 'application/pdf') return {label:'PDF', cls:'pdf'};
  const ext = (name||'').split('.').pop()?.toLowerCase();
  if (['doc','docx','txt','md','rtf','odt'].includes(ext)) return {label:ext.toUpperCase(), cls:'doc'};
  return {label: ext ? ext.toUpperCase() : 'FILE', cls:'generic'};
}

tabFiles?.addEventListener('click', async ()=>{ tabFiles.classList.add('active'); tabTrash.classList.remove('active'); currentView='files'; await refreshList(); });
tabTrash?.addEventListener('click', async ()=>{ tabTrash.classList.add('active'); tabFiles.classList.remove('active'); currentView='trash'; await refreshList(); });
search?.addEventListener('input', ()=> refreshList() );

let currentView = 'files';

async function refreshList(){
  const url = currentView==='trash' ? '/files/list?trash=1' : '/files/list';
  const r = await fetch(url);
  if (!r.ok) return;
  const rows = await r.json();
  const term = (search?.value || '').toLowerCase();
  const filt = term ? rows.filter(x => x.filename.toLowerCase().includes(term)) : rows;
  fileList.innerHTML = '';
  for (const it of filt) {
    const info = typeInfo(it.mime, it.filename);
    const div = document.createElement('div');
    div.className = 'file-row';
    const left = `
      <div>
        <span class="badge ${info.cls}">${info.label}</span>
        <span class="name-wrap" data-id="${it.id}">
          <strong class="name-text">${it.filename}</strong>
          ${currentView==='files' ? '<button class="icon btn-inline-rename" title="Rename">✎</button>' : ''}
        </span><br>
        <small>${(it.size/1024).toFixed(1)} KB • ${new Date(it.created_at).toLocaleString()}</small>
      </div>`;
    const right = (currentView==='files') ? `
      <div class="actions">
        ${it.has_thumb ? '<canvas width="160" height="120" class="thumb"></canvas>' : ''}
        <button data-id="${it.id}" class="btn-download">Download</button>
        <button data-id="${it.id}" class="btn-trash danger">Move to Trash</button>
      </div>` : `
      <div class="actions">
        <button data-id="${it.id}" class="btn-restore">Restore</button>
        <button data-id="${it.id}" class="btn-purge danger">Delete Permanently</button>
      </div>`;
    div.innerHTML = left + right;
    fileList.appendChild(div);

    if (currentView==='files' && it.has_thumb) {
      const cvs = div.querySelector("canvas.thumb");
      if (cvs) { const ctx = cvs.getContext("2d"); ctx.font = "12px system-ui"; ctx.fillText("loading…", 10, 20); renderThumb(it, cvs); }
    }

    if (currentView==='files'){
      div.querySelector(".btn-download")?.addEventListener("click", () => downloadDecrypt(it.id));
      div.querySelector(".btn-trash")?.addEventListener("click", () => moveToTrash(it));
      div.querySelector(".btn-inline-rename")?.addEventListener("click", () => startInlineRename(div, it));
      div.querySelector(".name-text")?.addEventListener("dblclick", () => startInlineRename(div, it));
    } else {
      div.querySelector(".btn-restore")?.addEventListener("click", () => restoreItem(it));
      div.querySelector(".btn-purge")?.addEventListener("click", () => purgeItem(it));
    }
  }
}

async function renderThumb(item, canvas){
  try {
    await ensurePrivateKeyForSession();
    const m = await fetch(`/files/meta/${item.id}`);
    const meta = await m.json();
    const wrapped = C.b64ToBytes(meta.wrapped_key_b64);
    const aes = await C.unwrapFileKey(wrapped, privateKey);
    const r = await fetch(`/files/${item.id}/thumb`);
    const enc = new Uint8Array(await r.arrayBuffer());
    const ivt = C.b64ToBytes(meta.iv_thumb_b64);
    const plain = await C.decryptBytes(aes, ivt, enc);
    const blob = new Blob([plain], {type:'image/jpeg'});
    const url = URL.createObjectURL(blob);
    const img = new Image(); img.onload = ()=>{ const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); const sc=Math.min(canvas.width/img.width, canvas.height/img.height); const w=Math.max(1, Math.floor(img.width*sc)); const h=Math.max(1, Math.floor(img.height*sc)); const x=Math.floor((canvas.width-w)/2), y=Math.floor((canvas.height-h)/2); ctx.drawImage(img,x,y,w,h); URL.revokeObjectURL(url); }; img.onerror=()=>{ const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillText('thumb error',10,20); }; img.src = url;
  } catch(e){
    const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height); ctx.fillText('thumb failed',10,20);
  }
}

function startInlineRename(row, item){
  const wrap=row.querySelector('.name-wrap'); const text=row.querySelector('.name-text'); if(!wrap||!text) return;
  const input=document.createElement('input'); input.type='text'; input.value=text.textContent; input.className='name-input'; input.maxLength=255;
  wrap.replaceChild(input, text); input.focus(); input.select();
  const commit=async ()=>{ const v=input.value.trim(); if(!v){ window.smvToast('Filename cannot be empty.'); input.focus(); return; }
    try{ const r=await fetch(`/files/${item.id}/rename`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:v})}); const js=await r.json().catch(()=>({ok:false})); if(!r.ok||!js.ok) throw new Error(js?.error||'Rename failed'); await window.smvToast('Renamed.'); await refreshList(); }catch(e){ window.smvToast(e?.message||'Rename failed'); } };
  const cancel=()=>{ input.blur(); refreshList(); };
  input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); commit(); } else if(e.key==='Escape'){ e.preventDefault(); cancel(); } });
  input.addEventListener('blur', cancel);
}

async function moveToTrash(item){ if(!confirm(`Move "${item.filename}" to Trash?`)) return; const r=await fetch(`/files/${item.id}`,{method:'DELETE'}); const js=await r.json().catch(()=>({ok:false})); if(!r.ok||!js.ok){ window.smvToast(js?.error||'Failed'); return; } await window.smvToast('Moved to Trash.'); await refreshList(); }
async function restoreItem(item){ const r=await fetch(`/files/${item.id}/restore`,{method:'POST'}); const js=await r.json().catch(()=>({ok:false})); if(!r.ok||!js.ok){ window.smvToast(js?.error||'Restore failed'); return; } await window.smvToast('Restored.'); await refreshList(); }
async function purgeItem(item){ if(!confirm(`Permanently delete "${item.filename}"? This cannot be undone.`)) return; const r=await fetch(`/files/${item.id}/purge`,{method:'DELETE'}); const js=await r.json().catch(()=>({ok:false})); if(!r.ok||!js.ok){ window.smvToast(js?.error||'Delete failed'); return; } await window.smvToast('Deleted permanently.'); await refreshList(); }

async function downloadDecrypt(id){
  try{ await ensurePrivateKeyForSession(); }catch(e){ alert(e.message); return; }
  const m=await fetch(`/files/meta/${id}`); if(!m.ok){ alert('Metadata not found'); return; } const meta=await m.json();
  const aes = await C.unwrapFileKey(C.b64ToBytes(meta.wrapped_key_b64), privateKey);
  const iv = C.b64ToBytes(meta.iv_b64);
  const r = await fetch(`/files/${id}/download`);
  const buf = await r.arrayBuffer();
  const plain = await C.decryptBytes(aes, iv, new Uint8Array(buf));
  const blob = new Blob([plain], {type: meta.mime || 'application/octet-stream'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=meta.filename; document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
}

refreshList();
