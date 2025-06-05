package com.example.realtimecaption;

import java.io.*;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Scanner;
import java.util.concurrent.atomic.AtomicBoolean;

public class AudioReceiveSave {

    private static final int PORT = 55555; // 与C++客户端匹配的端口
    private static final int EXPECTED_MAGIC_NUMBER = 0x4155444D; // "AUDM"
    private static final AtomicBoolean isRunning = new AtomicBoolean(true); // 控制服务器运行状态
    private static ServerSocket serverSocket;

    public static void main(String[] args) {
        // 启动一个线程来监听控制台输入，用于停止服务器
        Thread consoleListener = new Thread(() -> {
            Scanner scanner = new Scanner(System.in);
            System.out.println("Type 'stop' to shutdown the server.");
            while (true) {
                if (scanner.hasNextLine()) {
                    String command = scanner.nextLine();
                    if ("stop".equalsIgnoreCase(command)) {
                        System.out.println("Stop command received. Shutting down server...");
                        isRunning.set(false);
                        // 关闭ServerSocket以中断accept()阻塞 (如果在等待新连接)
                        if (serverSocket != null && !serverSocket.isClosed()) {
                            try {
                                serverSocket.close();
                            } catch (IOException e) {
                                System.err.println("Error closing server socket: " + e.getMessage());
                            }
                        }
                        break;
                    }
                }
            }
            scanner.close();
        });
        consoleListener.start();

        try {
            serverSocket = new ServerSocket(PORT);
            System.out.println("Audio server started on port " + PORT);

            while (isRunning.get()) {
                System.out.println("Waiting for a client connection...");
                Socket clientSocket = null;
                try {
                    clientSocket = serverSocket.accept(); // 阻塞直到有客户端连接
                    if (!isRunning.get()) { // 在accept后再次检查，因为ServerSocket可能因stop命令关闭
                        if(clientSocket != null) clientSocket.close();
                        break;
                    }
                    System.out.println("Client connected: " + clientSocket.getInetAddress());
                    handleClient(clientSocket); // 处理客户端连接
                } catch (IOException e) {
                    if (isRunning.get()) { // 如果不是因为stop命令关闭的，则打印错误
                        System.err.println("Error accepting client connection or client handling failed: " + e.getMessage());
                    } else {
                        System.out.println("Server socket closed, likely due to stop command.");
                    }
                } finally {
                    if (clientSocket != null && !clientSocket.isClosed()) {
                        try {
                            clientSocket.close();
                        } catch (IOException e) {
                            System.err.println("Error closing client socket: " + e.getMessage());
                        }
                    }
                }
            }
        } catch (IOException e) {
            if (isRunning.get()) {
                System.err.println("Could not start server on port " + PORT + ": " + e.getMessage());
            }
        } finally {
            if (serverSocket != null && !serverSocket.isClosed()) {
                try {
                    serverSocket.close();
                } catch (IOException e) {
                    System.err.println("Error closing server socket during final cleanup: " + e.getMessage());
                }
            }
            System.out.println("Audio server shut down.");
        }
    }

