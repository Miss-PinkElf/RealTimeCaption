// src/App.js
import React, { useState, useCallback, useEffect, useRef } from "react";
import "./App.css";
import {
  VscSettingsGear,
  VscChromeMinimize,
  VscChromeClose,
} from "react-icons/vsc";
import { start, stop } from "./capturer";
import SettingsModal from "./components/SettingsModal";
import FileUploadButton from "./components/FileUploadButton"; // 引入 FileUploadButton 组件
import AudioSourceToggleButton from "./components/AudioSourceToggleButton"; // 引入 AudioSourceToggleButton 组件

const originalSize = { width: 800, height: 120 };
const settingsOpenSize = { width: 800, height: 550 };

function App() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [subtitles, setSubtitles] = useState("双击此处开始/停止识别");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [exportPath, setExportPath] = useState(null); // 字幕文件导出路径

  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const fadeOutTimer = useRef(null);
  const [audioSource, setAudioSource] = useState("desktop"); // 新增音频源状态

  const handleMouseEnter = () => {
    clearTimeout(fadeOutTimer.current);
    setIsPanelVisible(true);
  };

  const handleMouseLeave = () => {
    fadeOutTimer.current = setTimeout(() => {
      setIsPanelVisible(false);
    }, 1300);
  };

  useEffect(() => {
    if (isSettingsOpen) {
      window.electronAPI.resizeWindow(settingsOpenSize);
    } else {
      window.electronAPI.resizeWindow(originalSize);
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    // 应用启动时从 localStorage 加载导出路径
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
    if (isSettingsOpen) return; // 如果设置面板打开，则禁用双击操作
    const nextState = !isCapturing;
    setIsCapturing(nextState);

    if (nextState) {
      setSubtitles("正在获取音频设备...");
      start({
        onSubtitle: handleSubtitleUpdate,
        onError: handleCaptureError,
        audioSource: audioSource, // 传递当前的音频源给 capturer.js
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

  const handleToggleAudioSource = () => {
    const newSource = audioSource === "desktop" ? "microphone" : "desktop";
    setAudioSource(newSource);
    // 如果正在捕获，则重启捕获以切换音频源
    if (isCapturing) {
      stop(); // 停止当前捕获
      setSubtitles(
        `切换到${newSource === "desktop" ? "桌面音频" : "麦克风"}并重启识别...`
      );
      // 延迟一小段时间再开始，确保停止操作完成
      setTimeout(() => {
        start({
          onSubtitle: handleSubtitleUpdate,
          onError: handleCaptureError,
          audioSource: newSource,
        });
      }, 100); // 100ms 延迟
    }
  };

  return (
    <div
      className={`App ${isPanelVisible ? "panel-visible" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleStartStop}
      title="在字幕区域双击可开始/停止识别"
    >
      {/* 顶部控制区域 */}
      <div className="top-controls-area" style={{ WebkitAppRegion: "drag" }}>
        {" "}
        {/* 使整个顶部区域可拖拽 */}
        <div
          style={{ WebkitAppRegion: "no-drag", display: "flex", gap: "8px" }}
        >
          {" "}
          {/* 按钮区域不可拖拽 */}
          <FileUploadButton exportPath={exportPath} /> {/* 传递 exportPath */}
          <AudioSourceToggleButton
            audioSource={audioSource}
            onToggle={handleToggleAudioSource}
          />
          <button onClick={handleToggleSettings} title="设置">
            <VscSettingsGear />
          </button>
        </div>
        <div
          style={{ WebkitAppRegion: "no-drag", display: "flex", gap: "8px" }}
        >
          {" "}
          {/* 窗口控制按钮区域不可拖拽 */}
          <button onClick={handleMinimize} title="最小化">
            <VscChromeMinimize />
          </button>
          <button onClick={handleClose} title="关闭">
            <VscChromeClose />
          </button>
        </div>
      </div>

      {/* 字幕显示区域 */}
      <div
        className="subtitle-display-area"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        {" "}
        {/* 字幕区域不可拖拽 */}
        <p className="subtitle-text">{subtitles}</p>
      </div>

      {/* 设置面板 */}
      {isSettingsOpen && (
        <>
          <div className="modal-overlay" onClick={handleToggleSettings} />{" "}
          {/* 点击 overlay 也可以关闭 */}
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
