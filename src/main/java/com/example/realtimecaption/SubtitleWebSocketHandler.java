package com.example.realtimecaption;

import org.json.JSONObject;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.BinaryMessage;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.AbstractWebSocketHandler;
import org.vosk.Model;
import org.vosk.Recognizer;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SubtitleWebSocketHandler extends AbstractWebSocketHandler {

    private final Model model;
    private final Map<String, Recognizer> recognizers = new ConcurrentHashMap<>();
    private final Map<String, Boolean> speakingState = new ConcurrentHashMap<>();

    private static final int MAX_LINE_LENGTH = 30;

    /**
     * 静音阈值，用于判断音频是否为静音。这是一个关键的可调参数。
     * - 如果你说话的停顿没有被识别成句尾，可以尝试【调高】此值，比如 250.0 或 300.0。
     * - 如果你一句话还没说完，中间的短暂喘息就被识别成句尾，可以尝试【调低】此值，比如 150.0 或 100.0。
     */
    private static final double SILENCE_THRESHOLD = 200.0;

    public SubtitleWebSocketHandler(Model model) {
        this.model = model;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        System.out.println("Client connected: " + session.getId());
        Recognizer recognizer = new Recognizer(model, 16000.0f);
        recognizers.put(session.getId(), recognizer);
        speakingState.put(session.getId(), false);
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) throws IOException {
        Recognizer recognizer = recognizers.get(session.getId());
        if (recognizer == null) return;

        byte[] payload = message.getPayload().array();
        boolean isSilent = isSilent(payload);
        boolean wasSpeaking = speakingState.getOrDefault(session.getId(), false);

        if (!isSilent) {
            // 用户正在说话
            speakingState.put(session.getId(), true);

            // 持续将音频喂给识别器，忽略 acceptWaveForm 的返回值
            recognizer.acceptWaveForm(payload, payload.length);

            // 只获取并发送【中间结果】，用于实时反馈，不进行切分
            String partialResult = recognizer.getPartialResult();
            sendText(session, partialResult, false);

        } else if (wasSpeaking) {
            // 用户刚刚停止说话 (从说话状态变到静音状态)
            speakingState.put(session.getId(), false);

            // 这是获取带标点最终结果的【唯一时机】
            String finalResult = recognizer.getFinalResult();

            // 对这个最终结果进行切分
            sendText(session, finalResult, true);
        }
        // 如果之前和现在都是静音，则什么都不做
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws IOException {
        System.out.println("Client disconnected: " + session.getId());
        Recognizer recognizer = recognizers.get(session.getId());
        if(recognizer != null){
            String finalResult = recognizer.getFinalResult();
            sendText(session, finalResult, true);
            recognizer.close();
        }
        recognizers.remove(session.getId());
        speakingState.remove(session.getId());
    }

    private boolean isSilent(byte[] payload) {
        if (payload == null || payload.length == 0) return true;
        long sumOfSquares = 0;
        // 16-bit PCM, so 2 bytes per sample
        for (int i = 0; i < payload.length; i += 2) {
            if (i + 1 >= payload.length) break;
            short sample = (short) ((payload[i + 1] << 8) | (payload[i] & 0xFF));
            sumOfSquares += (long) sample * sample;
        }
        double rms = Math.sqrt((double) sumOfSquares / (payload.length / 2.0));
        return rms < SILENCE_THRESHOLD;
    }

    /**
     * 发送文本的总入口
     * @param voskResult Vosk返回的JSON字符串
     * @param isFinal    是否为需要切分的最终结果
     */
    private void sendText(WebSocketSession session, String voskResult, boolean isFinal) throws IOException {
        if (voskResult == null || voskResult.isEmpty() || !session.isOpen()) return;

        JSONObject json = new JSONObject(voskResult);
        String text = json.optString("text", json.optString("partial", ""));

        if (text.trim().isEmpty()) return;

        if (isFinal) {
            System.out.println("Final Result to split: " + text);
            splitAndSendText(session, text);
        } else {
            System.out.println("Partial Result: " + text);
            sendJsonText(session, text);
        }
    }

    private void splitAndSendText(WebSocketSession session, String text) throws IOException {
        if (text == null || text.trim().isEmpty()) return;
        if (text.length() <= MAX_LINE_LENGTH) {
            sendJsonText(session, text);
            return;
        }
        System.out.println("Splitting long text...");
        int currentPos = 0;
        while (currentPos < text.length()) {
            int searchEnd = Math.min(currentPos + MAX_LINE_LENGTH, text.length());
            int splitPos = -1;
            if (searchEnd == text.length()) {
                splitPos = text.length();
            } else {
                for (int i = searchEnd - 1; i > currentPos; i--) {
                    char ch = text.charAt(i);
                    if (ch == '，' || ch == '。' || ch == '！' || ch == '？' || ch == ',' || ch == '.' || ch == '!' || ch == '?') {
                        splitPos = i + 1;
                        break;
                    }
                }
            }
            if (splitPos == -1) {
                splitPos = searchEnd;
            }
            String chunk = text.substring(currentPos, splitPos);
            sendJsonText(session, chunk);
            currentPos = splitPos;
        }
    }

    private void sendJsonText(WebSocketSession session, String text) throws IOException {
        if (!session.isOpen() || text.trim().isEmpty()) return;
        JSONObject response = new JSONObject();
        response.put("text", text);
        session.sendMessage(new TextMessage(response.toString()));
        System.out.println("Sent subtitle chunk: " + text);
    }
}