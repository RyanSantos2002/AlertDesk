const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  lerConfig: () => ipcRenderer.invoke("ler-config"),
  lerUsuarios: () => ipcRenderer.invoke("ler-usuarios"),
  enviarPopupLocal: (data) => ipcRenderer.send("popup-data", data),
  adicionarUsuario: (user) => ipcRenderer.invoke("add-user", user),

deletarUsuario: (ip) => ipcRenderer.invoke("delete-user", ip), // Mudou de "del-user" para "delete-user"
    // NOVO: salvar nome inicial
   definirConfigInicial: (cfg) => ipcRenderer.invoke("definir-config-inicial", cfg),
  receberPopup: (callback) =>
    ipcRenderer.on("popup-data", (event, data) => callback(data))
});
