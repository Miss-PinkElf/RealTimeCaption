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

  // --- 删除：不再需要 downloadLink state 和 BACKEND_DOWNLOAD_BASE_URL ---

  const handleFileSelect = async () => {
    setUploadStatus("正在等待选择文件...");
    setLoading(false);

    // 通过 Electron IPC 调用主进程的文件选择对话框
    const filePath = await window.electronAPI.openFileDialog();
    if (filePath) {
      console.log("Selected file:", filePath);
      setUploadStatus(`已选择文件：${filePath}`);
      setLoading(true); // 开始加载

      try {
        // 通过 Electron IPC 调用主进程读取文件内容为 Blob
        const fileBlob = await window.electronAPI.readFileAsBlob(filePath);
        if (!fileBlob) {
          throw new Error("读取文件失败。");
        }

        const formData = new FormData();
        formData.append("file", fileBlob, filePath.split(/[\/\\]/).pop());

        setUploadStatus("文件正在上传并生成字幕，请稍候...");

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
        } else {
          setUploadStatus("取消保存字幕文件。");
        }
      } catch (error) {
        setUploadStatus(`处理失败: ${error.message}`);
        console.error("文件上传或处理错误:", error);
      } finally {
        setLoading(false); // 无论成功与否，最后都停止加载
      }
    } else {
      setUploadStatus("未选择文件。");
    }
  };

  // --- 删除：不再需要独立的 downloadSrtFile 函数 ---

  return (
    <div>
      <button
        onClick={handleFileSelect}
        title="上传文件生成字幕"
        disabled={loading}
      >
        <VscCloudUpload />
        {loading ? " (处理中...)" : " 上传并生成字幕"}
      </button>
      <p>{uploadStatus}</p>

      {/* --- 修改：UI简化，移除下载按钮相关的部分 --- */}
    </div>
  );
};

export default FileUploadButton;
