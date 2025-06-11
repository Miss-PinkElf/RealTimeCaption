// 核心修改：定义唯一的后端服务地址
const BACKEND_URL = "ws://localhost:8000/ws";

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

async function getAudioStream(audioSource) {
  if (audioSource === "microphone") {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
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
  onSubtitle,
  onError,
  audioSource = "desktop",
  engine = "local",
}) {
  console.log(
    `渲染进程：准备开始捕获，请求引擎: ${engine}，音频源: ${audioSource}`
  );
  if (audioContext) {
    await stop();
  }

  try {
    mediaStream = await getAudioStream(audioSource);

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const sourceSampleRate = audioContext.sampleRate;
    const bufferSize = 2048;

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    scriptProcessor.onaudioprocess = (e) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const resampledData = resample(inputData, sourceSampleRate, 16000);
      ws.send(resampledData.buffer);
    };

    sourceNode.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);

    // --- 核心修改：通过 URL 查询参数告诉后端使用哪个引擎 ---
    const wsUrlWithEngine = `${BACKEND_URL}?engine=${engine}`;
    console.log(`正在连接到后端: ${wsUrlWithEngine}`);
    ws = new WebSocket(wsUrlWithEngine);
    // --- 修改结束 ---

    ws.onopen = () => {
      /* ... */
    };
    ws.onmessage = (event) => {
      onSubtitle(event.data);
    };
    ws.onerror = (error) => {
      console.error(`渲染进程：WebSocket 错误 (引擎: ${engine}):`, error);
      onError(`与后端服务连接失败`);
      stop();
    };
    ws.onclose = () => {
      /* ... */
    };
  } catch (e) {
    console.error("渲染进程：捕获或连接失败:", e);
    onError(`错误: ${e.message}`);
    stop();
  }
}

async function stop() {
  console.log("渲染进程：正在停止捕获...");
  if (ws) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    ws = null;
  }
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
}

export { start, stop };
