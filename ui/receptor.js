let MEU_NOME = "Visitante";
let MASTER_CACHE = null;
let appJaIniciou = false; // Controla a animação de boas-vindas

// =======================================================
// UTILITÁRIOS VISUAIS
// =======================================================
function atualizarLoading(texto) {
  const txt = document.getElementById("loadingText");
  if (txt) txt.innerText = texto;
}

function mostrarBoasVindas() {
  if (appJaIniciou) return;
  appJaIniciou = true;

  const loading = document.getElementById("loadingOverlay");
  const welcome = document.getElementById("welcomeScreen");
  const nomeDisplay = document.getElementById("welcomeName");

  if(loading) {
      loading.style.opacity = "0";
      setTimeout(() => loading.style.display = 'none', 500);
  }

  if(welcome && nomeDisplay) {
      let nomeFinal = (MEU_NOME && MEU_NOME !== "" && MEU_NOME !== "Novo Usuário") ? MEU_NOME : "Visitante";
      nomeDisplay.innerText = nomeFinal;
      welcome.classList.remove("hidden");
      
      setTimeout(() => {
          welcome.classList.add("hidden");
          setTimeout(() => welcome.style.display = 'none', 800);
      }, 2000);
  }
}

// =======================================================
// 1. CONEXÃO MASTER
// =======================================================
async function descobrirMaster() {
  if (MASTER_CACHE) {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 2000); 
      const r = await fetch(`http://${MASTER_CACHE}:5000/ping`, { signal: c.signal });
      clearTimeout(t); if (r.ok) return MASTER_CACHE;
    } catch { MASTER_CACHE = null; }
  }

  // TENTA LOCALHOST (Prioridade Máxima para o Master local)
  try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 500); 
      const r = await fetch(`http://127.0.0.1:5000/ping`, { signal: c.signal });
      clearTimeout(t); 
      if (r.ok) { MASTER_CACHE = "127.0.0.1"; return "127.0.0.1"; }
  } catch {}

  // Tenta IPs da Rede (Fallback)
  const admins = ["172.28.6.20", "172.28.6.12", "172.28.6.23", "172.28.6.16"];
  for (const ip of admins) {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 1000); 
      const r = await fetch(`http://${ip}:5000/ping`, { signal: c.signal });
      clearTimeout(t); if (r.ok) { MASTER_CACHE = ip; return ip; }
    } catch {}
  }
  return null;
}

async function esperarMasterConectar() {
  let tentativas = 0;
  while (tentativas < 60) {
    tentativas++;
    atualizarLoading(`Conectando... (${tentativas})`);
    const master = await descobrirMaster();
    if (master) return master;
    await new Promise(r => setTimeout(r, 1000));
  }
  return null;
}

// =======================================================
// 2. LÓGICA PRINCIPAL E PERMISSÕES
// =======================================================
async function carregarPermissoes(modoSilencioso = false) {
  let master;
  if (modoSilencioso) master = await descobrirMaster();
  else master = await esperarMasterConectar();

  if (!master) {
    if (!modoSilencioso) atualizarLoading("❌ Servidor não encontrado");
    return;
  }

  try {
    if (!modoSilencioso) atualizarLoading("Sincronizando...");

    const db = await fetch(`http://${master}:5000/permissions`).then(r => r.json());
    const cfg = await window.electronAPI.lerConfig();
    const meuIP = cfg.ip;

    let meusDados = db.users[meuIP] || { nome: "Visitante", role: "user", blocked: false };

    // Sincroniza Nome (Puxa nome do servidor para o config local)
    if (meusDados.nome && meusDados.nome !== "Novo Usuário" && meusDados.nome !== MEU_NOME) {
        MEU_NOME = meusDados.nome;
        await window.electronAPI.definirConfigInicial({ nome: MEU_NOME });
    }
    
    // VARIÁVEIS DE ACESSO
    const souMaster = meusDados.role === 'master';
    const souAdminOuMaster = meusDados.role === 'admin' || meusDados.role === 'master';
    
    // VISUAL GERAL
    atualizarVisualBloqueio(meusDados.blocked);

    // ============================================================
    // 1. SINCRONIZA A LISTA DE CONTATOS (Agenda Visual)
    // ============================================================
    try {
        const contatosRemotos = await fetch(`http://${master}:5000/users/sync`).then(r => r.json());
        
        if (contatosRemotos && Array.isArray(contatosRemotos)) {
            // Desenha a lista de botões na tela
            desenharListaUsuarios(contatosRemotos, meuIP); 
        }
    } catch (errSync) {
        console.warn("Falha ao sincronizar contatos:", errSync);
    }
    // ============================================================

    // 2. CONTROLE DE BOTÕES
    const btnAdmin = document.getElementById("btnAdmin");
    if (btnAdmin) btnAdmin.style.display = souMaster ? "block" : "none"; // SOMENTE MASTER

    const btnTodos = document.getElementById("btnEnviarTodos");
    if (btnTodos) btnTodos.style.display = souAdminOuMaster ? "block" : "none"; // ADMIN OU MASTER

    const inputMsg = document.getElementById("mensagem");
    if (inputMsg) {
        inputMsg.style.display = souAdminOuMaster ? "block" : "none";
        if(souAdminOuMaster) inputMsg.placeholder = `Mensagem de ${MEU_NOME}...`;
    }

    if (!modoSilencioso) mostrarBoasVindas();

  } catch (error) {
      if (!modoSilencioso) mostrarBoasVindas();
  }
}

