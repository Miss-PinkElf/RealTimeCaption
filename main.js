// main.js
const { app, BrowserWindow, ipcMain, desktopCapturer } = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");

let mainWindow;

function createWindow() {
  // --- 关键诊断代码 ---
  const preloadPath = path.join(__dirname, "public", "preload.js");

  // --- 诊断代码结束 ---

  mainWindow = new BrowserWindow({
    width: 800,
    height: 120,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      // 使用我们刚刚打印的路径变量
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 在开发模式下，自动打开开发者工具
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  const url = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../build/index.html")}`;
  mainWindow.loadURL(url);
}

// 响应渲染进程的请求，返回可用的桌面音频源ID
ipcMain.handle("get-desktop-audio-source", async () => {
  console.log("主进程：收到获取音频源的请求");
  try {
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    // 通常第一个源就是整个桌面
    if (sources && sources.length > 0) {
      console.log("主进程：找到音频源", sources[0].id);
      return sources[0].id;
    }
  } catch (e) {
    console.error("主进程：desktopCapturer 获取源失败", e);
  }
  return null;
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
