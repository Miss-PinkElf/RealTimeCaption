"use client";
import { VscChromeClose } from "react-icons/vsc";

// 设置模态框样式
const settingsModalStyle = {
  // 尺寸和外观
  width: "90%",
  maxWidth: "600px",
  backgroundColor: "rgba(40, 42, 48, 0.95)",
  padding: "25px 35px",
  borderRadius: "12px",
  boxShadow: "0 8px 30px rgba(0, 0, 0, 0.3)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  color: "#e8e8e8",

  // 内部布局
  display: "flex",
  flexDirection: "column",
  textAlign: "left",

  // Electron 属性 - 确保模态框区域不可拖拽
  WebkitAppRegion: "no-drag",

  // 定位
  position: "relative",
  zIndex: 100,

  // 确保鼠标事件正常
  pointerEvents: "auto",
};

const closeIconStyle = {
  position: "absolute",
  top: "15px",
  right: "15px",
  background: "transparent",
  border: "none",
  color: "#888",
  fontSize: "22px",
  cursor: "pointer",
  padding: "5px",
  lineHeight: "1",
  transition: "color 0.2s ease, transform 0.2s ease",
  zIndex: 101,
  pointerEvents: "auto",
};

const formGroupStyle = {
  marginBottom: "20px",
};

const labelStyle = {
  display: "block",
  marginBottom: "8px",
  color: "#aaa",
  fontSize: "14px",
};

const pathDisplayStyle = {
  backgroundColor: "rgba(0,0,0,0.3)",
  padding: "10px 12px",
  borderRadius: "4px",
  fontSize: "14px",
  wordWrap: "break-word",
  color: "#d0d0d0",
};

const buttonStyle = {
  background: "rgba(255, 255, 255, 0.1)",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  color: "#f0f0f0",
  padding: "8px 15px",
  borderRadius: "5px",
  cursor: "pointer",
  transition: "background-color 0.2s ease, transform 0.2s ease",
  WebkitAppRegion: "no-drag", // 确保按钮不可拖拽
  pointerEvents: "auto",
};

const SettingsModal = ({ onClose, exportPath, setExportPath }) => {
  const handleSelectDir = async () => {
    const path = await window.electronAPI.selectDirectory();
    if (path) {
      setExportPath(path);
      localStorage.setItem("exportPath", path);
    }
  };

  return (
    <div style={settingsModalStyle}>
      {/* 关闭按钮 */}
      <button
        style={closeIconStyle}
        onClick={onClose}
        title="关闭"
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#fff";
          e.currentTarget.style.transform = "scale(1.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#888";
          e.currentTarget.style.transform = "scale(1.0)";
        }}
      >
        <VscChromeClose />
      </button>

      <h3
        style={{
          marginTop: 0,
          marginBottom: "30px",
          borderBottom: "1px solid #444",
          paddingBottom: "15px",
          fontSize: "18px",
        }}
      >
        应用设置
      </h3>

      <div style={formGroupStyle}>
        <label style={labelStyle}>字幕导出目录:</label>
        <p style={pathDisplayStyle}>{exportPath || "尚未设置"}</p>
        <button
          style={{ ...buttonStyle, marginTop: "10px" }}
          onClick={handleSelectDir}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          选择文件夹
        </button>
      </div>

      <div style={formGroupStyle}>
        <label style={labelStyle}>语音识别模式:</label>
        <select
          style={{
            ...buttonStyle,
            width: "100%",
            padding: "10px",
            pointerEvents: "auto",
          }}
        >
          <option value="local">本地 Whisper 模型</option>
          <option value="api" disabled>
            云端 API (待实现)
          </option>
        </select>
      </div>

      <div style={{ marginTop: "35px", textAlign: "right" }}>
        <button
          style={buttonStyle}
          onClick={onClose}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          关闭
        </button>
      </div>
    </div>
  );
};

export default SettingsModal;
