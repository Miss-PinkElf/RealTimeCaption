// 核心修改：定义唯一的后端服务地址
const BACKEND_URL = "ws://localhost:8000/ws";

// --- 全局变量 (保持不变) ---
let ws;
let audioContext;
let scriptProcessor;
let sourceNode;
let mediaStream;

// --- 音频处理函数 (保持不变) ---
/**
 * 对音频数据进行重采样
 * @param {Float32Array} audioBuffer - 包含原始音频数据的 Float32Array 数组
 * @param {number} fromSampleRate - 原始采样率 (例如: 44100)
 * @param {number} toSampleRate - 目标采样率 (例如: 16000)
 * @returns {Float32Array} - 包含重采样后音频数据的 new Float32Array 数组
 */
function resample(audioBuffer, fromSampleRate, toSampleRate) {
  // 检查：如果原始采样率和目标采样率相同，则无需处理，直接返回原始数据。
  if (fromSampleRate === toSampleRate) {
    return audioBuffer;
  }

  // 计算原始采样率与目标采样率的比率。
  // 这个比率决定了需要将多少个原始样本合并成一个新的样本。
  // 例如，从 44100Hz 降到 16000Hz，比率约为 2.75，意味着大约每 2.75 个旧样本会生成 1 个新样本。
  const ratio = fromSampleRate / toSampleRate;

  // 根据比率计算重采样后新数组的长度。
  const newLength = Math.round(audioBuffer.length / ratio);

  // 创建一个新的 Float32Array 数组，用于存储重采样后的结果。
  const result = new Float32Array(newLength);

  // 初始化两个偏移量（或称为指针/索引）。
  // offsetResult 用于追踪新结果数组 `result` 的当前位置。
  // offsetBuffer 用于追踪原始音频数组 `audioBuffer` 的当前位置。
  let offsetResult = 0;
  let offsetBuffer = 0;

  // 循环遍历新结果数组的每一个位置，为其生成一个采样值。
  while (offsetResult < result.length) {
    // 计算当前新样本（在 offsetResult 位置）对应到原始缓冲区 `audioBuffer` 的范围的结束位置。
    // (offsetResult + 1) * ratio 确定了下一个新样本在旧缓冲区中的大致位置。
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);

    // 初始化累加器 `accum` 和计数器 `count`。
    // `accum` 用于累加一个范围（窗口）内所有原始样本的值。
    // `count` 用于记录这个范围内有多少个样本。
    let accum = 0;
    let count = 0;

    // 遍历从 `offsetBuffer` 到 `nextOffsetBuffer` 的这个“窗口”内的所有原始样本。
    // 这个 for 循环的作用是收集所有需要被合并成一个新样本的旧样本。
    for (
      let i = offsetBuffer;
      i < nextOffsetBuffer && i < audioBuffer.length;
      i++
    ) {
      accum += audioBuffer[i]; // 将样本值累加
      count++; // 样本数量加一
    }

    // 计算这个“窗口”内所有原始样本的平均值。
    // 如果 count 是 0 (虽然在正常逻辑下很少发生)，结果会是 NaN，但通常 count 至少为 1。
    // 这个平均值就是重采样后的新样本值。
    result[offsetResult] = accum / count;

    // 将结果数组的偏移量向前移动一位，准备生成下一个新样本。
    offsetResult++;

    // 更新原始缓冲区的偏移量，使其指向当前窗口的结束位置，作为下一个窗口的开始。
    offsetBuffer = nextOffsetBuffer;
  }

  // 返回包含了重采样后音频数据的新数组。
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
      console.log("前端: onaudioprocess 事件触发。");
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn(
          "前端: WebSocket 未就绪，跳过数据发送。readyState:",
          ws ? ws.readyState : "ws is null"
        );
        return;
      }
      console.log("前端: WebSocket 已就绪，正在处理并发送数据...");
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

    // --- 核心修改：通过 URL 查询参数告诉后端使用哪个引擎 ---
    const wsUrlWithEngine = `${BACKEND_URL}?engine=${engine}`;
    console.log(`正在连接到后端: ${wsUrlWithEngine}`);
    ws = new WebSocket(wsUrlWithEngine);
    // --- 修改结束 ---

    ws.onopen = () => {
      /* ... */
    };
    ws.onmessage = (event) => {
      console.log(
        "前端: 收到后端消息:1-1-1--1---1-1-1--1-1-",
        event,
        "1-1-1--1---1-1-1--1-1-"
      );
      onSubtitle(event.data);
    };
    ws.onerror = (error) => {
      console.error(`渲染进程：WebSocket 错误 (引擎: ${engine}):`, error);
      onError(`与后端服务连接失败`);
      stop();
    };
    ws.onclose = () => {
      /* ... */
      console.log("前端: WebSocket 连接成功打开 (onopen event)!");
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
