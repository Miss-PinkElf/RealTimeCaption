// public/preload.js
const { contextBridge, ipcRenderer } = require("electron");

// 我们只需要暴露必须由主进程/Node.js环境提供的功能
contextBridge.exposeInMainWorld("electronAPI", {
  getDesktopAudioSource: () => ipcRenderer.invoke("get-desktop-audio-source"),
});

console.log("Preload script loaded!");
