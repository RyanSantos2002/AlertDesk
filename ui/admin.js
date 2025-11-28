console.log("🚀 Admin.js carregado!");

function toggleLoading(show) {
    const el = document.getElementById("simpleLoading");
    if(el) el.style.display = show ? "block" : "none";
}

async function descobrirMaster() {
    console.log("🔍 Procurando master...");
    // 1. TENTA LOCALHOST
    try {
        const c = new AbortController(); const t = setTimeout(() => c.abort(), 500);
        const r = await fetch(`http://127.0.0.1:5000/ping`, { signal: c.signal });
        clearTimeout(t); 
        if (r.ok) {
            console.log("✅ Master encontrado em Localhost");
            return "127.0.0.1";
        }
    } catch {}

    // 2. TENTA REDE
    const admins = ["172.28.6.20", "172.28.6.12", "172.28.6.23", "172.28.6.16"];
    for (const ip of admins) {
      try {
        const c = new AbortController(); const t = setTimeout(() => c.abort(), 1000);
        const r = await fetch(`http://${ip}:5000/ping`, { signal: c.signal });
        clearTimeout(t); 
        if (r.ok) {
            console.log("✅ Master encontrado em: " + ip);
            return ip;
        }
      } catch {}
    }
    console.warn("❌ Nenhum master encontrado.");
    return null;
}

async function carregarUsuarios() {
    const statusMsg = document.getElementById("statusMsg");
    const master = await descobrirMaster();
    
    if(!master) {
        if(statusMsg) statusMsg.innerText = "❌ Servidor Master não encontrado.";
        return; 
    }

    try {
        const dados = await fetch(`http://${master}:5000/permissions`).then(r => r.json());
        
        if(statusMsg) statusMsg.style.display = "none";
        
        const lista = document.getElementById("listaUsuarios");
        lista.innerHTML = "";

        if (!dados.users || Object.keys(dados.users).length === 0) {
            lista.innerHTML = "<p style='text-align:center; color:#666'>Lista vazia.</p>";
            return;
        }

        Object.entries(dados.users).sort(([,a], [,b]) => {
            const r = { master: 3, admin: 2, user: 1 }; return (r[b.role] || 0) - (r[a.role] || 0);
        }).forEach(([ip, usr]) => {
            const isMaster = usr.role === 'master';
            const isAdmin = usr.role === 'admin';
            
            let badges = "";
            if (isMaster) badges += `<span class="badge" style="background:#7c3aed;">👑 MASTER</span>`;
            else if (isAdmin) badges += `<span class="badge badge-admin">🛡️ ADMIN</span>`;
            else badges += `<span class="badge badge-user">👤 USER</span>`;
            if (usr.blocked) badges += `<span class="badge badge-blocked">⛔ BLOCK</span>`;
            if (usr.muted) badges += `<span class="badge badge-muted">🔇 MUTE</span>`;

            let buttons = "";
            if (isMaster) buttons = `<span style="opacity:0.5; font-size:12px;">Intocável</span>`;
            else {
                buttons += usr.muted 
                    ? `<button class="btn-gray" onclick="acao('${ip}','unmute')">🔊</button>`
                    : `<button class="btn-gray" onclick="acao('${ip}','mute')">🔇</button>`;
                
                buttons += usr.blocked
                    ? `<button class="btn-gray" style="background:#22c55e" onclick="acao('${ip}','unblock')">🔓</button>`
                    : `<button class="btn-red" onclick="acao('${ip}','block')">⛔</button>`;

                if (isAdmin) buttons += `<button class="btn-yellow" onclick="acao('${ip}','demote')">⬇️ User</button>`;
                else buttons += `<button class="btn-blue" onclick="acao('${ip}','promote')">⬆️ Admin</button>`;
            }

            lista.innerHTML += `
                <div class="user-row">
                    <div class="user-info">
                        <div class="name">${usr.nome || "Novo"} ${badges}</div>
                        <div style="font-size:12px; color:#94a3b8; margin-top:4px;">${ip}</div>
                    </div>
                    <div class="actions">${buttons}</div>
                </div>`;
        });
    } catch (e) {
        console.error("Erro render:", e);
        if(statusMsg) statusMsg.innerText = "Erro ao processar dados.";
    }
}

async function acao(ip, action) {
    let senha = null;
    if (action === 'promote' || action === 'demote') {
        senha = prompt("🔒 Senha Mestra:");
        if (!senha) return;
    }
    if(action === 'block' && !confirm("Bloquear?")) return;

    toggleLoading(true);
    const master = await descobrirMaster();
    if(!master) { toggleLoading(false); return alert("Erro conexão"); }

    try {
        const resp = await fetch(`http://${master}:5000/admin/update`, {
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ target_ip: ip, action, senha: senha })
        });
        const json = await resp.json();
        if(!resp.ok) alert("❌ " + (json.error || "Falha"));
        else await carregarUsuarios();
    } catch (error) { alert("Erro de rede"); } finally { toggleLoading(false); }
}

async function carregarAgendamentos() {
  const master = await descobrirMaster();
  if(!master) return;
  try {
      const agenda = await fetch(`http://${master}:5000/admin/schedules`).then(r => r.json());
      const lista = document.getElementById("listaAgendamentos");
      if(lista) {
          lista.innerHTML = "";
          if(agenda.length === 0) lista.innerHTML = "<p style='text-align:center; color:#555;'>Vazio</p>";
          agenda.forEach(item => {
            lista.innerHTML += `<div class="schedule-item"><div><strong style="color:#1dacff;">${item.horario}</strong> <span style="margin-left:10px;">${item.titulo}</span></div><button onclick="deletarAgendamento(${item.id})" style="background:#ef4444; border:none; padding:5px 10px; border-radius:4px; color:white; cursor:pointer;">X</button></div>`;
          });
      }
  } catch(e) {}
}

async function criarAgendamento() {
  const titulo = document.getElementById("agendaTitulo").value;
  const horario = document.getElementById("agendaHora").value;
  if(!titulo || !horario) return alert("Preencha!");
  const senha = prompt("🔒 Senha Mestra:");
  if(!senha) return;

  toggleLoading(true);
  const master = await descobrirMaster();
  const resp = await fetch(`http://${master}:5000/admin/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo, horario, senha }) });
  toggleLoading(false);
  if(resp.ok) { document.getElementById("agendaTitulo").value = ""; carregarAgendamentos(); }
  else alert("Senha incorreta!");
}

async function deletarAgendamento(id) {
  if(!confirm("Remover?")) return;
  toggleLoading(true);
  const master = await descobrirMaster();
  await fetch(`http://${master}:5000/admin/schedule/${id}`, { method: "DELETE" });
  toggleLoading(false);
  carregarAgendamentos();
}

console.log("Iniciando carregamento...");
carregarUsuarios();
carregarAgendamentos();

setInterval(() => {
    const loading = document.getElementById("simpleLoading");
    if (loading && loading.style.display === "none") { carregarUsuarios(); carregarAgendamentos(); }
}, 3000);