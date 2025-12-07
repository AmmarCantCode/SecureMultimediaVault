const $ = s => document.querySelector(s);
async function post(data){ await fetch('/settings/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); }
$('#btn-save-profile')?.addEventListener('click', async ()=>{ const v=$('#display-name').value.trim(); await post({display_name:v}); window.smvToast('Saved'); });
$('#btn-save-retention')?.addEventListener('click', async ()=>{ const d=parseInt($('#retention').value||'30',10); await post({trash_retention_days:d}); window.smvToast('Saved'); });
$('#btn-save-session')?.addEventListener('click', async ()=>{ const v=$('#auto-logout').checked; await post({auto_logout_on_close:v}); window.smvToast('Saved'); });
