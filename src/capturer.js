// capturer.js

// 核心修改：定义唯一的后端服务地址
// 请确保这里的地址与您的 FastAPI 后端实际运行的地址和端口匹配，
// 并且路由是 /audio/ws (因为 main.py 中 router 的 prefix="/audio")
const BACKEND_URL = "ws://localhost:8000/ws"; // <-- 修正这里的路径

// --- 全局变量 (保持不变) ---
let ws;
let audioContext;
let scriptProcessor;
let sourceNode;
let mediaStream;

// --- 音频处理函数 (保持不变) ---
function resample(audioBuffer, fromSampleRate, toSampleRate) {
  if (fromSampleRate === toSampleRate) {
    return audioBuffer;
  }
  const ratio = fromSampleRate / toSampleRate;
  const newLength = Math.round(audioBuffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0,
      count = 0;
    for (
      let i = offsetBuffer;
      i < nextOffsetBuffer && i < audioBuffer.length;
      i++
    ) {
      accum += audioBuffer[i];
      count++;
    }
    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

// --- 新增函数: 将 Float32Array 转换为 Int16Array ---
// 范围从 -1.0 到 1.0 缩放到 -32768 到 32767
function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    let s = Math.max(-1, Math.min(1, input[i])); // 确保值在 -1.0 到 1.0 之间
    // 将浮点数转换为 16 位整数。
    // 对于负数，乘以 32768 (0x8000)，对于非负数，乘以 32767 (0x7FFF)
    // 这是因为 Int16Array 的负数范围比正数大1 (-32768 to 32767)
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}
// --- 新增函数结束 ---

async function getAudioStream(audioSource) {
  if (audioSource === "microphone") {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
  // 由于您明确说明在 Electron 环境中运行，我们保留这一部分。
  // 确保您的 Electron 主进程通过 `contextBridge` 暴露了 `electronAPI.getDesktopAudioSource`。
  if (
    typeof window.electronAPI === "undefined" ||
    typeof window.electronAPI.getDesktopAudioSource !== "function"
  ) {
    console.warn(
      "Electron API for desktop audio source is not available. Falling back to microphone if 'desktop' is selected without Electron context."
    );
    throw new Error(
      "Electron API (window.electronAPI.getDesktopAudioSource) not found. This feature is for Electron only."
    );
  }
  const sourceId = await window.electronAPI.getDesktopAudioSource();
  if (!sourceId) throw new Error("无法获取桌面音频源。");
  return navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
      },
    },
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
      },
    },
  });
}

// 修改: start 函数接收 engine 参数
async function start({
  onSubtitle, // 回调函数，用于接收字幕
  onError, // 回调函数，用于处理错误
  audioSource = "desktop", // 音频源，可以是 'microphone' 或 'desktop'
  engine = "local", // 指定后端使用的引擎，'local' 或 'cloud'
}) {
  console.log(
    `渲染进程：准备开始捕获，请求引擎: ${engine}，音频源: ${audioSource}`
  );
  if (audioContext) {
    // 如果已经有音频上下文，先停止再重新开始
    await stop();
  }

  try {
    mediaStream = await getAudioStream(audioSource); // 获取音频流

    // 初始化 Web Audio API
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const sourceSampleRate = audioContext.sampleRate; // 浏览器默认采样率
    const bufferSize = 2048; // ScriptProcessorNode 的缓冲区大小

    sourceNode = audioContext.createMediaStreamSource(mediaStream); // 创建媒体流源节点
    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1); // 创建 ScriptProcessorNode，1 输入通道，1 输出通道

    // 音频处理回调函数
    scriptProcessor.onaudioprocess = (e) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return; // 如果 WebSocket 未打开，则不发送数据
      const inputData = e.inputBuffer.getChannelData(0); // 获取左声道数据 (Float32Array)
      // 将音频数据重采样到 16000Hz (阿里云 ASR 推荐采样率)
      const resampledData = resample(inputData, sourceSampleRate, 16000); // 仍然是 Float32Array

      // --- 核心修复: 将 Float32Array 转换为 Int16Array ---
      const pcm16BitData = floatTo16BitPCM(resampledData); // 转换为 16 位 PCM
      ws.send(pcm16BitData.buffer); // 发送 Int16Array 的 ArrayBuffer
      // --- 修复结束 ---
    };

    sourceNode.connect(scriptProcessor); // 连接媒体流源到 ScriptProcessorNode
    scriptProcessor.connect(audioContext.destination); // 连接 ScriptProcessorNode 到音频输出 (可选，用于本地监听)

    // --- 核心修改：通过 URL 查询参数告诉后端使用哪个引擎 ---
    const wsUrlWithEngine = `${BACKEND_URL}?engine=${engine}`;
    console.log(`正在连接到后端: ${wsUrlWithEngine}`);
    ws = new WebSocket(wsUrlWithEngine); // 建立 WebSocket 连接
    // --- 修改结束 ---

    // WebSocket 事件监听
    ws.onopen = (event) => {
      console.log("渲染进程：WebSocket 连接已打开。", event);
      // 连接成功后可以更新 UI 状态
    };
    // --- 核心修改：解析接收到的 JSON 消息 ---
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("渲染进程：收到后端消息:", message); // 新增日志，查看原始消息结构
        if (message.text) {
          // 如果有 is_final 字段，可以根据需要处理中间结果
          if (message.is_final !== undefined) {
            if (message.is_final) {
              onSubtitle(message.text); // 最终字幕
            } else {
              // 如果你需要显示中间结果，这里可以调用不同的回调或更新状态
              // 例如：onIntermediateSubtitle(message.text);
              onSubtitle(message.text + "..."); // 临时显示中间结果，加省略号
            }
          } else {
            // 如果没有 is_final 字段，默认为最终字幕
            onSubtitle(message.text);
          }
        } else if (message.error) {
          onError(`后端错误: ${message.error}`); // 处理后端错误信息
        }
      } catch (e) {
        console.error("渲染进程：处理后端消息失败，消息内容:", event.data, e);
        // 如果解析失败，可能是非JSON消息，或者格式不正确
        onSubtitle(`解析错误：${event.data}`); // 显示原始消息或错误信息
      }
    };
    ws.onerror = (error) => {
      console.error(`渲染进程：WebSocket 错误 (引擎: ${engine}):`, error);
      onError(`与后端服务连接失败`); // 调用传入的错误回调
      stop(); // 发生错误时停止捕获
    };
    ws.onclose = () => {
      console.log("渲染进程：WebSocket 连接已关闭。");
      // 连接关闭后可以更新 UI 状态
    };
  } catch (e) {
    console.error("渲染进程：捕获或连接失败:", e);
    onError(`错误: ${e.message}`); // 捕获和连接失败时调用错误回调
    stop(); // 发生错误时停止捕获
  }
}

async function stop() {
  console.log("渲染进程：正在停止捕获...");
  if (ws) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(); // 关闭 WebSocket 连接
    }
    ws = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop()); // 停止媒体流轨道
    mediaStream = null;
  }
  if (sourceNode) {
    sourceNode.disconnect(); // 断开源节点连接
    sourceNode = null;
  }
  if (scriptProcessor) {
    scriptProcessor.disconnect(); // 断开 ScriptProcessorNode 连接
    scriptProcessor = null;
  }
  if (audioContext) {
    await audioContext.close(); // 关闭音频上下文
    audioContext = null;
  }
}

// 导出 start 和 stop 函数，以便其他模块可以导入使用它们
export { start, stop };
