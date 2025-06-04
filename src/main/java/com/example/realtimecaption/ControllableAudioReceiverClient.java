package com.example.realtimecaption;

import java.io.*;
import java.net.Socket;
import java.net.SocketException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Scanner;

public class ControllableAudioReceiverClient {

    private static final String SERVER_IP = "localhost"; // 或服务器IP地址
    private static final int SERVER_PORT = 12345;

    private static volatile boolean receivingAudio = false;
    private static Socket clientSocket;
    private static InputStream inputStream;
    private static DataInputStream dataInputStream;
    private static ByteArrayOutputStream audioBuffer;

    private static int actualSampleRate;
    private static int actualBitsPerSample;
    private static int actualChannels;

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        try {
            System.out.println("正在连接到服务器 " + SERVER_IP + ":" + SERVER_PORT + "...");
            clientSocket = new Socket(SERVER_IP, SERVER_PORT);
            inputStream = clientSocket.getInputStream();
            dataInputStream = new DataInputStream(inputStream);
            System.out.println("已连接到服务器。");

            // 1. 接收音频格式
            actualSampleRate = dataInputStream.readInt();
            actualBitsPerSample = dataInputStream.readShort();
            actualChannels = dataInputStream.readShort();

            System.out.printf("接收到的音频格式: %d Hz, %d 位, %d 声道\n",
                    actualSampleRate, actualBitsPerSample, actualChannels);

            audioBuffer = new ByteArrayOutputStream();
            receivingAudio = true;

            // 2. 启动音频接收线程
            Thread receiverThread = new Thread(() -> {
                byte[] buffer = new byte[4096];
                int bytesRead;
                long totalBytes = 0;
                System.out.println("音频接收线程已启动。");
                try {
                    while (receivingAudio && (bytesRead = inputStream.read(buffer)) != -1) {
                        audioBuffer.write(buffer, 0, bytesRead);
                        totalBytes += bytesRead;
                        // 可以选择性地在这里打印少量进度信息，但不要过于频繁
                        // if (totalBytes % (1024 * 100) == 0) { // e.g. every 100KB
                        //     System.out.printf("\r已接收: %.2f KB...", totalBytes / 1024.0);
                        // }
                    }
                } catch (SocketException se) {
                    if (receivingAudio) { // 如果不是主动停止导致的socket关闭
                        System.err.println("\n音频接收线程 Socket 错误: " + se.getMessage());
                    } else {
                        System.out.println("\n音频接收线程：Socket 已按预期关闭。");
                    }
                } catch (IOException e) {
                    if (receivingAudio) {
                        System.err.println("\n音频接收线程 IO 错误: " + e.getMessage());
                    }
                } finally {
                    receivingAudio = false; // 确保标志被设置
                    System.out.println("\n音频接收线程已结束。总共接收字节: " + totalBytes);
                }
            });
            receiverThread.start();

            // 3. 等待用户输入停止
            System.out.println("正在接收音频... 在此控制台按 Enter 键停止接收并保存文件。");
            scanner.nextLine(); // 等待用户按 Enter

            // 4. 停止接收并处理
            System.out.println("正在停止音频接收...");
            receivingAudio = false; // 通知接收线程停止

            if (clientSocket != null && !clientSocket.isClosed()) {
                try {
                    // 关闭 Socket 的输入流可以更有效地中断接收线程中的 read() 调用
                    if (!clientSocket.isInputShutdown()) clientSocket.shutdownInput();
                } catch (IOException e) {
                    System.err.println("关闭 Socket 输入流时出错: " + e.getMessage());
                }
            }

            // 等待接收线程结束
            try {
                receiverThread.join(5000); // 等待最多5秒
                if (receiverThread.isAlive()) {
                    System.out.println("接收线程超时，尝试中断。");
                    receiverThread.interrupt(); // 如果join超时，尝试中断
                    receiverThread.join(1000); // 再等1秒
                }
            } catch (InterruptedException e) {
                System.err.println("等待接收线程中断时发生错误: " + e.getMessage());
                Thread.currentThread().interrupt(); // 重新设置中断状态
            }


            // 5. 保存到文件
            byte[] receivedAudioData = audioBuffer.toByteArray();
            if (receivedAudioData.length > 0) {
                saveAudioToFile(receivedAudioData);
            } else {
                System.out.println("没有接收到音频数据，不创建文件。");
            }

        } catch (EOFException eofe) {
            System.err.println("与服务器的连接意外关闭 (可能在读取格式时): " + eofe.getMessage());
        } catch (IOException e) {
            System.err.println("客户端错误: " + e.getMessage());
            // e.printStackTrace(); // 用于调试
        } finally {
            System.out.println("正在关闭客户端资源...");
            try {
                if (dataInputStream != null) dataInputStream.close();
                if (inputStream != null) inputStream.close();
                if (clientSocket != null && !clientSocket.isClosed()) clientSocket.close();
                if (audioBuffer != null) audioBuffer.close();
                scanner.close();
            } catch (IOException e) {
                System.err.println("关闭资源时出错: " + e.getMessage());
            }
            System.out.println("客户端已关闭。");
        }
    }

    private static void saveAudioToFile(byte[] audioData) {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyyMMdd_HHmmss");
        String timestamp = sdf.format(new Date());
        String filename = String.format("received_audio_%s_%dHz_%dbit_%dch.raw",
                timestamp, actualSampleRate, actualBitsPerSample, actualChannels);

        try {
            Files.write(Paths.get(filename), audioData, StandardOpenOption.CREATE_NEW);
            System.out.println("音频已保存到: " + Paths.get(filename).toAbsolutePath());
            System.out.printf("文件参数: %d Hz, %d 位, %d 声道, PCM raw data.\n",
                    actualSampleRate, actualBitsPerSample, actualChannels);
            System.out.printf("您可以使用 Audacity 等软件导入此原始数据进行播放 (File > Import > Raw Data...)。\n");

        } catch (IOException e) {
            System.err.println("保存文件失败 '" + filename + "': " + e.getMessage());
        }
    }
}