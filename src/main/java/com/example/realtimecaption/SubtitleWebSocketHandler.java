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

    // 通过构造函数注入Vosk Model单例
    public SubtitleWebSocketHandler(Model model) {
        this.model = model;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        System.out.println("Client connected: " + session.getId());
        // 为每个连接创建一个新的识别器实例
        // 16000 是音频采样率，请确保与前端发送的音频格式一致
        Recognizer recognizer = new Recognizer(model, 16000.0f);
        recognizer.setWords(true); // 如果需要词语时间戳可以开启
        recognizers.put(session.getId(), recognizer);
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession session, BinaryMessage message) throws IOException {
        Recognizer recognizer = recognizers.get(session.getId());
        if (recognizer == null) {
            return;
        }

        byte[] payload = message.getPayload().array();

        // 将音频数据流送入识别器
        if (recognizer.acceptWaveForm(payload, payload.length)) {
            // 返回最终识别结果
            String result = recognizer.getResult();
            sendSubtitle(session, result);
        } else {
            // 返回中间识别结果
            String partialResult = recognizer.getPartialResult();
            sendSubtitle(session, partialResult);
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        System.out.println("Client disconnected: " + session.getId());
        // 连接关闭时，释放识别器资源
        Recognizer recognizer = recognizers.remove(session.getId());
        if (recognizer != null) {
            recognizer.close();
        }
    }

    /**
     * 解析识别结果并发送字幕
     */
    private void sendSubtitle(WebSocketSession session, String voskResult) throws IOException {
        if (voskResult != null && !voskResult.isEmpty()) {
            JSONObject json = new JSONObject(voskResult);
            // 我们只取 "text" 或 "partial" 字段
            String text = json.optString("text", json.optString("partial", ""));

            if (!text.trim().isEmpty() && session.isOpen()) {
                // 将字幕包装成JSON格式发送给前端
                JSONObject response = new JSONObject();
                response.put("text", text);
                session.sendMessage(new TextMessage(response.toString()));
                System.out.println("Sent subtitle: " + text);
            }
        }
    }
}