// =======================================================
// 3. UI HELPERS
// =======================================================

// Desenha os botões na tela (Recebe a lista do servidor)
function desenharListaUsuarios(lista, meuIP) {
    const divLista = document.getElementById("listaUsuarios");
    const addCard = document.getElementById("addCardPlaceholder"); // O + button placeholder
    if(!divLista) return;

    divLista.innerHTML = ""; // Limpa tudo

    // Filtra e desenha
    lista.forEach((usr) => {
        if (usr.ip === meuIP) return; // Não mostra eu mesmo

        const div = document.createElement("div"); 
        div.className = "user-card";
        const inicial = usr.nome ? usr.nome[0].toUpperCase() : "?";
        
        div.innerHTML = `
            <div class="avatar">${inicial}</div>
            <div class="user-name">${usr.nome}</div>
            <button onclick="enviarPara('${usr.ip}', event)">Enviar</button>
        `;
        div.onclick = () => enviarPara(usr.ip);
        
        divLista.appendChild(div);
    });

    // Adiciona o botão '+' (Manter a opção de adicionar contatos locais mesmo com a lista do servidor)
    const add = document.createElement("div"); 
    add.className = "add-card"; 
    add.innerHTML = "+"; 
    add.onclick = abrirModal; 
    divLista.appendChild(add);
    
    // Opcional: Mostra placeholder se lista estiver vazia
    if (divLista.children.length <= 1) { // Só tem o +
        // Você pode adicionar uma mensagem aqui se quiser, mas a lista vazia já é o suficiente.
    }
}

function atualizarVisualBloqueio(isBlocked) {
    const inputs = document.querySelectorAll("button:not(#btnAdmin), input");
    const container = document.querySelector(".card");
    const msgInput = document.getElementById("mensagem");

    if (isBlocked) {
        if(container) { container.style.borderColor = "#ff0000"; container.style.boxShadow = "0 0 20px rgba(255, 0, 0, 0.4)"; }
        if(msgInput) { msgInput.value = "⛔ BLOQUEADO"; msgInput.disabled = true; }
        inputs.forEach(el => { el.disabled = true; el.style.opacity = "0.5"; });
    } else {
        if(container) { container.style.borderColor = "#1e3a8a"; container.style.boxShadow = "0 0 25px rgba(30, 58, 138, 0.2)"; }
        if(msgInput) { 
            if (msgInput.value === "⛔ BLOQUEADO") msgInput.value = ""; 
            msgInput.disabled = false; 
        }
        inputs.forEach(el => { el.disabled = false; el.style.opacity = "1"; });
    }
}

// =======================================================
// 4. ENVIO E STARTUP
// =======================================================
async function enviarPara(ipDestino, event) {
  if (event) event.stopPropagation();
  let msg = document.getElementById("mensagem").value.trim();
  if (!msg) msg = `Chamado de ${MEU_NOME}`;

  const master = await descobrirMaster();
  if (!master) return alert("Erro de conexão.");

  try {
      const resp = await fetch(`http://${master}:5000/alert/private`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ de: MEU_NOME, para: ipDestino, mensagem: msg })
      });
      const json = await resp.json();
      if(resp.ok) document.getElementById("mensagem").value = "";
      else alert(json.error || "Erro ao enviar.");
  } catch (e) { alert("Erro de rede."); }
}

async function enviarParaTodos() {
  if (!confirm("⚠️ ATENÇÃO! Tem certeza que deseja enviar este alerta para TODOS os usuários da rede?")) {
    return;
  }
  let msg = document.getElementById("mensagem").value.trim();
  if (!msg) msg = `Chamado de ${MEU_NOME}`;
  const master = await descobrirMaster();
  if (!master) return alert("Erro de conexão.");

  try {
      const resp = await fetch(`http://${master}:5000/alert`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ de: MEU_NOME, mensagem: msg })
      });
      const json = await resp.json();
      if(resp.ok) document.getElementById("mensagem").value = "";
      else alert(json.error || "Erro ao enviar.");
  } catch (e) { alert("Erro de rede."); }
}

function abrirPainelAdmin() { window.open("admin.html", "_blank", "width=850,height=800,frame=false,autoHideMenuBar=true"); }
function abrirModal() { document.getElementById("modalAdd").style.display = "block"; }
function fecharModal() { document.getElementById("modalAdd").style.display = "none"; }

// O IPC para deleção local ainda existe, mas a lista não é mais a principal
async function excluirUsuario(ip, event) {
  event.stopPropagation();
  if (!confirm("Remover da lista?")) return;
  alert("A lista visual de contatos não é mais a principal. Use o Painel Admin para gerenciar usuários no servidor.");
}

async function salvarUsuario() {
  const nome = document.getElementById("novoNome").value.trim();
  const ip = document.getElementById("novoIp").value.trim();
  if (!nome || !ip) return alert("Preencha!");
  alert("O cadastro manual não é mais o foco. Use a importação no Painel Admin.");
}

async function carregarConfig() {
  const cfg = await window.electronAPI.lerConfig();
  MEU_NOME = cfg.nome || "Visitante";
}

// Removi carregarUsuariosFixos, pois agora tudo é desenhado por desenharListaUsuarios

(async () => {
  await carregarConfig();
  await carregarPermissoes(false); 
  setInterval(() => carregarPermissoes(true), 3000);
})();