// src/App.js
import React, { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [subtitles, setSubtitles] = useState("点“开始”按钮启动字幕"); // 初始提示

  // --- 模拟字幕更新 ---
  useEffect(() => {
    let intervalId;
    if (isCapturing) {
      const demoSubtitles = [
        "你好，这是实时字幕演示。",
        "Electron 和 React 配合得很好。",
        "Java (后端) 将处理音频和翻译。",
        "当前为模拟字幕...",
        "鼠标悬浮可显示控制选项。",
        "样式可以进一步定制哦！",
      ];
      let i = 0;
      setSubtitles(demoSubtitles[i]); // 立即显示第一条
      i++;
      intervalId = setInterval(() => {
        setSubtitles(demoSubtitles[i % demoSubtitles.length]);
        i++;
      }, 3000); // 每3秒切换一次
    } else {
      if (subtitles !== "点“开始”按钮启动字幕") {
        // 避免在初始状态时重复设置
        setSubtitles("字幕已停止，悬浮可操作");
      }
    }
    return () => clearInterval(intervalId);
  }, [isCapturing]); // 依赖 isCapturing，当它变化时重新执行

  const handleStartStop = () => {
    setIsCapturing(!isCapturing);
    // TODO: 通过 IPC 通知后端开始/停止
    console.log(isCapturing ? "请求停止捕获..." : "请求开始捕获...");
  };

  const handleExportSubtitles = () => {
    // TODO: 实现导出逻辑
    console.log("请求导出字幕...");
    alert("导出字幕功能待实现！");
  };

  const handleAdjustStyles = () => {
    // TODO: 实现样式调整界面
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
