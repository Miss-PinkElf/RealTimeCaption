// src/components/FileUploadButton.js
import React, { useState } from "react";
import { VscCloudUpload } from "react-icons/vsc";

const FileUploadButton = ({ exportPath }) => {
  // 接收 exportPath prop
  const [uploadStatus, setUploadStatus] = useState("");
  const [downloadLink, setDownloadLink] = useState(null);
  const [loading, setLoading] = useState(false);

  // 后端文件上传和下载接口地址
  const BACKEND_UPLOAD_URL = "http://localhost:8000/upload/transcribe-file/";
  const BACKEND_DOWNLOAD_BASE_URL =
    "http://localhost:8000/upload/download-srt/";

  const handleFileSelect = async () => {
    setUploadStatus("正在等待选择文件...");
    setDownloadLink(null);
    setLoading(false); // 重置 loading 状态

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
          setUploadStatus("读取文件失败。");
          setLoading(false);
          return;
        }

        // 创建 FormData 对象以发送文件
        const formData = new FormData();
        // fileBlob 是文件的二进制内容，filePath.split('/').pop() 从路径中提取文件名
        formData.append("file", fileBlob, filePath.split(/[\/\\]/).pop()); // 兼容 Windows 和 Linux 路径分隔符

        setUploadStatus("文件正在上传并生成字幕，请稍候...");

        // 发送文件到后端 FastAPI 接口
        const response = await fetch(BACKEND_UPLOAD_URL, {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        setLoading(false); // 停止加载

        if (response.ok) {
          setUploadStatus(`上传成功！ ${data.message}`);
          if (data.srt_filename) {
            // 后端返回了字幕文件名，构建下载链接
            const srtDownloadUrl = `${BACKEND_DOWNLOAD_BASE_URL}${data.srt_filename}`;
            setDownloadLink({
              filename: data.srt_filename,
              url: srtDownloadUrl,
            });
          }
        } else {
          setUploadStatus(`上传失败: ${data.detail || "未知错误"}`);
          console.error("后端返回错误:", data);
        }
      } catch (error) {
        setUploadStatus(`处理失败: ${error.message}`);
        console.error("文件上传或处理错误:", error);
        setLoading(false);
      }
    } else {
      setUploadStatus("未选择文件。");
    }
  };

  const downloadSrtFile = async () => {
    if (!downloadLink) {
      alert("请等待字幕生成完成。");
      return;
    }

    setUploadStatus("正在下载字幕文件...");
    try {
      // 从后端下载 SRT 文件的内容
      const response = await fetch(downloadLink.url);
      if (!response.ok) {
        throw new Error(`下载失败: ${response.statusText}`);
      }
      const srtContent = await response.text(); // 获取 SRT 文本内容

      // 通过 Electron IPC 调用主进程保存文件对话框，并传入默认导出路径
      const savedPath = await window.electronAPI.saveFileDialog(
        downloadLink.filename,
        srtContent,
        exportPath // 将从 App.js 传递的 exportPath 作为默认保存路径
      );

      if (savedPath) {
        setUploadStatus(`字幕文件已成功保存到：${savedPath}`);
      } else {
        setUploadStatus("取消保存字幕文件。");
      }
    } catch (error) {
      setUploadStatus(`下载或保存失败: ${error.message}`);
      console.error("下载或保存 SRT 文件失败:", error);
    }
  };

  return (
    <div>
      <button
        onClick={handleFileSelect}
        title="上传文件生成字幕"
        disabled={loading}
      >
        <VscCloudUpload />
        {loading && " (处理中...)"}
      </button>
      <p>{uploadStatus}</p>
      {downloadLink && (
        <div>
          <button onClick={downloadSrtFile} disabled={loading}>
            下载字幕文件 ({downloadLink.filename})
          </button>
          <p>注意：字幕生成可能需要一些时间，如果下载失败请稍后重试。</p>
        </div>
      )}
    </div>
  );
};

export default FileUploadButton;
