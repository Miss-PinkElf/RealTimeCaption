//package com.example.realtimecaption;
//
//import org.springframework.beans.factory.annotation.Value;
//import org.springframework.context.annotation.Bean;
//import org.springframework.context.annotation.Configuration;
////import org.vosk.Model;
//
//import java.io.IOException;
//
////@Configuration
//public class AppConfig {
//
//    @Value("${vosk.model.path}")
//    private String modelPath;
//
//   // @Bean
//    public Model voskModel() throws IOException {
//        // Model会占用大量内存，通过@Bean注解使其在应用中只加载一次
//        System.out.println("Loading Vosk model from: " + modelPath);
//        Model model = new Model(modelPath);
//        System.out.println("Vosk model loaded successfully.");
//        return model;
//    }
//}