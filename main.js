// =======================================================
// IMPORTS
// =======================================================
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");

let mainWindow;
let tray;

// =======================================================
// IMPEDIR MÚLTIPLAS INSTÂNCIAS
// =======================================================
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
    }
  });
}

// =======================================================
// EXPRESS — RECEBE ALERTA
// =======================================================
const expressApp = express();
expressApp.use(express.json());

expressApp.post("/alerta", (req, res) => {
  showToast(req.body);
  res.json({ ok: true });
});

const server = http.createServer(expressApp);
server.listen(4000, () => console.log("🔵 Servidor rodando em :4000"));

// =======================================================
// IPC — CONFIG E USUÁRIOS
// =======================================================
ipcMain.handle("ler-config", () => {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "config", "config.json")));
});

ipcMain.handle("definir-config-inicial", (event, data) => {
  const p = path.join(__dirname, "config", "config.json");
  const novo = { nome: data.nome };
  fs.writeFileSync(p, JSON.stringify(novo, null, 2));
  return true;
});

ipcMain.handle("ler-usuarios", () => {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "config", "users.json")));
});

ipcMain.handle("add-user", (event, novoUser) => {
  const file = path.join(__dirname, "config", "users.json");
  const current = JSON.parse(fs.readFileSync(file));
  current.push(novoUser);
  fs.writeFileSync(file, JSON.stringify(current, null, 2));
  return true;
});

ipcMain.handle("delete-user", (event, ip) => {
  const file = path.join(__dirname, "config", "users.json");
  let current = JSON.parse(fs.readFileSync(file));
  current = current.filter(u => u.ip !== ip);
  fs.writeFileSync(file, JSON.stringify(current, null, 2));
  return true;
});

// =======================================================
// CRIAR JANELA PRINCIPAL
// =======================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 840,
    show: false,
    resizable: false,
    icon: path.join(__dirname, "ui", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "ui", "index.html"));

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// =======================================================
// POPUP BONITO (CORRIGIDO)
// =======================================================
function showToast(data) {
  const popup = new BrowserWindow({
    width: 320,
    height: 110,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    // ADICIONE ESTE BLOCO AQUI ABAIXO:
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });

  popup.loadFile(path.join(__dirname, "ui", "alert-popup.html"));

  popup.once("ready-to-show", () => {
    // Agora o popup consegue ouvir esse evento
    popup.webContents.send("popup-data", data);

    const { screen } = require("electron");
    const display = screen.getPrimaryDisplay();

    // Ajuste de posição
    popup.setPosition(display.workAreaSize.width - 340, display.workAreaSize.height - 150);
    popup.show();
  });

  // Fecha depois de 6 segundos
  setTimeout(() => {
    if (!popup.isDestroyed()) {
      popup.close();
    }
  }, 6000);
}

// =======================================================
// TRAY
// =======================================================
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, "ui", "icon.ico"));
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: "Abrir Painel", click: () => mainWindow.show() },
    { label: "Recarregar", click: () => mainWindow.reload() },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip("AlertDesk — Receptor de Alertas");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => mainWindow.show());
}

// =======================================================
// APP INIT
// =======================================================
app.whenReady().then(() => {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath
  });

  createWindow();
  createTray();
});
