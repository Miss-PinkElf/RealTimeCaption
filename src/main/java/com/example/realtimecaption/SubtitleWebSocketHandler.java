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

    @Value("${whisper.api.url}")
    private String whisperApiUrl;

    private final Map<String, ByteArrayOutputStream> audioBuffers = new ConcurrentHashMap<>();
    private final Map<String, Boolean> speakingState = new ConcurrentHashMap<>();
    private final ExecutorService executorService = Executors.newCachedThreadPool();

    private static final double SILENCE_THRESHOLD = 200.0;
    private static final int SAMPLE_RATE = 16000;
    private static final short NUM_CHANNELS = 1; // 单声道
    private static final short BITS_PER_SAMPLE = 16; // 16位
    private static final int BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
    private static final int MIN_AUDIO_MS = 500;
    private static final int MAX_BUFFER_SECONDS = 5;
    private static final int MAX_BUFFER_BYTES = MAX_BUFFER_SECONDS * SAMPLE_RATE * BYTES_PER_SAMPLE;
    private static final int MIN_BUFFER_BYTES = MIN_AUDIO_MS * (SAMPLE_RATE / 1000) * BYTES_PER_SAMPLE;

    // ... afterConnectionEstablished, handleBinaryMessage, sendBufferAndReset 方法无变化 ...
    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        System.out.println("Client connected: " + session.getId());
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

        if (!isSilent) {
            speakingState.put(session.getId(), true);
            buffer.write(payload);

            if (buffer.size() > MAX_BUFFER_BYTES) {
                System.out.println("DEBUG: Buffer size (" + buffer.size() + " bytes) exceeded limit. Force sending.");
                sendBufferAndReset(session, buffer);
            }
        } else {
            if (wasSpeaking) {
                System.out.println("DEBUG: Silence detected. Sending audio.");
                sendBufferAndReset(session, buffer);
            }
        }
    }

    private void sendBufferAndReset(WebSocketSession session, ByteArrayOutputStream buffer) {
        if (buffer.size() > MIN_BUFFER_BYTES) {
            byte[] audioData = buffer.toByteArray();
            executorService.submit(() -> transcribeAndSend(session, audioData));
        } else {
            System.out.println("DEBUG: Audio buffer too small (" + buffer.size() + " bytes), discarding.");
        }
        buffer.reset();
        speakingState.put(session.getId(), false);
    }


    private void transcribeAndSend(WebSocketSession session, byte[] pcmData) {
        if (pcmData.length == 0 || !session.isOpen()) return;

        // --- (核心修改) ---
        // 在发送前，为裸PCM数据添加WAV头，构成一个完整的WAV文件
        byte[] wavData;
        try {
            wavData = createWavFile(pcmData);
            System.out.println("Sending " + wavData.length + " bytes of WAV data to Python service for session " + session.getId());
        } catch (IOException e) {
            System.err.println("Failed to create WAV header: " + e.getMessage());
            return;
        }

        try (CloseableHttpClient httpClient = HttpClients.createDefault()) {
            HttpPost post = new HttpPost(whisperApiUrl);
            HttpEntity multipartEntity = MultipartEntityBuilder.create()
                    .addPart("audio", new ByteArrayBody(wavData, "audio.wav"))
                    .build();
            post.setEntity(multipartEntity);

            httpClient.execute(post, response -> {
                String responseBody = EntityUtils.toString(response.getEntity());
                if (response.getCode() == 200) {
                    JSONObject jsonResponse = new JSONObject(responseBody);
                    String transcribedText = jsonResponse.optString("text", "").trim();
                    if (!transcribedText.isEmpty()) {
                        System.out.println("Received text: " + transcribedText);
                        sendJsonText(session, transcribedText);
                    }
                } else {
                    System.err.println("Error from Whisper API: " + response.getCode() + " - " + responseBody);
                }
                return null;
            });

        } catch (Exception e) {
            System.err.println("Failed to call Whisper API: " + e.getMessage());
        }
    }

    /**
     * **(新增)**
     * 将裸的PCM数据包装成一个完整的WAV格式的字节数组。
     * @param pcmData 原始的PCM音频数据
     * @return 包含WAV头的完整WAV文件数据
     * @throws IOException
     */
    private byte[] createWavFile(byte[] pcmData) throws IOException {
        int totalAudioLen = pcmData.length;
        int totalDataLen = totalAudioLen + 36; // 36是WAV头中除了RIFF id和size以及data id和size之外的部分
        long byteRate = (long) SAMPLE_RATE * NUM_CHANNELS * BITS_PER_SAMPLE / 8;

        ByteBuffer headerBuffer = ByteBuffer.allocate(44);
        headerBuffer.order(ByteOrder.LITTLE_ENDIAN); // WAV标准使用小端字节序

        headerBuffer.put("RIFF".getBytes());
        headerBuffer.putInt(totalDataLen);
        headerBuffer.put("WAVE".getBytes());
        headerBuffer.put("fmt ".getBytes());
        headerBuffer.putInt(16); // Subchunk1Size for PCM
        headerBuffer.putShort((short) 1); // AudioFormat (1 for PCM)
        headerBuffer.putShort(NUM_CHANNELS);
        headerBuffer.putInt(SAMPLE_RATE);
        headerBuffer.putInt((int) byteRate);
        headerBuffer.putShort((short) (NUM_CHANNELS * BYTES_PER_SAMPLE)); // blockAlign
        headerBuffer.putShort(BITS_PER_SAMPLE);
        headerBuffer.put("data".getBytes());
        headerBuffer.putInt(totalAudioLen);

        // 将WAV头和PCM数据合并成一个字节数组
        ByteArrayOutputStream wavOutputStream = new ByteArrayOutputStream();
        wavOutputStream.write(headerBuffer.array());
        wavOutputStream.write(pcmData);

        return wavOutputStream.toByteArray();
    }


    // ... afterConnectionClosed, isSilent, sendJsonText 方法无变化 ...
    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        System.out.println("Client disconnected: " + session.getId());
        ByteArrayOutputStream buffer = audioBuffers.get(session.getId());
        if (buffer != null && buffer.size() > 0) {
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
        System.out.println("Sent subtitle chunk to client: " + text);
    }
}