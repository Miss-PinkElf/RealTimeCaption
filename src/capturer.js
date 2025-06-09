// src/capturer.js
const BACKEND_WS_URL = "ws://localhost:8080/audio";

// --- 全局变量 ---
let ws;
let audioContext;
let scriptProcessor;
let sourceNode;

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

async function start({ onSubtitle, onError }) {
  console.log("渲染进程：准备开始捕获...");
  if (audioContext) {
    await stop();
  }

  try {
    const sourceId = await window.electronAPI.getDesktopAudioSource();
    if (!sourceId) throw new Error("无法获取桌面音频源。");

    const stream = await navigator.mediaDevices.getUserMedia({
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

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const sourceSampleRate = audioContext.sampleRate;
    const bufferSize = 4096;

    sourceNode = audioContext.createMediaStreamSource(stream);

    // ScriptProcessorNode 已被废弃，但为了简单和兼容性我们先用它。
    // 更现代的方法是 AudioWorklet，但那会更复杂。
    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    scriptProcessor.onaudioprocess = (e) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return;
      }
      // 获取原始的 Float32 音频数据
      const inputData = e.inputBuffer.getChannelData(0);

      // 1. 重新采样到 16000 Hz
      const resampledData = resample(inputData, sourceSampleRate, 16000);

      // 2. 转换为 16-bit PCM 格式
      const pcmData = floatTo16BitPCM(resampledData);

      // 3. 发送原始字节数据
      ws.send(pcmData.buffer);
    };

    sourceNode.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination); // 需要连接到 destination 才能触发 onaudioprocess

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
      onError("与后端服务连接已断开");
      stop();
    };
  } catch (e) {
    console.error("渲染进程：捕获或连接失败:", e);
    onError(`错误: ${e.message}`);
  }
}

async function stop() {
  console.log("渲染进程：正在停止捕获...");

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
  }
  const k = 1;
  ws = null;
}

export { start, stop };
