// main.js
const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  dialog,
} = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");

let mainWindow;
// 定义窗口的两种尺寸状态
const originalSize = { width: 800, height: 120 };
const settingsOpenSize = { width: 800, height: 550 };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: originalSize.width,
    height: originalSize.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: isDev, // 在开发模式下允许手动调整窗口大小，方便调试
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, "public", "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  const url = isDev
    ? "http://localhost:3000"
    : `file://${path.join(__dirname, "../build/index.html")}`;
  mainWindow.loadURL(url);
}

// 响应获取音频源的请求
ipcMain.handle("get-desktop-audio-source", async () => {
  console.log("主进程：收到获取音频源的请求");
  try {
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    if (sources && sources.length > 0) {
      console.log("主进程：找到音频源", sources[0].id);
      return sources[0].id;
    }
  } catch (e) {
    console.error("主进程：desktopCapturer 获取源失败", e);
  }
  return null;
});

// 处理窗口最小化请求
ipcMain.on("minimize-window", () => {
  console.log("主进程：收到最小化窗口的请求");
  if (mainWindow) {
    mainWindow.minimize();
  }
});

// 处理窗口关闭请求
ipcMain.on("close-window", () => {
  console.log("主进程：收到关闭窗口的请求");
  if (mainWindow) {
    app.quit();
  }
});

// 处理选择目录的请求
ipcMain.handle("select-directory", async () => {
  console.log("主进程：收到选择目录的请求");
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (!canceled) {
    return filePaths[0];
  }
  return null;
});

// (核心) 处理调整窗口大小的请求
ipcMain.on("resize-window", (event, { width, height }) => {
  if (mainWindow) {
    console.log(`主进程：收到调整窗口的请求 -> ${width}x${height}`);
    // 第三个参数 true 表示使用动画效果调整尺寸
    mainWindow.setSize(width, height, true);
  }
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
