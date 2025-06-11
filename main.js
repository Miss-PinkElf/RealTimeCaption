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
const fs = require("fs/promises"); // 导入 fs/promises 模块

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

// 处理选择目录的请求 (用于设置字幕导出路径)
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

// 处理打开文件对话框的请求 (用于选择待转录的音视频文件)
ipcMain.handle("open-file-dialog", async () => {
  console.log("主进程：收到打开文件对话框的请求");
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      {
        name: "Audio/Video Files",
        extensions: [
          "mp3",
          "wav",
          "mp4",
          "mkv",
          "mov",
          "avi",
          "flac",
          "aac",
          "m4a",
        ], // 添加更多常见格式
      },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (!canceled) {
    return filePaths[0];
  }
  return null;
});

// 新增：处理读取文件内容为 Blob 的请求
ipcMain.handle("read-file-as-blob", async (event, filePath) => {
  console.log(`主进程：收到读取文件请求 -> ${filePath}`);
  try {
    const fileBuffer = await fs.readFile(filePath);
    // 直接返回 ArrayBuffer
    return fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    );
  } catch (error) {
    console.error("主进程：读取文件失败:", error);
    throw error; // 抛出错误以便渲染进程捕获
  }
});

// 新增：处理保存文件到本地的请求 (用于保存下载的字幕文件)
ipcMain.handle(
  "save-file-dialog",
  async (event, filename, content, defaultPath = null) => {
    console.log(`主进程：收到保存文件请求 -> ${filename}`);
    let suggestedPath = filename;
    if (defaultPath) {
      // 如果提供了默认路径，则将其与文件名结合
      suggestedPath = path.join(defaultPath, filename);
    }

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: suggestedPath,
      filters: [
        { name: "Subtitle Files", extensions: ["srt"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    if (canceled) {
      return null;
    } else {
      try {
        await fs.writeFile(filePath, content, "utf-8");
        console.log(`主进程：文件已保存到 -> ${filePath}`);
        return filePath;
      } catch (error) {
        console.error("主进程：保存文件失败:", error);
        throw error; // 抛出错误以便渲染进程捕获
      }
    }
  }
);

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
