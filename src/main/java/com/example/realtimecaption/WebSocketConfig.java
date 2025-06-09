package com.example.realtimecaption;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    @Autowired
    private final SubtitleWebSocketHandler subtitleWebSocketHandler;

    public WebSocketConfig(SubtitleWebSocketHandler subtitleWebSocketHandler) {
        this.subtitleWebSocketHandler = subtitleWebSocketHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // 将处理器注册到 "/audio" 路径，与前端JS代码中的地址对应
        registry.addHandler(subtitleWebSocketHandler, "/audio")
                .setAllowedOrigins("*"); // 允许所有来源的连接（开发时方便）
    }
}