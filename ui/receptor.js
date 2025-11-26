let MEU_NOME = "";
let usuariosFixos = [];

// ===============================
// CARREGAR CONFIG
// ===============================
async function carregarConfig() {
  const cfg = await window.electronAPI.lerConfig();
  MEU_NOME = cfg.nome;

  if (!MEU_NOME || MEU_NOME.trim() === "")
    document.getElementById("modalNome").style.display = "block";
}

async function salvarNomeInicial() {
  const nome = document.getElementById("inputNomeInicial").value.trim();
  if (!nome) return alert("Digite seu nome!");

  await window.electronAPI.definirConfigInicial({ nome });
  MEU_NOME = nome;

  document.getElementById("modalNome").style.display = "none";
}

// ===============================
// USUÁRIOS
// ===============================
async function carregarUsuariosFixos() {
  usuariosFixos = await window.electronAPI.lerUsuarios();
  montarListaUsuarios();
}

function montarListaUsuarios() {
  const lista = document.getElementById("listaUsuarios");
  lista.innerHTML = "";

  usuariosFixos.forEach((usr) => {
    const div = document.createElement("div");
    div.className = "user-card";

    div.innerHTML = `
      <div class="del-btn" onclick="excluirUsuario('${usr.ip}', event)">✖</div>
      <div class="avatar">${usr.nome[0]}</div>
      <div class="user-name">${usr.nome}</div>
      <button onclick="enviarPara('${usr.ip}', event)">Enviar</button>
    `;

    div.onclick = () => enviarPara(usr.ip);
    lista.appendChild(div);
  });

  const add = document.createElement("div");
  add.className = "add-card";
  add.innerHTML = "+";
  add.onclick = abrirModal;
  lista.appendChild(add);
}

// ===============================
// ENVIO
// ===============================
function enviarPara(ipDestino, event) {
  if (event) event.stopPropagation();

  let msg = document.getElementById("mensagem").value.trim();
  if (!msg) msg = `Chamado de ${MEU_NOME}`;

  fetch(`http://${ipDestino}:4000/alerta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mensagem: msg, de: MEU_NOME })
  });

  document.getElementById("mensagem").value = "";
}

function enviarParaTodos() {
  let msg = document.getElementById("mensagem").value.trim();

  if (!msg) {
    msg = `Chamado de ${MEU_NOME}`;
  }

  usuariosFixos.forEach((u) => {
    fetch(`http://${u.ip}:4000/alerta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagem: msg, de: MEU_NOME })
    }).catch(err => console.error("Erro ao enviar para", u.ip, err));
  });

  document.getElementById("mensagem").value = "";
}



// ===============================
// MODAL
// ===============================
function abrirModal() {
  document.getElementById("modalAdd").style.display = "block";
}

function fecharModal() {
  document.getElementById("modalAdd").style.display = "none";
}

async function excluirUsuario(ip, event) {
  event.stopPropagation();
  if (!confirm("Deseja excluir?")) return;

  await window.electronAPI.deletarUsuario(ip);
  carregarUsuariosFixos();
}

async function salvarUsuario() {
  const nome = document.getElementById("novoNome").value.trim();
  const ip = document.getElementById("novoIp").value.trim();

  if (!nome || !ip) return alert("Preencha nome e IP!");

  await window.electronAPI.adicionarUsuario({ nome, ip });

  fecharModal();
  carregarUsuariosFixos();
}

// ===============================
// START
// ===============================
(async () => {
  await carregarConfig();
  await carregarUsuariosFixos();
})();
