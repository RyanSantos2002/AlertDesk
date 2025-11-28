// =======================================================
// IMPORTS
// =======================================================
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const fetch = require("node-fetch");

// =======================================================
// GLOBAIS
// =======================================================
let mainWindow;
let tray;
let isQuiting = false;
const MASTER_PORT = 5000;
const floodControl = {}; 
const SENHA_MESTRA = "alert123"; 
const IP_DO_MASTER = "172.28.6.20"; // <--- SEU IP FIXO AQUI

let activePopups = [];
const TOAST_HEIGHT = 110;
const TOAST_GAP = 10;
const MAX_VISIBLE = 5;

// =======================================================
// 1. CONFIGURAÇÃO E IP
// =======================================================
const configDir = path.join(__dirname, "config");
if (!fs.existsSync(configDir)) fs.mkdirSync(configDir);

const configPath = path.join(configDir, "config.json");
let config = {};
try {
  if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (e) {}

function definirMeuIP() {
  if (config.ip) return config.ip;
  const os = require("os");
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}
const MEU_IP = definirMeuIP();

// =======================================================
// 2. DATABASE (BLINDADO)
// =======================================================
const dbPath = path.join(configDir, "database.json");
const scheduledPath = path.join(configDir, "scheduled.json");

function lerDB() {
    if (fs.existsSync(dbPath)) {
        try {
            const data = fs.readFileSync(dbPath, "utf8");
            if (data.trim() === "") throw new Error("Vazio");
            return JSON.parse(data);
        } catch (e) {
            console.error("⚠️ Banco corrompido. Recriando...");
        }
    }

    console.log("⚙️ Criando database novo...");
    let inicial = { users: {} };

    if (MEU_IP === IP_DO_MASTER) {
        inicial.users[IP_DO_MASTER] = { nome: "Ryan", role: "master", blocked: false, muted: false };
    } else {
        inicial.users[MEU_IP] = { nome: "Novo Usuário", role: "user", blocked: false, muted: false };
    }
    
    fs.writeFileSync(dbPath, JSON.stringify(inicial, null, 2));
    return inicial;
}

function lerAgendamentos() {
    if (!fs.existsSync(scheduledPath)) fs.writeFileSync(scheduledPath, "[]");
    try { return JSON.parse(fs.readFileSync(scheduledPath, "utf8")); } catch { return []; }
}

let db = lerDB();
const meuUser = db.users[MEU_IP];
const souAdmin = (MEU_IP === IP_DO_MASTER) || (meuUser && (meuUser.role === 'admin' || meuUser.role === 'master'));

console.log(`🤖 Iniciando AlertDesk | IP: ${MEU_IP} | Master Esperado: ${IP_DO_MASTER}`);

// =======================================================
// 3. ANTI-FLOOD
// =======================================================
function verificarPermissaoEnvio(ip) {
    const now = Date.now();
    if (!floodControl[ip]) floodControl[ip] = { timestamps: [], banLevel: 0, bannedUntil: null };
    const userData = floodControl[ip];

    // Verifica se ainda está banido
    if (userData.bannedUntil && now < userData.bannedUntil) {
        const faltaSegundos = Math.ceil((userData.bannedUntil - now) / 1000);
        const faltaMinutos = Math.ceil(faltaSegundos / 60);
        const textoTempo = faltaSegundos < 60 ? `${faltaSegundos}s` : `${faltaMinutos}m`;
        return { permitido: false, erro: `⛔ Silenciado por SPAM (${textoTempo} restantes)` };
    }
    
    // Limpa ban se o tempo passou
    if (userData.bannedUntil && now >= userData.bannedUntil) userData.bannedUntil = null;

    userData.timestamps.push(now);
    // Janela de 10 segundos
    userData.timestamps = userData.timestamps.filter(t => now - t < 10000);

    // SE MANDAR MAIS QUE 3 EM 10 SEGUNDOS:
    if (userData.timestamps.length > 3) {
        // === AQUI ESTÃO OS NOVOS TEMPOS ===
        // Nível 0: 1 minuto
        // Nível 1: 5 minutos
        // Nível 2+: 30 minutos
        let tempoBan = userData.banLevel === 0 ? 1 * 60000 : (userData.banLevel === 1 ? 5 * 60000 : 30 * 60000);
        
        userData.bannedUntil = now + tempoBan;
        userData.banLevel++;
        userData.timestamps = [];
        
        const tempoDisplay = tempoBan / 60000;
        return { permitido: false, erro: `🚫 FLOOD! Silenciado por ${tempoDisplay} min.` };
    }
    return { permitido: true };
}

// =======================================================
// 4. SERVIDOR MASTER
// =======================================================
async function existeMasterAtivo() {
  const adminsIPs = Object.keys(db.users).filter(ip => db.users[ip].role === 'admin' || db.users[ip].role === 'master');
  for (const adminIP of adminsIPs) {
    if (adminIP === MEU_IP) continue;
    try {
      const r = await fetch(`http://${adminIP}:${MASTER_PORT}/ping`);
      if (r.ok) return true;
    } catch (e) {}
  }
  return false;
}

function iniciarServidorMaster() {
  const masterApp = express();
  masterApp.use(express.json({ limit: '50mb' }));

  // CORS LIBERADO GERAL
  masterApp.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "*");
      res.header("Access-Control-Allow-Methods", "*");
      next();
  });

  masterApp.get("/ping", (req, res) => {
      let senderIp = req.ip.replace("::ffff:", "");
      db = lerDB();
      if (!db.users[senderIp]) {
          console.log(`🆕 Novo IP: ${senderIp}`);
          db.users[senderIp] = { nome: "Novo Usuário", role: "user", blocked: false, muted: false };
          fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
      }
      res.json({ alive: true, master: MEU_IP });
  });

  masterApp.get("/permissions", (req, res) => { db = lerDB(); res.json(db); });
  masterApp.get("/admin/schedules", (req, res) => res.json(lerAgendamentos()));

  // === NOVA ROTA: Sincronizar Contatos ===
  masterApp.get("/users/sync", (req, res) => {
      db = lerDB();
      // Retorna apenas usuários com nome definido, formato lista
      const listaPublica = Object.entries(db.users)
          .filter(([ip, user]) => user.nome && user.nome !== "Novo Usuário")
          .map(([ip, user]) => ({ nome: user.nome, ip: ip }));
      res.json(listaPublica);
  });

  masterApp.post("/admin/update", (req, res) => {
    let senderIp = req.ip.replace("::ffff:", "");
    if (senderIp === "127.0.0.1" || senderIp === "::1") senderIp = IP_DO_MASTER;

    db = lerDB();
    const solicitante = db.users[senderIp];

    if (!solicitante || (solicitante.role !== 'admin' && solicitante.role !== 'master')) {
        return res.status(403).json({ error: "Sem permissão." });
    }

    const { target_ip, action, senha } = req.body;

    if (action === 'promote' || action === 'demote') {
        if (senha !== SENHA_MESTRA) return res.status(401).json({ error: "Senha Mestra Incorreta!" });
    }

    if (!db.users[target_ip]) {
        db.users[target_ip] = { nome: "Novo", role: "user", blocked: false, muted: false };
    }
    const alvo = db.users[target_ip];

    if (action === 'promote') alvo.role = 'admin';
    if (action === 'demote') alvo.role = 'user';
    if (action === 'block') alvo.blocked = true;
    if (action === 'unblock') alvo.blocked = false;
    if (action === 'mute') alvo.muted = true;
    if (action === 'unmute') alvo.muted = false;

    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    res.json({ ok: true });
  });

  masterApp.post("/admin/import", (req, res) => {
      const { senha, dados } = req.body;
      if (senha !== SENHA_MESTRA) return res.status(401).json({ error: "Senha Incorreta!" });
      if (!dados || !dados.users) return res.status(400).json({ error: "JSON inválido" });

      fs.writeFileSync(dbPath, JSON.stringify(dados, null, 2));
      db = lerDB();
      res.json({ ok: true, total: Object.keys(dados.users).length });
  });

  masterApp.post("/admin/schedule", (req, res) => {
      if (req.body.senha !== SENHA_MESTRA) return res.status(401).json({ error: "Senha incorreta" });
      const lista = lerAgendamentos();
      lista.push({ id: Date.now(), titulo: req.body.titulo, horario: req.body.horario, ultimoDisparo: null });
      fs.writeFileSync(scheduledPath, JSON.stringify(lista, null, 2));
      res.json({ ok: true });
  });

  masterApp.delete("/admin/schedule/:id", (req, res) => {
      let lista = lerAgendamentos();
      lista = lista.filter(i => i.id !== parseInt(req.params.id));
      fs.writeFileSync(scheduledPath, JSON.stringify(lista, null, 2));
      res.json({ ok: true });
  });

  masterApp.post("/alert", (req, res) => {
    let senderIp = req.ip.replace("::ffff:", "");
    if (senderIp === "127.0.0.1" || senderIp === "::1") senderIp = IP_DO_MASTER;

    db = lerDB();
    const usuario = db.users[senderIp];

    if (!usuario || (usuario.role !== 'admin' && usuario.role !== 'master')) return res.status(403).json({ error: "Apenas Admins." });
    if (usuario.blocked) return res.status(403).json({ error: "Bloqueado." });
    
    const checkFlood = verificarPermissaoEnvio(senderIp);
    if (!checkFlood.permitido) return res.status(429).json({ error: checkFlood.erro });

    const data = { ...req.body, tipo: "geral" };
    for (const ip of Object.keys(db.users)) {
      fetch(`http://${ip}:4000/alerta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).catch(() => {});
    }
    res.json({ ok: true });
  });

  masterApp.post("/alert/private", (req, res) => {
    let senderIp = req.ip.replace("::ffff:", "");
    if (senderIp === "127.0.0.1" || senderIp === "::1") senderIp = IP_DO_MASTER;
    
    db = lerDB();
    const usuario = db.users[senderIp];
    
    if (usuario && usuario.blocked) return res.status(403).json({ error: "Bloqueado." });
    const checkFlood = verificarPermissaoEnvio(senderIp);
    if (!checkFlood.permitido) return res.status(429).json({ error: checkFlood.erro });

    let { para, de, mensagem } = req.body;
    fetch(`http://${para}:4000/alerta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ de, mensagem, tipo: "privado" }) }).catch(err => {});
    res.json({ ok: true });
  });

  masterApp.listen(MASTER_PORT, "0.0.0.0", () => {
      console.log("🔥 MASTER ON :", MASTER_PORT);
      iniciarRelogioAgendador();
  });
}

function iniciarRelogioAgendador() {
    setInterval(() => {
        const now = new Date();
        const hora = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const horarioAtual = `${hora}:${min}`;
        const diaHoje = now.toDateString();
        let lista = lerAgendamentos();
        let mudou = false;
        lista.forEach(item => {
            if (item.horario === horarioAtual && item.ultimoDisparo !== diaHoje) {
                const dbRef = lerDB();
                for (const ip of Object.keys(dbRef.users)) {
                    fetch(`http://${ip}:4000/alerta`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ de: "Sistema", mensagem: `🔔 ${item.titulo}`, tipo: "geral" }) }).catch(() => {});
                }
                item.ultimoDisparo = diaHoje; mudou = true;
            }
        });
        if (mudou) fs.writeFileSync(scheduledPath, JSON.stringify(lista, null, 2));
    }, 30000);
}

