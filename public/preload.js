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
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"), // 用于选择待转录文件

  // 新增：读取文件内容为 Blob (ArrayBuffer)
  readFileAsBlob: async (filePath) => {
    try {
      const data = await ipcRenderer.invoke("read-file-as-blob", filePath);
      if (data) {
        // 将 ArrayBuffer 转换为 Blob
        return new Blob([data]);
      }
      return null;
    } catch (error) {
      console.error("Error in readFileAsBlob (renderer):", error);
      // 根据需要处理错误，例如返回 null 或重新抛出
      throw error;
    }
  },

  // 新增：保存文件到本地 (用于保存下载的字幕文件)
  saveFileDialog: (filename, content, defaultPath = null) =>
    ipcRenderer.invoke("save-file-dialog", filename, content, defaultPath),

  // (核心) 调整窗口大小
  resizeWindow: ({ width, height }) =>
    ipcRenderer.send("resize-window", { width, height }),
});
