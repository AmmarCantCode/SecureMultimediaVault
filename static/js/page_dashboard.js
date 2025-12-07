async function getJSON(u){ const r=await fetch(u); if(!r.ok) return null; return await r.json(); }
function fmtBytes(n){ if(n<1024) return n+' B'; if(n<1024**2) return (n/1024).toFixed(1)+' KB'; if(n<1024**3) return (n/1024**2).toFixed(1)+' MB'; return (n/1024**3).toFixed(1)+' GB'; }

(async ()=>{
  const key=await getJSON('/auth/key/status');
  document.querySelector('#key-status').textContent = key?.has_keys ? '✅ Keys present' : '⚠️ Not set — go to Settings → Wizard';
  const st=await getJSON('/files/stats');
  if(st) document.querySelector('#storage').textContent = `${st.total} files • ${fmtBytes(st.size)} total • ${st.trashed} in Trash`;
  const rec=await getJSON('/audit/recent'); const ul=document.querySelector('#recent'); ul.innerHTML=''; (rec||[]).forEach(r=>{ const li=document.createElement('li'); li.textContent=`${new Date(r.ts).toLocaleString()} — ${r.action} (${r.status})`; ul.appendChild(li); });
})(); 
