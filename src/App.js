// src/App.js
import React, { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [subtitles, setSubtitles] = useState("点击“开始”按钮启动字幕");

  // 监听从主进程传来的字幕和错误信息
  useEffect(() => {
    // 监听字幕更新
    window.electronAPI.onSubtitle((text) => {
      setSubtitles(text);
    });

    // 监听捕获错误
    window.electronAPI.onCaptureError((error) => {
      console.error("Capture Error:", error);
      setSubtitles(`错误: ${error}`);
      setIsCapturing(false); // 出错时停止
    });

    // 组件卸载时清理监听器
    return () => {
      window.electronAPI.cleanup();
    };
  }, []); // 空依赖数组确保只在组件挂载时注册一次

  const handleStartStop = () => {
    const nextState = !isCapturing;
    setIsCapturing(nextState);

    if (nextState) {
      setSubtitles("正在连接后端服务...");
      window.electronAPI.startCapture();
    } else {
      setSubtitles("字幕已停止，悬浮可操作");
      window.electronAPI.stopCapture();
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
