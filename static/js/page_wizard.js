import * as C from './crypto.js';

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

let me = null;
let keyStatus = null;

let step = 1;
function showStep(n){
  step = n;
  $$('.wiz-step').forEach(el => el.classList.toggle('active', parseInt(el.dataset.step) === n));
  for (let i=1;i<=5;i++){ const sec = $('#step-'+i); if (sec) sec.classList.toggle('hidden', i!==n); }
  $('#wiz-prev').disabled = (n===1);
  $('#wiz-next').textContent = (n===5 ? 'Finish' : 'Next');
}

async function loadMeta(){
  const r1 = await fetch('/auth/me'); me = await r1.json();
  const r2 = await fetch('/auth/key/status'); keyStatus = await r2.json();
  $('#wiz-display-name').value = me.display_name || '';
  $('#wiz-retention').value = me.trash_retention_days || 30;
  $('#wiz-auto-logout').checked = !!me.auto_logout_on_close;
  if (keyStatus?.has_keys){
    $('#wiz-key-present').classList.remove('hidden');
    $('#wiz-key-create').classList.add('hidden');
  } else {
    $('#wiz-key-present').classList.add('hidden');
    $('#wiz-key-create').classList.remove('hidden');
  }
}

async function saveProfile(){
  const display = $('#wiz-display-name').value.trim();
  await fetch('/settings/update', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({display_name: display})});
}

async function saveStorage(){
  const days = parseInt($('#wiz-retention').value || '30', 10);
  const auto = $('#wiz-auto-logout').checked;
  await fetch('/settings/update', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({trash_retention_days: days, auto_logout_on_close: auto})});
}

async function createKeys(){
  const p1 = $('#wiz-pass-1').value, p2 = $('#wiz-pass-2').value;
  const err = $('#wiz-key-error'); err.classList.add('hidden'); err.textContent = '';
  if (!p1 || p1.length < 6){ err.textContent = 'Passphrase must be at least 6 characters.'; err.classList.remove('hidden'); return; }
  if (p1 !== p2){ err.textContent = 'Passphrases do not match.'; err.classList.remove('hidden'); return; }
  const iters = (keyStatus?.kdf_iters || 200000);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await C.deriveKEK(p1, salt, iters);
  const kp = await C.generateKeypair();
  const pubPem = await C.exportPublicKeyPEM(kp.publicKey);
  const sealed = await C.sealPrivateKey(kp.privateKey, kek);
  const combo = new Uint8Array(sealed.iv.length + sealed.enc.length);
  combo.set(sealed.iv,0); combo.set(sealed.enc, sealed.iv.length);
  const encB64 = C.bytesToB64(combo);
  const saltB64 = C.bytesToB64(salt);
  const r = await fetch('/auth/key/bootstrap', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ public_key_pem: pubPem, enc_private_key_b64: encB64, kdf_salt_b64: saltB64, kdf_iters: iters })});
  const js = await r.json().catch(()=>({ok:false}));
  if (!r.ok || !js.ok){ err.textContent = js?.error || 'Failed to save keys.'; err.classList.remove('hidden'); return; }
  keyStatus = {has_keys:true, kdf_iters: iters};
  $('#wiz-key-present').classList.remove('hidden');
  $('#wiz-key-create').classList.add('hidden');
  window.smvToast('Keys created successfully');
}

$('#wiz-btn-create')?.addEventListener('click', createKeys);
$('#wiz-prev')?.addEventListener('click', async ()=>{ if (step > 1) showStep(step-1); });
$('#wiz-next')?.addEventListener('click', async ()=>{
  if (step === 1){ await saveProfile(); showStep(2); return; }
  if (step === 2){ if (!keyStatus?.has_keys){ const err=$('#wiz-key-error'); err.textContent='Please create your keys to continue.'; err.classList.remove('hidden'); return; } showStep(3); return; }
  if (step === 3){ showStep(4); return; }
  if (step === 4){ await saveStorage(); showStep(5); return; }
  if (step === 5){ window.location.href = '/files/dashboard'; return; }
});

loadMeta().then(()=>showStep(1));
