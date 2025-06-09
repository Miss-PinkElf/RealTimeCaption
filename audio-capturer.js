// audio-capturer.js
const { desktopCapturer } = require("electron");
const WebSocket = require("ws"); // 需要先安装: npm install ws

// 后端 WebSocket 服务器地址
const BACKEND_WS_URL = "ws://localhost:8080/audio"; // 请根据您的后端地址修改

let mediaRecorder;
let ws;

/**
 * 开始捕捉音频并发送到后端
 * @param {object} options
 * @param {BrowserWindow} options.win - 用于发送字幕到前端的窗口实例
 * @param {(error) => void} options.onError - 错误回调
 */
async function start({ win, onError }) {
  console.log("准备开始捕获系统音频...");

  try {
    // 1. 获取桌面音频流
    const sources = await desktopCapturer.getSources({ types: ["screen"] });
    // 通常第一个源是整个桌面
    const source = sources[0];

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "desktop",
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
        },
      },
    });

    // 2. 初始化 WebSocket 连接
    ws = new WebSocket(BACKEND_WS_URL);

    ws.on("open", () => {
      console.log("与后端 WebSocket 连接成功");
      // 3. 使用 MediaRecorder 处理音频流
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          // 4. 将音频数据块发送到后端
          ws.send(event.data);
        }
      };

      mediaRecorder.start(1000); // 每 1000 毫秒 (1秒) 收集一次数据
      console.log("音频捕获已开始，正在发送数据...");
    });

    // 5. 接收后端传回的字幕
    ws.on("message", (message) => {
      try {
        const subtitle = JSON.parse(message).text; // 假设后端返回 { "text": "这是字幕" }
        if (subtitle && win) {
          win.webContents.send("on-subtitle", subtitle);
        }
      } catch (e) {
        console.error("处理后端消息失败:", message.toString(), e);
        onError("处理后端消息失败");
      }
    });

    ws.on("error", (error) => {
      console.error("WebSocket 发生错误:", error);
      onError("与后端服务连接失败");
      stop();
    });

    ws.on("close", () => {
      console.log("与后端 WebSocket 连接已关闭");
      stop();
    });
  } catch (e) {
    console.error("捕获音频失败:", e);
    onError("无法捕获系统音频");
  }
}

/**
 * 停止捕捉
 */
function stop() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    console.log("音频捕获已停止");
  }
  if (ws) {
    ws.close();
  }
  mediaRecorder = null;
  ws = null;
}

module.exports = {
  start,
  stop,
};
