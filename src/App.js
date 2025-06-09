// src/App.js
import React, { useState, useCallback } from "react";
import "./App.css";
import { start, stop } from "./capturer"; // 引入新的 capturer 模块

function App() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [subtitles, setSubtitles] = useState("点击“开始”按钮启动字幕");

  // 使用 useCallback 包装回调函数，提高性能
  const handleCaptureError = useCallback((errorMsg) => {
    console.error("Capture Error:", errorMsg);
    setSubtitles(`错误: ${errorMsg}`);
    setIsCapturing(false);
  }, []);

  const handleSubtitleUpdate = useCallback((text) => {
    setSubtitles(text);
  }, []);

  // 不再需要 useEffect 来监听 IPC 事件

  const handleStartStop = () => {
    const nextState = !isCapturing;
    setIsCapturing(nextState);

    if (nextState) {
      setSubtitles("正在获取音频设备...");
      // 直接调用 capturer 的 start 方法，并传入回调
      start({
        onSubtitle: handleSubtitleUpdate,
        onError: handleCaptureError,
      });
    } else {
      stop();
      setSubtitles("字幕已停止，悬浮可操作");
    }
  };

  const handleExportSubtitles = () => {
    console.log("请求导出字幕...");
    alert("导出字幕功能待实现！");
  };

  const handleAdjustStyles = () => {
    console.log("请求调整样式...");
    alert("调整样式功能待实现！");
  };

  return (
    <div className="App">
      <div className="subtitle-display-area">
        <p className="subtitle-text">{subtitles}</p>
      </div>

      <div className="controls-area">
        <button
          onClick={handleStartStop}
          title={isCapturing ? "停止捕获" : "开始捕获"}
        >
          {isCapturing ? "停止" : "开始"}
        </button>
        <button
          onClick={handleExportSubtitles}
          disabled={isCapturing}
          title="导出当前字幕记录"
        >
          导出字幕
        </button>
        <button onClick={handleAdjustStyles} title="调整字幕显示样式">
          调整样式
        </button>
      </div>
    </div>
  );
}

export default App;
