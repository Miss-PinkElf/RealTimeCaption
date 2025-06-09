// public/preload.js

const { contextBridge, ipcRenderer } = require("electron");

// 安全地将 Electron 功能暴露给渲染进程
contextBridge.exposeInMainWorld("electronAPI", {
  startCapture: () => ipcRenderer.send("start-capture"),
  stopCapture: () => ipcRenderer.send("stop-capture"),
  onSubtitle: (callback) =>
    ipcRenderer.on("on-subtitle", (_event, value) => callback(value)),
  onCaptureError: (callback) =>
    ipcRenderer.on("on-capture-error", (_event, value) => callback(value)),
  // 清理监听器，防止内存泄漏
  cleanup: () => {
    ipcRenderer.removeAllListeners("on-subtitle");
    ipcRenderer.removeAllListeners("on-capture-error");
  },
});
console.log("Preload script loaded!");
// 之后我们会在这里使用 contextBridge 来安全地暴露 Node.js 功能给 React
