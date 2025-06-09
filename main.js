// public/electron.js
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800, // 窗口宽度，可以根据你的字幕内容调整
    height: 120, // 窗口高度，设计成一个扁平的条状
    transparent: true, // 关键：窗口透明
    frame: false, // 关键：无边框窗口
    alwaysOnTop: true, // 窗口总在最前
    resizable: false, // 禁止调整窗口大小，更像工具应用
    skipTaskbar: false, // (可选) 不在任务栏显示图标，更像一个覆盖层工具
    webPreferences: {
      preload: path.join(__dirname, "preload.js"), // (推荐) 预加载脚本
      nodeIntegration: false, // 为了安全，保持 false
      contextIsolation: true, // 为了安全，保持 true
      // devTools: isDev,    // (可选) 开发时自动打开开发者工具
    },
  });

  // 加载 React 应用
  mainWindow.loadURL(
    isDev
      ? "http://localhost:3000" // React 开发服务器地址
      : `file://${path.join(__dirname, "../build/index.html")}` // 打包后入口
  );

  // 开发模式下可以取消注释打开开发者工具
  // if (isDev) {
  //   mainWindow.webContents.openDevTools({ mode: 'detach' });
  // }

  // mainWindow.setIgnoreMouseEvents(true, { forward: true }); // (高级) 如果希望鼠标穿透窗口，除非悬停在特定区域
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

// --- 新增 IPC 通信处理 ---
ipcMain.on("start-capture", () => {
  console.log("接收到 'start-capture' 指令");
  audioCapturer.start({
    win: mainWindow,
    onError: (error) => {
      // 当发生错误时，通知前端
      mainWindow.webContents.send("on-capture-error", error);
    },
  });
});

ipcMain.on("stop-capture", () => {
  console.log("接收到 'stop-capture' 指令");
  audioCapturer.stop();
});

// (推荐) 创建一个空的 public/preload.js 文件:
// console.log('Preload script has been loaded');
// //  未来可以在这里通过 contextBridge 暴露 Node.js 功能给渲染进程
// const { contextBridge, ipcRenderer } = require('electron');
// contextBridge.exposeInMainWorld('electronAPI', {
//   // 示例：send: (channel, data) => ipcRenderer.send(channel, data),
//   //       on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
// });
