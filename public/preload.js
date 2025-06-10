// public/preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // 获取桌面音频源ID
  getDesktopAudioSource: () => ipcRenderer.invoke("get-desktop-audio-source"),

  // 窗口控制
  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  closeWindow: () => ipcRenderer.send("close-window"),

  // 设置面板功能
  selectDirectory: () => ipcRenderer.invoke("select-directory"),

  // (核心) 调整窗口大小
  resizeWindow: ({ width, height }) =>
    ipcRenderer.send("resize-window", { width, height }),
});
