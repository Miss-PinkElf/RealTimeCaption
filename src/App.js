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
import FileUploadButton from "./components/FileUploadButton";
import AudioSourceToggleButton from "./components/AudioSourceToggleButton";

const originalSize = { width: 800, height: 120 };
const settingsOpenSize = { width: 800, height: 600 };

function App() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [subtitles, setSubtitles] = useState("双击此处开始/停止识别");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [exportPath, setExportPath] = useState(null);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const fadeOutTimer = useRef(null);
  const [audioSource, setAudioSource] = useState("desktop");

  // 状态：local 代表本地 Whisper, cloud 代表云端 API
  const [engine, setEngine] = useState("local");

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
    const savedPath = localStorage.getItem("exportPath");
    if (savedPath) {
      setExportPath(savedPath);
    }
    const savedEngine = localStorage.getItem("recognitionEngine");
    if (savedEngine) {
      setEngine(savedEngine);
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
      setSubtitles("正在连接服务...");
      start({
        onSubtitle: handleSubtitleUpdate,
        onError: handleCaptureError,
        audioSource: audioSource,
        engine: engine,
      });
    } else {
      stop();
      setSubtitles("字幕已停止");
    }
  };

  const handleToggleAudioSource = () => {
    const newSource = audioSource === "desktop" ? "microphone" : "desktop";
    setAudioSource(newSource);
    if (isCapturing) {
      stop();
      setSubtitles(
        `切换到${newSource === "desktop" ? "桌面音频" : "麦克风"}并重启...`
      );
      setTimeout(() => {
        start({
          onSubtitle: handleSubtitleUpdate,
          onError: handleCaptureError,
          audioSource: newSource,
          engine: engine,
        });
      }, 100);
    }
  };

  const handleMinimize = () => window.electronAPI.minimizeWindow();
  const handleClose = () => window.electronAPI.closeWindow();
  const handleToggleSettings = () => setIsSettingsOpen(!isSettingsOpen);

  return (
    <div
      className={`App ${isPanelVisible ? "panel-visible" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleStartStop}
      title="在字幕区域双击可开始/停止识别"
    >
      <div className="top-controls-area" style={{ WebkitAppRegion: "drag" }}>
        <div
          style={{ WebkitAppRegion: "no-drag", display: "flex", gap: "8px" }}
        >
          <FileUploadButton exportPath={exportPath} />
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
          <button onClick={handleMinimize} title="最小化">
            <VscChromeMinimize />
          </button>
          <button onClick={handleClose} title="关闭">
            <VscChromeClose />
          </button>
        </div>
      </div>

      <div
        className="subtitle-display-area"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        <p className="subtitle-text">{subtitles}</p>
      </div>

      {isSettingsOpen && (
        <>
          <div className="modal-overlay" onClick={handleToggleSettings} />
          <div className="settings-modal-container">
            <SettingsModal
              onClose={handleToggleSettings}
              exportPath={exportPath}
              setExportPath={setExportPath}
              engine={engine}
              setEngine={setEngine}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
