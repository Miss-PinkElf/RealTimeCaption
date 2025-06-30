// src/capturer.js
const BACKEND_WS_URL = "ws://localhost:8080/audio";

// --- 全局变量 ---
let ws;
let audioContext;
let scriptProcessor;
let sourceNode;
let mediaStream; // 存储 mediaStream 以便可以停止它

// --- 音频处理函数 ---
/**
 * 将 Float32Array 的音频数据转换为 Int16Array 的 PCM 数据
 */
function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

/**
 * 重新采样音频数据到目标采样率 (16000Hz)
 */
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

// --- 核心逻辑 ---

async function getAudioStream(audioSource) {
  if (audioSource === "microphone") {
    console.log("渲染进程：正在请求麦克风权限...");
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
  }

  // 默认是桌面音频
  console.log("渲染进程：正在请求桌面音频源...");
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

async function start({ onSubtitle, onError, audioSource = "desktop" }) {
  console.log(`渲染进程：准备开始捕获 (${audioSource})...`);
  if (audioContext) {
    await stop();
  }

  try {
    mediaStream = await getAudioStream(audioSource);

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const sourceSampleRate = audioContext.sampleRate;
    const bufferSize = 4096;

    sourceNode = audioContext.createMediaStreamSource(mediaStream);

    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    scriptProcessor.onaudioprocess = (e) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const resampledData = resample(inputData, audioContext.sampleRate, 16000);

      // --- 开始：新增的格式转换逻辑 ---
      const pcm16Data = new Int16Array(resampledData.length);
      for (let i = 0; i < resampledData.length; i++) {
        // 将浮点数样本限制在 -1.0 到 1.0 之间，防止溢出
        let s = Math.max(-1, Math.min(1, resampledData[i]));
        // 将浮点数转换为 16 位有符号整数
        // 正数乘以 0x7FFF (32767)，负数乘以 0x8000 (-32768)
        s = s < 0 ? s * 0x8000 : s * 0x7fff;
        pcm16Data[i] = s;
      }
      // --- 结束：新增的格式转换逻辑 ---

      // 发送转换后得到的 Int16Array 的 buffer
      ws.send(pcm16Data.buffer);
    };

    sourceNode.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    ws = new WebSocket(BACKEND_WS_URL);

    ws.onopen = () => {
      console.log("渲染进程：与后端 WebSocket 连接成功");
      onSubtitle("服务连接成功，开始识别...");
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.text) {
          onSubtitle(message.text);
        }
      } catch (e) {
        console.error("渲染进程：处理后端消息失败:", event.data, e);
      }
    };

    ws.onerror = (error) => {
      console.error("渲染进程：WebSocket 错误:", error);
      onError("与后端服务连接失败");
      stop();
    };

    ws.onclose = () => {
      console.log("渲染进程：与后端 WebSocket 连接已关闭");
      // Don't show an error if we closed it intentionally
      // onError("与后端服务连接已断开");
      // stop();
    };
  } catch (e) {
    console.error("渲染进程：捕获或连接失败:", e);
    onError(`错误: ${e.message}`);
    stop();
  }
}

async function stop() {
  console.log("渲染进程：正在停止捕获...");

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }

  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }

  if (ws) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
      console.log("渲染进程：WebSocket 连接已关闭");
    }
    ws = null;
  }
}
export { start, stop };
