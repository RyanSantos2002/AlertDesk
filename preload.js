const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  lerConfig: () => ipcRenderer.invoke("ler-config"),
  definirConfigInicial: (dados) => ipcRenderer.invoke("definir-config-inicial", dados),
  lerUsuarios: () => ipcRenderer.invoke("ler-usuarios"),
  adicionarUsuario: (usuario) => ipcRenderer.invoke("add-user", usuario),
  deletarUsuario: (ip) => ipcRenderer.invoke("del-user", ip),
  
  // === NOVO: Função para salvar a lista sincronizada ===
  sincronizarLista: (lista) => ipcRenderer.invoke("sincronizar-lista", lista),
  
  receberPopup: (callback) => ipcRenderer.on("popup-data", (event, data) => callback(data))
});