async function tentarVirarMaster() {
  // SE EU SOU O MASTER DEFINIDO, INICIO DIRETO
  if (MEU_IP === IP_DO_MASTER) {
      console.log("👑 IP Master detectado. Iniciando servidor...");
      iniciarServidorMaster();
      return;
  }
  
  if (!souAdmin) return;
  if (!await existeMasterAtivo()) {
    console.log("📡 Virando MASTER (Backup)...");
    iniciarServidorMaster();
  }
}

// CLIENTE LOCAL
const expressApp = express();
expressApp.use(express.json());
expressApp.post("/alerta", (req, res) => { showToast(req.body); res.json({ ok: true }); });
const server = http.createServer(expressApp);
server.listen(4000, () => console.log("🔵 Receptor :4000"));

// IPCs
ipcMain.handle("ler-config", () => {
    let dados = { nome: "", ip: MEU_IP };
    if (fs.existsSync(configPath)) {
        try { const f = JSON.parse(fs.readFileSync(configPath)); dados.nome = f.nome || ""; dados.ip = MEU_IP; } catch (e) {}
    }
    return dados;
});
ipcMain.handle("definir-config-inicial", (e, d) => { const n = { nome: d.nome, ip: MEU_IP }; fs.writeFileSync(configPath, JSON.stringify(n, null, 2)); config = n; return true; });
ipcMain.handle("ler-usuarios", () => {
    const usersJsonPath = path.join(configDir, "users.json");
    if (fs.existsSync(usersJsonPath)) return JSON.parse(fs.readFileSync(usersJsonPath));
    const defaultPath = path.join(__dirname, "users_default.json");
    if (fs.existsSync(defaultPath)) {
        try {
            const template = JSON.parse(fs.readFileSync(defaultPath));
            const listaInicial = Object.entries(template.users).map(([ip, dados]) => ({ nome: dados.nome, ip: ip }));
            fs.writeFileSync(usersJsonPath, JSON.stringify(listaInicial, null, 2));
            return listaInicial;
        } catch (e) { return []; }
    }
    return [];
});
ipcMain.handle("add-user", (e, u) => { const p = path.join(configDir, "users.json"); let c = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : []; c.push(u); fs.writeFileSync(p, JSON.stringify(c)); return true; });
ipcMain.handle("del-user", (e, ip) => { const p = path.join(configDir, "users.json"); if(fs.existsSync(p)) { let c = JSON.parse(fs.readFileSync(p)); c = c.filter(u => u.ip !== ip); fs.writeFileSync(p, JSON.stringify(c)); } return true; });

