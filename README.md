# ⚡ AlertDesk — Sistema de Alertas em Rede (Electron)

O **AlertDesk** é um aplicativo desktop desenvolvido em **Electron + Express** que permite enviar e receber alertas instantâneos entre computadores da mesma rede local.  
Ele é leve, rápido e inicia automaticamente com o Windows.

---

## 🚀 Funcionalidades

### ✅ **Envio de alertas entre máquinas**
- Envie uma mensagem personalizada para qualquer outro usuário da rede.
- Envie alertas para todos os usuários cadastrados.

### ✅ **Popup animado de notificação**
- Cada alerta recebido abre um popup estiloso.
- Inclui som de alerta.

### ✅ **Lista de usuários conectados**
- Adicione usuários manualmente (Nome + IP).
- Remova usuários quando quiser.

### ✅ **Configuração automática**
- Na primeira execução, o sistema solicita o nome do usuário.
- Dados são salvos em `config/config.json` automaticamente.

### ✅ **Tray System**
- Minimiza para área de notificação.
- Pode abrir, recarregar ou encerrar o app pelo ícone.

### ✅ **Inicia junto com o Windows**
O aplicativo é configurado para inicializar automaticamente.

---

## 📦 Tecnologias Utilizadas

- **Electron**
- **Node.js**
- **Express**
- **HTML / CSS / JS**
- **IPC (Inter Process Communication)** para comunicação entre Front ⇄ Electron
- **Electron Tray API**

---


🛠️ Instalação e Execução

1️⃣ Instale as dependências
npm install

2️⃣ Rode o app em modo desenvolvimento
npm start

3️⃣ Gerar instalador (EXE)
npm run build


O instalador será gerado na pasta /dist.

## 📁 Estrutura do Projeto

```bash
AlertDesk/
├── main.js
├── preload.js
├── receptor.js
├── package.json
├── express server (porta 4000)
├── ui/
│   ├── index.html
│   ├── alert-popup.html
│   ├── beep.mp3
│   └── icon.ico
└── config/
    ├── config.json      # ignorado no Git
    └── users.json       # ignorado no Git


