const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  iniciarSesion: (credenciales) => ipcRenderer.invoke('login', credenciales),
});

