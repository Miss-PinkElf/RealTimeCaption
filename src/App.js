// src/App.js
import React, { useState, useCallback, useEffect, useRef } from "react"; // 1. 引入 useRef
import "./App.css";
import {
  VscSettingsGear,
  VscChromeMinimize,
  VscChromeClose,
} from "react-icons/vsc";
import { start, stop } from "./capturer";
import SettingsModal from "./components/SettingsModal";

const originalSize = { width: 800, height: 120 };
const settingsOpenSize = { width: 800, height: 550 };

function App() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [subtitles, setSubtitles] = useState("双击此处开始/停止识别");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [exportPath, setExportPath] = useState(null);

  // --- (核心修改) ---
  // 2. 新增状态来控制面板（背景、按钮）的可见性
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  // 3. 使用 useRef 来存储定时器 ID，它能在组件重渲染之间保持不变
  const fadeOutTimer = useRef(null);

  // 4. 鼠标进入时的处理函数
  const handleMouseEnter = () => {
    // 清除任何可能存在的“淡出”定时器
    clearTimeout(fadeOutTimer.current);
    // 立即显示面板
    setIsPanelVisible(true);
  };

  // 5. 鼠标离开时的处理函数
  const handleMouseLeave = () => {
    // 设置一个 2 秒后执行的“淡出”定时器
    fadeOutTimer.current = setTimeout(() => {
      setIsPanelVisible(false);
    }, 1300); // 2000毫秒 = 2秒
  };
  // --- (修改结束) ---

  useEffect(() => {
    if (isSettingsOpen) {
      window.electronAPI.resizeWindow(settingsOpenSize);
    } else {
      window.electronAPI.resizeWindow(originalSize);
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    const savedPath = localStorage.getItem("exportPath");
    if (savedPath) {
      setExportPath(savedPath);
    }
  }, []);

  const handleCaptureError = useCallback((errorMsg) => {
    console.error("Capture Error:", errorMsg);
    setSubtitles(`错误: ${errorMsg}`);
    setIsCapturing(false);
  }, []);

  const handleSubtitleUpdate = useCallback((text) => {
    setSubtitles(text);
  }, []);

  const handleStartStop = () => {
    if (isSettingsOpen) return;
    const nextState = !isCapturing;
    setIsCapturing(nextState);

    if (nextState) {
      setSubtitles("正在获取音频设备...");
      start({
        onSubtitle: handleSubtitleUpdate,
        onError: handleCaptureError,
      });
    } else {
      stop();
      setSubtitles("字幕已停止");
    }
  };

  const handleMinimize = () => {
    window.electronAPI.minimizeWindow();
  };

  const handleClose = () => {
    window.electronAPI.closeWindow();
  };

  const handleToggleSettings = () => {
    setIsSettingsOpen(!isSettingsOpen);
  };

  return (
    <div
      // 6. (核心修改) 根据 isPanelVisible 状态动态添加CSS类，并绑定事件处理器
      className={`App ${isPanelVisible ? "panel-visible" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleStartStop}
      title="在字幕区域双击可开始/停止识别"
    >
      {/* 顶部控制区域 */}
      <div className="top-controls-area">
        <button onClick={handleToggleSettings} title="设置">
          <VscSettingsGear />
        </button>
        <button onClick={handleMinimize} title="最小化">
          <VscChromeMinimize />
        </button>
        <button onClick={handleClose} title="关闭">
          <VscChromeClose />
        </button>
      </div>

      {/* 字幕显示区域 */}
      <div className="subtitle-display-area">
        <p className="subtitle-text">{subtitles}</p>
      </div>

      {/* 设置面板 */}
      {isSettingsOpen && (
        <>
          <div className="modal-overlay" />
          <div className="settings-modal-container">
            <SettingsModal
              onClose={handleToggleSettings}
              exportPath={exportPath}
              setExportPath={setExportPath}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
