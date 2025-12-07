const sidebar = document.querySelector('#sidebar');
const btn = document.querySelector('#btn-collapse');
function applyState(collapsed){ if (collapsed) sidebar.classList.add('collapsed'); else sidebar.classList.remove('collapsed'); }
applyState(localStorage.getItem('smv_sidebar_collapsed') === '1');
btn?.addEventListener('click', ()=>{ const nv = !sidebar.classList.contains('collapsed'); applyState(nv); localStorage.setItem('smv_sidebar_collapsed', nv ? '1' : '0'); });
window.smvToast = async function(msg, ms=2200){ const el=document.querySelector('#toast'); if(!el) return; el.textContent=msg; el.classList.remove('hidden'); requestAnimationFrame(()=>el.classList.add('show')); await new Promise(r=>setTimeout(r,ms)); el.classList.remove('show'); await new Promise(r=>setTimeout(r,180)); el.classList.add('hidden'); };