// === NOVO IPC: Salvar Lista Sincronizada ===
ipcMain.handle("sincronizar-lista", (e, listaNova) => {
    const p = path.join(configDir, "users.json");
    fs.writeFileSync(p, JSON.stringify(listaNova, null, 2));
    return true;
});

// JANELAS E TRAY
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720, height: 840, backgroundColor: "#0a0f1a", resizable: false, show: false,
    icon: path.join(__dirname, "ui", "icon.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true }
  });
  mainWindow.loadFile(path.join(__dirname, "ui", "index.html"));
  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.on('close', (event) => {
      if (!isQuiting) {
          event.preventDefault();
          mainWindow.hide();
          return false;
      }
  });
}

function showToast(data) {
  activePopups = activePopups.filter(w => !w.isDestroyed());
  if (activePopups.length >= MAX_VISIBLE) { const o = activePopups.shift(); if (o && !o.isDestroyed()) o.close(); }
  activePopups.forEach(win => { const [x, y] = win.getPosition(); win.setPosition(x, y - (TOAST_HEIGHT + TOAST_GAP), true); });
  const popup = new BrowserWindow({
    width: 320, height: 110, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, show: false, resizable: false, focusable: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true }
  });
  popup.loadFile(path.join(__dirname, "ui", "alert-popup.html"));
  popup.once("ready-to-show", () => {
    popup.webContents.send("popup-data", data);
    const display = screen.getPrimaryDisplay();
    popup.setPosition(display.workAreaSize.width - 340, display.workAreaSize.height - 150);
    popup.showInactive();
  });
  activePopups.push(popup);
  setTimeout(() => { if (!popup.isDestroyed()) popup.close(); }, 6000);
}

function createTray() {
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "ui", "icon.ico")));
    const contextMenu = Menu.buildFromTemplate([ { label: "Abrir", click: () => mainWindow.show() }, { label: "Sair", click: () => { isQuiting = true; app.quit(); } } ]);
    tray.setToolTip("AlertDesk"); tray.setContextMenu(contextMenu);
    tray.on("click", () => mainWindow.show());
}

app.whenReady().then(() => { tentarVirarMaster(); createWindow(); createTray(); });