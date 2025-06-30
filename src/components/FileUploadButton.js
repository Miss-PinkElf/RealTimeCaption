// src/components/FileUploadButton.js
import React, { useState } from "react";
import { VscCloudUpload } from "react-icons/vsc";

// --- 新增：一个辅助函数，用于从 Content-Disposition 头中解析文件名 ---
const getFilenameFromHeader = (header) => {
  if (!header) return null;
  const match = header.match(/filename="?([^"]+)"?/);
  return match ? match[1] : null;
};

const FileUploadButton = ({ exportPath }) => {
  // 接收 exportPath prop
  const [uploadStatus, setUploadStatus] = useState("");
  const [loading, setLoading] = useState(false);

  // --- 修改：后端接口地址现在只需要上传的 URL ---
  const BACKEND_UPLOAD_URL = "http://localhost:8000/upload-and-transcribe/"; // 确保末尾有斜杠

  const handleFileSelect = async () => {
    // **核心修改1：在每次文件选择操作开始时，清空之前的状态信息**
    setUploadStatus(""); // 清空之前的上传状态文字
    setLoading(false); // 确保loading状态在选择前是false

    // 通过 Electron IPC 调用主进程的文件选择对话框
    const filePath = await window.electronAPI.openFileDialog();
    if (filePath) {
      console.log("Selected file:", filePath);
      setUploadStatus(
        `已选择文件：${filePath.split(/[\/\\]/).pop()}，正在准备上传...`
      ); // 显示选中的文件名
      setLoading(true); // 开始加载，按钮变为“处理中...”

      try {
        // 通过 Electron IPC 调用主进程读取文件内容为 Blob
        const fileBlob = await window.electronAPI.readFileAsBlob(filePath);
        if (!fileBlob) {
          throw new Error("读取文件失败。");
        }

        const formData = new FormData();
        formData.append("file", fileBlob, filePath.split(/[\/\\]/).pop());

        setUploadStatus("文件正在上传并生成字幕，请稍候..."); // 更新状态提示用户正在上传和处理

        // --- 核心修改：调整 fetch 的响应处理逻辑 ---
        const response = await fetch(BACKEND_UPLOAD_URL, {
          method: "POST",
          body: formData,
        });

        // 如果响应不成功，尝试解析JSON获取错误信息
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            `上传失败: ${errorData.detail || response.statusText}`
          );
        }

        // 如果响应成功，后端直接返回了文件流
        setUploadStatus("字幕生成成功！正在准备下载...");

        // 1. 从响应头获取服务器建议的文件名
        const contentDisposition = response.headers.get("content-disposition");
        const filename =
          getFilenameFromHeader(contentDisposition) || "subtitle.srt";

        // 2. 将响应体作为文本（SRT内容）读取
        const srtContent = await response.text();

        // 3. 立即调用 Electron 的保存对话框
        const savedPath = await window.electronAPI.saveFileDialog(
          filename,
          srtContent,
          exportPath // 使用从 App.js 传递的默认路径
        );

        if (savedPath) {
          setUploadStatus(`字幕文件已成功保存到：${savedPath}`);
          // 可以在这里设置一个短暂的计时器，然后清空 uploadStatus
          setTimeout(() => setUploadStatus(""), 5000);
        } else {
          setUploadStatus("取消保存字幕文件。");
          setTimeout(() => setUploadStatus(""), 3000); // 稍后清空
        }
      } catch (error) {
        setUploadStatus(`处理失败: ${error.message}`);
        console.error("文件上传或处理错误:", error);
        // 错误信息也应该短暂显示后消失
        setTimeout(() => setUploadStatus(""), 5000);
      } finally {
        setLoading(false); // 无论成功与否，最后都停止加载
      }
    } else {
      setUploadStatus("未选择文件。"); // 如果用户取消文件选择，显示此信息
      setTimeout(() => setUploadStatus(""), 2000); // 稍后清空
    }
  };

  return (
    <div>
      <button
        onClick={handleFileSelect}
        title="上传文件生成字幕"
        disabled={loading} // 正在加载时禁用按钮
      >
        <VscCloudUpload />
        {loading ? " " : " "}
      </button>
      {/* **核心修改2：只有当 uploadStatus 不为空时才显示文本** */}
      {uploadStatus && (
        <p style={{ fontSize: "12px", color: "#ccc", margin: "5px 0 0 0" }}>
          {uploadStatus}
        </p>
      )}
    </div>
  );
};

export default FileUploadButton;
