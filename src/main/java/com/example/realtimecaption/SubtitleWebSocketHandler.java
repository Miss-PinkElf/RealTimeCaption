package com.example.realtimecaption;

import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.client5.http.entity.mime.ByteArrayBody;
import org.apache.hc.client5.http.entity.mime.MultipartEntityBuilder;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.apache.hc.core5.http.HttpEntity;
import org.apache.hc.core5.http.io.entity.EntityUtils;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Component
public class SubtitleWebSocketHandler extends AbstractWebSocketHandler {

    // 从 application.properties 注入 Whisper API 的 URL
    @Value("${whisper.api.url}")
    private String whisperApiUrl;

    // 线程安全的Map，用于存储每个客户端的音频缓冲区和说话状态
    private final Map<String, ByteArrayOutputStream> audioBuffers = new ConcurrentHashMap<>();
    private final Map<String, Boolean> speakingState = new ConcurrentHashMap<>();
    // 使用线程池异步发送HTTP请求，避免阻塞WebSocket线程
    private final ExecutorService executorService = Executors.newCachedThreadPool();

    // --- 音频处理常量 ---
    private static final double SILENCE_THRESHOLD = 200.0; // 静音判断阈值 (VAD)
    private static final int SAMPLE_RATE = 16000;          // 采样率 (Hz)，与前端和Whisper模型匹配
    private static final short NUM_CHANNELS = 1;           // 单声道
    private static final short BITS_PER_SAMPLE = 16;       // 16位PCM
    private static final int BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
    private static final int MIN_AUDIO_MS = 500;           // 有效音频的最小毫秒数
    private static final int MAX_BUFFER_SECONDS = 1;       // 缓冲区的最大秒数，防止无限增长
    private static final int MAX_BUFFER_BYTES = MAX_BUFFER_SECONDS * SAMPLE_RATE * BYTES_PER_SAMPLE;
    private static final int MIN_BUFFER_BYTES = MIN_AUDIO_MS * (SAMPLE_RATE / 1000) * BYTES_PER_SAMPLE;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        System.out.println("客户端连接成功: " + session.getId());
        audioBuffers.put(session.getId(), new ByteArrayOutputStream());
        speakingState.put(session.getId(), false);
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) throws IOException {
        byte[] payload = message.getPayload().array();
        ByteArrayOutputStream buffer = audioBuffers.get(session.getId());
        if (buffer == null) return;

        boolean isSilent = isSilent(payload);
        boolean wasSpeaking = speakingState.getOrDefault(session.getId(), false);

        if (!isSilent) { // 如果正在说话
            speakingState.put(session.getId(), true);
            buffer.write(payload); // 将音频数据写入缓冲区

            // 如果缓冲区过大，强制发送
            if (buffer.size() > MAX_BUFFER_BYTES) {
                System.out.println("DEBUG: 缓冲区超限，强制发送。");
                sendBufferAndReset(session, buffer);
            }
        } else { // 如果检测到静音
            if (wasSpeaking) { // 并且之前正在说话，说明一句话结束
                System.out.println("DEBUG: 检测到静音，发送音频。");
                sendBufferAndReset(session, buffer);
            }
        }
    }

    private void sendBufferAndReset(WebSocketSession session, ByteArrayOutputStream buffer) {
        if (buffer.size() > MIN_BUFFER_BYTES) {
            byte[] audioData = buffer.toByteArray();
            // 异步提交识别任务
            executorService.submit(() -> transcribeAndSend(session, audioData));
        } else {
            System.out.println("DEBUG: 音频数据太短，已丢弃。");
        }
        buffer.reset(); // 重置缓冲区
        speakingState.put(session.getId(), false); // 更新说话状态
    }


    private void transcribeAndSend(WebSocketSession session, byte[] pcmData) {
        if (pcmData.length == 0 || !session.isOpen()) return;

        byte[] wavData;
        try {
            // 将裸PCM数据加上WAV头，打包成一个完整的WAV文件字节流
            wavData = createWavFile(pcmData);
            System.out.println("正在为会话 " + session.getId() + " 发送 " + wavData.length + " 字节的WAV数据");
        } catch (IOException e) {
            System.err.println("创建WAV头失败: " + e.getMessage());
            return;
        }

        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpPost post = new HttpPost(whisperApiUrl);
            HttpEntity multipartEntity = MultipartEntityBuilder.create()
                    .addPart("file", new ByteArrayBody(wavData, "audio.wav")) // 将WAV数据作为文件上传
                    .build();
            post.setEntity(multipartEntity);

            // 执行请求并处理响应
            httpClient.execute(post, response -> {
                String responseBody = EntityUtils.toString(response.getEntity());
                if (response.getCode() == 200) {
                    JSONObject jsonResponse = new JSONObject(responseBody);
                    String transcribedText = jsonResponse.optString("text", "").trim();
                    if (!transcribedText.isEmpty()) {
                        System.out.println("收到识别文本: " + transcribedText);
                        // 将识别结果通过WebSocket发回前端
                        sendJsonText(session, transcribedText);
                    }
                } else {
                    System.err.println("Whisper API 错误: " + response.getCode() + " - " + responseBody);
                }
                return null;
            });

        } catch (Exception e) {
            System.err.println("调用 Whisper API 失败: " + e.getMessage());
        }
    }

    /**
     * 将裸的PCM数据包装成一个完整的WAV格式的字节数组。
     * @param pcmData 原始的PCM音频数据
     * @return 包含WAV头的完整WAV文件数据
     * @throws IOException IO异常
     */
    private byte[] createWavFile(byte[] pcmData) throws IOException {
        int totalAudioLen = pcmData.length;
        int totalDataLen = totalAudioLen + 36;
        long byteRate = (long) SAMPLE_RATE * NUM_CHANNELS * BITS_PER_SAMPLE / 8;

        ByteBuffer headerBuffer = ByteBuffer.allocate(44);
        headerBuffer.order(ByteOrder.LITTLE_ENDIAN); // WAV文件使用小端字节序

        headerBuffer.put("RIFF".getBytes());
        headerBuffer.putInt(totalDataLen);
        headerBuffer.put("WAVE".getBytes());
        headerBuffer.put("fmt ".getBytes());
        headerBuffer.putInt(16); // PCM format chunk size
        headerBuffer.putShort((short) 1); // AudioFormat (1 for PCM)
        headerBuffer.putShort(NUM_CHANNELS);
        headerBuffer.putInt(SAMPLE_RATE);
        headerBuffer.putInt((int) byteRate);
        headerBuffer.putShort((short) (NUM_CHANNELS * BYTES_PER_SAMPLE)); // blockAlign
        headerBuffer.putShort(BITS_PER_SAMPLE);
        headerBuffer.put("data".getBytes());
        headerBuffer.putInt(totalAudioLen);

        ByteArrayOutputStream wavOutputStream = new ByteArrayOutputStream();
        wavOutputStream.write(headerBuffer.array());
        wavOutputStream.write(pcmData);

        return wavOutputStream.toByteArray();
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        System.out.println("客户端断开连接: " + session.getId());
        ByteArrayOutputStream buffer = audioBuffers.get(session.getId());
        if (buffer != null && buffer.size() > MIN_BUFFER_BYTES) {
            // 连接关闭时，如果仍有未发送的有效音频，则进行最后一次发送
            sendBufferAndReset(session, buffer);
        }
        audioBuffers.remove(session.getId());
        speakingState.remove(session.getId());
    }

    private boolean isSilent(byte[] payload) {
        if (payload == null || payload.length == 0) return true;
        long sumOfSquares = 0;
        for (int i = 0; i < payload.length; i += 2) {
            if (i + 1 >= payload.length) break;
            short sample = (short) ((payload[i + 1] << 8) | (payload[i] & 0xFF));
            sumOfSquares += (long) sample * sample;
        }
        double rms = Math.sqrt((double) sumOfSquares / (payload.length / 2.0));
        return rms < SILENCE_THRESHOLD;
    }

    private void sendJsonText(WebSocketSession session, String text) throws IOException {
        if (!session.isOpen() || text.trim().isEmpty()) return;
        JSONObject response = new JSONObject();
        response.put("text", text);
        session.sendMessage(new TextMessage(response.toString()));
        System.out.println("发送字幕到客户端: " + text);
    }
}