    private static void handleClient(Socket clientSocket) {
        // 为每个WAV文件生成一个唯一的文件名，例如包含时间戳
        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss").format(new Date());
        String outputFilePath = "received_audio_" + timestamp + ".wav";
        File outputFile = new File(outputFilePath);

        long totalAudioDataBytes = 0;
        int sampleRate = 0;
        short numChannels = 0;
        short bitsPerSample = 0;

        try (InputStream inputStream = clientSocket.getInputStream();
             DataInputStream dataInputStream = new DataInputStream(inputStream);
             FileOutputStream fos = new FileOutputStream(outputFile);
             BufferedOutputStream bos = new BufferedOutputStream(fos)) {

            System.out.println("Receiving custom audio header...");
            // 1. 读取自定义头部 (网络字节序 - Big Endian，DataInputStream默认读取)
            int magicNumber = dataInputStream.readInt();
            if (magicNumber != EXPECTED_MAGIC_NUMBER) {
                System.err.println("Invalid magic number. Expected: " + EXPECTED_MAGIC_NUMBER + ", Received: " + magicNumber);
                return;
            }
            sampleRate = dataInputStream.readInt();
            numChannels = dataInputStream.readShort();
            bitsPerSample = dataInputStream.readShort(); // C++客户端发送的是16

            System.out.println("Received Header -> Magic: 0x" + Integer.toHexString(magicNumber) +
                    ", SampleRate: " + sampleRate +
                    ", Channels: " + numChannels +
                    ", BitsPerSample: " + bitsPerSample);

            if (bitsPerSample != 16) {
                System.err.println("Warning: Expected 16 bitsPerSample for WAV PCM, but received " + bitsPerSample +
                        ". The C++ client should send 16-bit PCM.");
                // 即使不等于16，我们依然会尝试按照接收到的bitsPerSample写入WAV头，但这可能导致WAV播放器无法正确播放
            }


            // 2. 写入WAV文件头 (占位符)
            // WAV文件头中的多字节整数是小端序 (Little Endian)
            writeWavHeader(bos, sampleRate, numChannels, bitsPerSample, 0); // 0 for placeholder data size

            System.out.println("Receiving audio data and writing to " + outputFilePath + "...");
            byte[] buffer = new byte[4096]; // 缓冲区大小
            int bytesRead;

            // 3. 接收音频数据并写入文件
            while (isRunning.get() && (bytesRead = inputStream.read(buffer)) != -1) {
                bos.write(buffer, 0, bytesRead);
                totalAudioDataBytes += bytesRead;
            }
            bos.flush(); // 确保所有缓冲数据都写入文件

        } catch (IOException e) {
            if (isRunning.get()) { // 只有在服务器仍在运行时才打印为错误
                System.err.println("Error during client communication or file writing: " + e.getMessage());
            } else {
                System.out.println("Client handling interrupted by server shutdown.");
            }
        } finally {
            System.out.println("Audio data receiving finished. Total audio data bytes: " + totalAudioDataBytes);
            // 4. 更新WAV文件头中的大小信息
            if (outputFile.exists() && totalAudioDataBytes > 0) {
                try (RandomAccessFile raf = new RandomAccessFile(outputFile, "rw")) {
                    updateWavHeaderDataSize(raf, totalAudioDataBytes);
                    System.out.println("WAV header updated successfully for " + outputFilePath);
                } catch (IOException e) {
                    System.err.println("Error updating WAV header for " + outputFilePath + ": " + e.getMessage());
                }
            } else if (outputFile.exists() && totalAudioDataBytes == 0) {
                System.out.println("No audio data received, deleting empty WAV file: " + outputFilePath);
                outputFile.delete();
            }
        }
    }

    // 写入WAV文件头 (注意：WAV规范要求小端字节序)
    private static void writeWavHeader(OutputStream out, int sampleRate, short numChannels, short bitsPerSample, long totalAudioLen) throws IOException {
        long totalDataLen = totalAudioLen + 36; // 36是WAV头中除了RIFF id和size以及data id和size之外的部分
        long byteRate = (long) sampleRate * numChannels * bitsPerSample / 8;
        short blockAlign = (short) (numChannels * bitsPerSample / 8);

        ByteBuffer headerBuffer = ByteBuffer.allocate(44);
        headerBuffer.order(ByteOrder.LITTLE_ENDIAN); // WAV标准使用小端字节序

        headerBuffer.put((byte) 'R');
        headerBuffer.put((byte) 'I');
        headerBuffer.put((byte) 'F');
        headerBuffer.put((byte) 'F');
        headerBuffer.putInt((int) totalDataLen); // ChunkSize (文件总长度 - 8)
        headerBuffer.put((byte) 'W');
        headerBuffer.put((byte) 'A');
        headerBuffer.put((byte) 'V');
        headerBuffer.put((byte) 'E');
        headerBuffer.put((byte) 'f'); // 'fmt ' subchunk
        headerBuffer.put((byte) 'm');
        headerBuffer.put((byte) 't');
        headerBuffer.put((byte) ' ');
        headerBuffer.putInt(16); // Subchunk1Size for PCM (fmt chunk的大小，固定为16)
        headerBuffer.putShort((short) 1); // AudioFormat (1 for PCM)
        headerBuffer.putShort(numChannels);
        headerBuffer.putInt(sampleRate);
        headerBuffer.putInt((int) byteRate);
        headerBuffer.putShort(blockAlign);
        headerBuffer.putShort(bitsPerSample);
        headerBuffer.put((byte) 'd'); // 'data' subchunk
        headerBuffer.put((byte) 'a');
        headerBuffer.put((byte) 't');
        headerBuffer.put((byte) 'a');
        headerBuffer.putInt((int) totalAudioLen); // Subchunk2Size (音频数据的大小)

        out.write(headerBuffer.array());
    }

    // 使用RandomAccessFile更新WAV文件头中的大小信息
    private static void updateWavHeaderDataSize(RandomAccessFile raf, long totalAudioLen) throws IOException {
        long totalDataLen = totalAudioLen + 36;

        byte[] riffSize = new byte[4]; // ChunkSize
        ByteBuffer.wrap(riffSize).order(ByteOrder.LITTLE_ENDIAN).putInt((int) totalDataLen);
        raf.seek(4); // RIFF ChunkSize 偏移量
        raf.write(riffSize);

        byte[] dataChunkSize = new byte[4]; // Subchunk2Size
        ByteBuffer.wrap(dataChunkSize).order(ByteOrder.LITTLE_ENDIAN).putInt((int) totalAudioLen);
        raf.seek(40); // data Subchunk2Size 偏移量
        raf.write(dataChunkSize);
    }
}