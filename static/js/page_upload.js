import * as C from './crypto.js';

const q = sel => document.querySelector(sel);
const fileInput = q('#file-input');
const selectedName = q('#selected-name');
const dropZone = q('#drop-zone');
const errorBox = q('#error-box');
const uploadStatus = q('#upload-status');
const progressWrap = q('#progress-wrap');
const progressBar = q('#progress-bar');
const progressLabel = q('#progress-label');

let privateKey = null;
let publicKey = null;
let unlocking = null;

async function ensurePrivateKeyForSession() {
  if (privateKey) return privateKey;
  if (unlocking) return unlocking;
  unlocking = (async () => {
    const pass = smvGetPassphrase();
    if (!pass) { unlocking = null; throw new Error("Passphrase required."); }
    const rS = await fetch("/auth/key/status");
    const status = await rS.json().catch(()=>({has_keys:false}));
    if (!status?.has_keys) throw new Error("Please run the Setup Wizard first to create your keys.");
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

function show(el){ if(el) el.classList.remove('hidden'); }
function hide(el){ if(el) el.classList.add('hidden'); }
function showError(msg){ if(!errorBox) return; errorBox.classList.remove('hidden'); errorBox.textContent = msg; }
function clearError(){ if(!errorBox) return; errorBox.classList.add('hidden'); errorBox.textContent=''; }
function disableUI(disabled){ const a=q("#btn-upload"); const b=q("#file-input"); if(a) a.disabled = !!disabled; if(b) b.disabled = !!disabled; }

let uiProgress = 0; let rafId = null;
function setProgressTarget(targetPct){
  targetPct = Math.max(0, Math.min(100, targetPct));
  cancelAnimationFrame(rafId);
  function step(){
    const d = targetPct - uiProgress;
    if (Math.abs(d) < 0.2){ uiProgress = targetPct; progressBar.style.width = uiProgress.toFixed(1) + "%"; return; }
    uiProgress += d * 0.12;
    progressBar.style.width = uiProgress.toFixed(1) + "%";
    rafId = requestAnimationFrame(step);
  }
  rafId = requestAnimationFrame(step);
}
function resetProgress(){ uiProgress = 0; progressBar.style.width = "0%"; }
function showProgress(label="Processing…"){ progressLabel.textContent = label; resetProgress(); show(progressWrap); }
function hideProgress(){ hide(progressWrap); resetProgress(); }

// Drag & drop
if (dropZone){
  const enter = e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag'); };
  const over  = e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('drag'); };
  const leave = e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag'); };
  const drop  = e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('drag'); const f=e.dataTransfer?.files?.[0]; if(f){ fileInput.files=e.dataTransfer.files; if(selectedName) selectedName.textContent=f.name; } };
  dropZone.addEventListener('dragenter', enter);
  dropZone.addEventListener('dragover',  over);
  dropZone.addEventListener('dragleave', leave);
  dropZone.addEventListener('drop',      drop);
  dropZone.addEventListener('click', ()=> fileInput?.click());
}
fileInput?.addEventListener('change', (e)=>{ const f=e.target.files?.[0]; if(selectedName) selectedName.textContent = f ? f.name : 'No file chosen'; });

function readFileWithProgress(file, onProgress){
  return new Promise((resolve, reject)=>{
    const fr=new FileReader();
    fr.onprogress=(e)=>{ if(e.lengthComputable&&typeof onProgress==='function'){ const pct=(e.loaded/e.total)*100; onProgress(5 + pct*0.5); } };
    fr.onerror=()=>reject(new Error('Failed to read file.'));
    fr.onload=()=>resolve(new Uint8Array(fr.result));
    fr.readAsArrayBuffer(file);
  });
}
function xhrUpload(url, formData, onProgress){
  return new Promise((resolve, reject)=>{
    const xhr=new XMLHttpRequest(); xhr.open('POST', url, true);
    xhr.upload.onprogress=(e)=>{ if(e.lengthComputable&&typeof onProgress==='function'){ onProgress(60 + (e.loaded/e.total)*35); } };
    xhr.onreadystatechange=()=>{
      if(xhr.readyState===4){
        const text=xhr.responseText||'';
        const looksHTML=/^\s*<!doctype|^\s*<html/i.test(text);
        if(looksHTML){ reject(new Error('Session expired. Please log in again.')); return; }
        try{
          const js=JSON.parse(text||'{}');
          if(xhr.status>=200 && xhr.status<300){ resolve(js); }
          else{ reject(new Error(js?.error || `Upload failed (HTTP ${xhr.status})`)); }
        }catch(err){
          if(xhr.status>=200 && xhr.status<300){ resolve({ok:true}); }
          else{ reject(new Error(`Upload failed (HTTP ${xhr.status})`)); }
        }
      }
    };
    xhr.onerror=()=>reject(new Error('Network error during upload.'));
    xhr.send(formData);
  });
}

q('#btn-upload')?.addEventListener('click', async ()=>{
  clearError();
  const f=fileInput.files?.[0];
  if(!f){ showError('Please choose a file first.'); return; }
  try{
    disableUI(true);
    showProgress('Encrypting…');
    setProgressTarget(10);

    await ensurePrivateKeyForSession();

    // Read file
    const plain = await readFileWithProgress(f, setProgressTarget);
    setProgressTarget(50);

    // Encrypt file with fresh AES key
    const fileKey = await C.genFileKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encBytes = await C.encryptBytes(fileKey, iv, plain);
    setProgressTarget(60);

    // Optional thumbnail for images
    let hasThumb = 0, ivThumbB64 = '', thumbBlob = null;
    if ((f.type||'').startsWith('image/')){
      const thumb = await C.makeThumbnail(f, 480).catch(()=>null);
      if (thumb) {
        hasThumb = 1;
        const ivt = crypto.getRandomValues(new Uint8Array(12));
        const encThumb = await C.encryptBytes(fileKey, ivt, thumb);
        ivThumbB64 = C.bytesToB64(ivt);
        thumbBlob = new Blob([encThumb], {type:'application/octet-stream'});
      }
    }
    setProgressTarget(65);

    // Wrap AES key with user's public key
    const wrapped = await C.wrapFileKey(fileKey, publicKey);
    setProgressTarget(70);

    // Prepare form data
    const fd = new FormData();
    fd.append('filename', f.name);
    fd.append('mime', f.type || 'application/octet-stream');
    fd.append('size', String(f.size));
    fd.append('wrapped_key_b64', C.bytesToB64(wrapped));
    fd.append('iv_b64', C.bytesToB64(iv));
    fd.append('file_blob', new Blob([encBytes], {type:'application/octet-stream'}));
    if (hasThumb){
      fd.append('has_thumb', '1');
      fd.append('iv_thumb_b64', ivThumbB64);
      fd.append('thumb_blob', thumbBlob);
    }

    // Upload with progress
    const resp = await xhrUpload('/files/upload', fd, setProgressTarget);
    if (!resp?.ok) throw new Error(resp?.error || 'Upload failed');

    setProgressTarget(100);
    progressLabel.textContent = 'Done';
    setTimeout(()=>{ hideProgress(); }, 600);
    await window.smvToast('The file has been encrypted & uploaded.');
    uploadStatus.textContent = 'Uploaded!';
    setTimeout(()=>{ window.location.href = '/files/files'; }, 500);
  }catch(err){
    console.error(err);
    showError(err?.message || 'Something went wrong.');
    hideProgress();
  }finally{
    disableUI(false);
  }
});
