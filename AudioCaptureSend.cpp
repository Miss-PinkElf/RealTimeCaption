#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <vector>
#include <iostream>
#include <stdexcept> // Required for std::runtime_error
#include <cstdint>   // Required for int32_t, int16_t
// g++ AudioCaptureSend.cpp -o AudioCaptureSend.exe -lws2_32 -lole32 -std=c++11 编译命令
//  Link with Ws2_32.lib and Ole32.lib
#pragma comment(lib, "Ws2_32.lib")
#pragma comment(lib, "Ole32.lib")

// KSDATAFORMAT_SUBTYPE_IEEE_FLOAT GUID
// {00000003-0000-0010-8000-00aa00389b71}
const GUID KSDATAFORMAT_SUBTYPE_IEEE_FLOAT_GUID =
    {0x00000003, 0x0000, 0x0010, {0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71}};

// 定义音频流头部结构体
// 这个结构体用于在网络传输的音频数据前添加一些元信息
struct AudioStreamHeader
{
    int32_t magicNumber;   // 魔数，用于识别数据流类型，确保接收端知道这是我们的音频流
    int32_t sampleRate;    // 采样率 (Hz)，例如 44100, 48000
    int16_t numChannels;   // 声道数，例如 1 (单声道), 2 (立体声)
    int16_t bitsPerSample; // 每个样本的位数，例如 16位 PCM
};

// 函数：将 32位浮点音频数据转换为 16位 PCM 音频数据
// 参数:
//   pData: 指向输入的 32位浮点音频数据的指针
//   outputPcm16Buffer: 指向输出的 16位 PCM 音频数据的缓冲区的指针
//   numFrames: 音频帧的数量 (一帧通常包含所有声道的样本)
//   numChannels: 声道数
void convertFloat32ToPcm16(const float *pData, short *outputPcm16Buffer, UINT32 numFrames, UINT16 numChannels)
{
    // 遍历所有样本 (帧数 * 声道数)
    for (UINT32 i = 0; i < numFrames * numChannels; ++i)
    {
        float sampleFloat = pData[i]; // 获取一个浮点样本

        // 将样本值限制在 [-1.0, 1.0] 范围内
        // 这是因为浮点音频通常将最大振幅表示为 1.0，最小振幅表示为 -1.0
        if (sampleFloat < -1.0f)
            sampleFloat = -1.0f;
        if (sampleFloat > 1.0f)
            sampleFloat = 1.0f;

        // 将浮点样本转换为 16位有符号整数 (PCM)
        // 32767.0f 是 16位有符号整数的最大值 (2^15 - 1)
        outputPcm16Buffer[i] = static_cast<short>(sampleFloat * 32767.0f);
    }
}

int main()
{
    HRESULT hr; // 用于存储 Windows API 函数的返回结果 (HRESULT)

    // 初始化 COM 库
    // COM (Component Object Model) 是 Windows 中用于组件间交互的技术
    // 许多 Windows API, 包括音频和网络相关的 API, 都依赖 COM
    hr = CoInitializeEx(NULL, COINIT_MULTITHREADED);
    if (FAILED(hr))
    { // FAILED 是一个宏，用于检查 HRESULT 是否表示失败
        std::cerr << "CoInitializeEx failed: 0x" << std::hex << hr << std::endl;
        return 1;
    }

    // 初始化 Winsock (Windows Sockets API)
    // 这是 Windows 平台上进行网络编程的标准接口
    WSADATA wsaData; // 存储 Winsock 初始化信息的结构体
    // MAKEWORD(2, 2) 指定请求 Winsock 2.2 版本
    int iResult = WSAStartup(MAKEWORD(2, 2), &wsaData);
    if (iResult != 0)
    {
        std::cerr << "WSAStartup failed: " << iResult << std::endl;
        CoUninitialize(); // 清理 COM
        return 1;
    }

    // 声明各种接口指针和句柄
    IMMDeviceEnumerator *pEnumerator = NULL;    // 用于枚举音频设备
    IMMDevice *pDevice = NULL;                  // 代表一个音频设备
    IAudioClient *pAudioClient = NULL;          // 用于管理音频流
    IAudioCaptureClient *pCaptureClient = NULL; // 用于从音频端点捕获数据
    WAVEFORMATEX *pwfx = NULL;                  // 描述音频波形格式
    HANDLE hAudioSamplesReadyEvent = NULL;      // 事件句柄，当有音频数据可用时触发
    SOCKET ConnectSocket = INVALID_SOCKET;      // 网络套接字

    try
    {
        // 创建设备枚举器实例
        hr = CoCreateInstance(
            __uuidof(MMDeviceEnumerator), NULL,        // MMDeviceEnumerator 的 CLSID (类标识符)
            CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), // 请求的接口 IID (接口标识符)
            (void **)&pEnumerator);
        if (FAILED(hr))
            throw std::runtime_error("CoCreateInstance for MMDeviceEnumerator failed.");

        // 获取默认的音频输出设备 (用于环回捕获)
        // eRender: 指定渲染设备 (扬声器/耳机)
        // eConsole: 指定设备角色 (用于游戏、系统声音等)
        hr = pEnumerator->GetDefaultAudioEndpoint(eRender, eConsole, &pDevice);
        if (FAILED(hr))
            throw std::runtime_error("GetDefaultAudioEndpoint failed.");

        // 激活音频设备的 IAudioClient 接口
        hr = pDevice->Activate(__uuidof(IAudioClient), CLSCTX_ALL, NULL, (void **)&pAudioClient);
        if (FAILED(hr))
            throw std::runtime_error("Device Activate for IAudioClient failed.");

        // 获取音频设备的混音格式 (通常是系统正在使用的格式)
        hr = pAudioClient->GetMixFormat(&pwfx);
        if (FAILED(hr))
            throw std::runtime_error("GetMixFormat failed.");

        bool isFloat32 = false; // 标记音频格式是否为32位浮点
        // 检查音频格式
        if (pwfx->wFormatTag == WAVE_FORMAT_EXTENSIBLE)
        { // 可扩展波形格式
            WAVEFORMATEXTENSIBLE *pwfex = reinterpret_cast<WAVEFORMATEXTENSIBLE *>(pwfx);
            // 检查子格式是否为 IEEE_FLOAT 且每个样本32位
            if (IsEqualGUID(pwfex->SubFormat, KSDATAFORMAT_SUBTYPE_IEEE_FLOAT_GUID) && pwfx->wBitsPerSample == 32)
            {
                isFloat32 = true;
                std::cout << "Audio format: 32-bit IEEE Float (Extensible)" << std::endl;
            }
        }
        else if (pwfx->wFormatTag == WAVE_FORMAT_IEEE_FLOAT && pwfx->wBitsPerSample == 32)
        { // 标准 IEEE 浮点格式
            isFloat32 = true;
            std::cout << "Audio format: 32-bit IEEE Float (Standard)" << std::endl;
        }
        else
        {
            std::cout << "Audio format is not 32-bit float. wFormatTag: " << pwfx->wFormatTag << ", wBitsPerSample: " << pwfx->wBitsPerSample << std::endl;
            // 这个示例主要处理32位浮点，如果不是，转换逻辑可能需要调整
        }

        std::cout << "Sample Rate: " << pwfx->nSamplesPerSec << std::endl;
        std::cout << "Channels: " << pwfx->nChannels << std::endl;
        std::cout << "Bits Per Sample (container): " << pwfx->wBitsPerSample << std::endl;

        REFERENCE_TIME hnsRequestedDuration = 10000000;                  // 请求的缓冲区持续时间 (1秒 = 10,000,000 * 100纳秒)
        hAudioSamplesReadyEvent = CreateEvent(NULL, FALSE, FALSE, NULL); // 创建事件对象
        if (hAudioSamplesReadyEvent == NULL)
            throw std::runtime_error("CreateEvent failed.");

        // 初始化音频客户端
        hr = pAudioClient->Initialize(
            AUDCLNT_SHAREMODE_SHARED,                                         // 共享模式，允许多个应用共享设备
            AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK, // 环回捕获，并使用事件回调
            hnsRequestedDuration,                                             // 缓冲区持续时间
            0,                                                                // 周期性 (对于事件驱动，通常为0)
            pwfx,                                                             // 音频格式
            NULL);                                                            // 音频会话 GUID (可选)
        if (FAILED(hr))
            throw std::runtime_error("IAudioClient Initialize failed.");

        // 设置事件句柄，当缓冲区准备好处理时会发出信号
        hr = pAudioClient->SetEventHandle(hAudioSamplesReadyEvent);
        if (FAILED(hr))
            throw std::runtime_error("SetEventHandle failed.");

        // 获取 IAudioCaptureClient 服务，用于从捕获端点缓冲区读取数据
        hr = pAudioClient->GetService(__uuidof(IAudioCaptureClient), (void **)&pCaptureClient);
        if (FAILED(hr))
            throw std::runtime_error("GetService for IAudioCaptureClient failed.");

        // 设置 TCP 客户端
        const char *serverIp = "127.0.0.1"; // 服务器 IP 地址 (本机回环地址)
        int port = 55555;                   // 服务器端口号
        struct sockaddr_in clientService;   // 存储服务器地址信息的结构体

        // 创建套接字
        // AF_INET: IPv4 地址族
        // SOCK_STREAM: TCP协议 (面向连接的流套接字)
        // IPPROTO_TCP: TCP 协议
        ConnectSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (ConnectSocket == INVALID_SOCKET)
        {
            throw std::runtime_error("socket() failed with error: " + std::to_string(WSAGetLastError()));
        }

        clientService.sin_family = AF_INET; // 地址族
        // InetPton 将点分十进制的 IP 地址字符串转换为网络字节序的二进制形式
        InetPton(AF_INET, serverIp, &clientService.sin_addr.s_addr);
        clientService.sin_port = htons(port); // htons 将主机字节序的端口号转换为网络字节序

        // 连接到服务器
        iResult = connect(ConnectSocket, (SOCKADDR *)&clientService, sizeof(clientService));
        if (iResult == SOCKET_ERROR)
        {
            closesocket(ConnectSocket);
            ConnectSocket = INVALID_SOCKET;
            throw std::runtime_error("connect() failed with error: " + std::to_string(WSAGetLastError()));
        }
        std::cout << "Connected to server." << std::endl;

        // 发送音频流头部信息
        AudioStreamHeader header;
        // htonl (host to network long): 将32位整数从主机字节序转换到网络字节序
        // htons (host to network short): 将16位整数从主机字节序转换到网络字节序
        // 网络字节序通常是大端序 (Big Endian)
        header.magicNumber = htonl(0x4155444D); // "AUDM" 魔数
        header.sampleRate = htonl(pwfx->nSamplesPerSec);
        header.numChannels = htons(pwfx->nChannels);
        header.bitsPerSample = htons(16); // 我们将转换为16位PCM

        // 发送头部数据
        iResult = send(ConnectSocket, (const char *)&header, sizeof(AudioStreamHeader), 0);
        if (iResult == SOCKET_ERROR)
        {
            throw std::runtime_error("send header failed with error: " + std::to_string(WSAGetLastError()));
        }
        std::cout << "Audio header sent." << std::endl;

        // 开始捕获音频
        hr = pAudioClient->Start();
        if (FAILED(hr))
            throw std::runtime_error("IAudioClient Start failed.");
        std::cout << "Capturing and streaming audio for 10 seconds..." << std::endl;

        bool capturing = true;            // 控制捕获循环的标志
        DWORD startTime = GetTickCount(); // 获取当前系统时间 (毫秒)
        DWORD captureDurationMs = 10000;  // 捕获持续时间 (10秒)
        std::vector<short> pcm16Buffer;   // 用于存储转换后的16位PCM数据

        while (capturing)
        {
            // 等待音频数据可用事件，超时时间2秒
            DWORD waitResult = WaitForSingleObject(hAudioSamplesReadyEvent, 2000);
            if (waitResult == WAIT_TIMEOUT)
            {
                std::cerr << "WaitForSingleObject timeout." << std::endl;
                break; // 超时则退出循环
            }
            // 检查 WaitForSingleObject 的结果，确保是 WAIT_OBJECT_0 (表示事件被触发)
            // 之前这里有一个笔误 `| |` 应该是 `||`
            if (waitResult == WAIT_FAILED || waitResult != WAIT_OBJECT_0)
            {
                std::cerr << "WaitForSingleObject failed or unexpected result: " << GetLastError() << std::endl;
                break;
            }

            BYTE *pData;               // 指向捕获到的音频数据
            UINT32 numFramesAvailable; // 可用的音频帧数
            DWORD flags;               // 描述数据包状态的标志

            // 从捕获客户端获取缓冲区数据
            hr = pCaptureClient->GetBuffer(&pData, &numFramesAvailable, &flags, NULL, NULL);
            if (FAILED(hr))
            {
                std::cerr << "GetBuffer failed: 0x" << std::hex << hr << std::endl;
                break;
            }

            if (numFramesAvailable > 0)
            {
                if (flags & AUDCLNT_BUFFERFLAGS_SILENT)
                {
                    // 如果是静音数据，用0填充缓冲区
                    pcm16Buffer.assign(numFramesAvailable * pwfx->nChannels, 0);
                }
                else if (isFloat32)
                {
                    // 如果是32位浮点数据，进行转换
                    pcm16Buffer.resize(numFramesAvailable * pwfx->nChannels);
                    convertFloat32ToPcm16((const float *)pData, pcm16Buffer.data(), numFramesAvailable, pwfx->nChannels);
                }
                else if (pwfx->wBitsPerSample == 16)
                {
                    // 如果已经是16位PCM数据 (假设系统是小端序，Windows 通常是)
                    pcm16Buffer.resize(numFramesAvailable * pwfx->nChannels);
                    // pwfx->nBlockAlign 是每个音频帧的字节数 (声道数 * 每个样本字节数)
                    memcpy(pcm16Buffer.data(), pData, numFramesAvailable * pwfx->nBlockAlign);
                }
                else
                {
                    std::cerr << "Unsupported audio format from GetBuffer for direct sending or conversion in this example." << std::endl;
                    pcm16Buffer.assign(numFramesAvailable * pwfx->nChannels, 0); // 发送静音
                }

                if (!pcm16Buffer.empty())
                {
                    int bytesToSend = pcm16Buffer.size() * sizeof(short); // 计算要发送的总字节数
                    // 发送音频数据
                    int bytesSent = send(ConnectSocket, (const char *)pcm16Buffer.data(), bytesToSend, 0);
                    if (bytesSent == SOCKET_ERROR)
                    {
                        std::cerr << "send audio data failed with error: " << WSAGetLastError() << std::endl;
                        capturing = false; // 停止捕获
                    }
                    else if (bytesSent < bytesToSend)
                    {
                        std::cerr << "Partial send, handling not implemented." << std::endl;
                        // 实际应用中应处理部分发送的情况，例如重试发送剩余数据
                    }
                }
            }

            // 释放捕获缓冲区
            hr = pCaptureClient->ReleaseBuffer(numFramesAvailable);
            if (FAILED(hr))
            {
                std::cerr << "ReleaseBuffer failed: 0x" << std::hex << hr << std::endl;
                break;
            }

            // 检查是否达到捕获持续时间
            if (GetTickCount() - startTime > captureDurationMs)
            {
                capturing = false;
                std::cout << "Capture duration reached." << std::endl;
            }
        }
        std::cout << "Capture loop finished." << std::endl;
    }
    catch (const std::runtime_error &e)
    {
        // 捕获并打印运行时错误
        std::cerr << "Runtime error: " << e.what() << std::endl;
        if (FAILED(hr))
            std::cerr << "HRESULT: 0x" << std::hex << hr << std::endl;
    }

    // 清理资源
    std::cout << "Stopping capture and cleaning up..." << std::endl;
    if (pAudioClient)
        pAudioClient->Stop(); // 停止音频客户端
    if (ConnectSocket != INVALID_SOCKET)
    {
        shutdown(ConnectSocket, SD_SEND); // 优雅地关闭发送方
        closesocket(ConnectSocket);       // 关闭套接字
    }

    if (hAudioSamplesReadyEvent)
        CloseHandle(hAudioSamplesReadyEvent); // 关闭事件句柄
    if (pwfx)
        CoTaskMemFree(pwfx); // 释放 WAVEFORMATEX 结构体内存
    // COM对象的 Release() 方法用于减少其引用计数，当计数为0时对象会被销毁
    if (pCaptureClient)
        pCaptureClient->Release();
    if (pAudioClient)
        pAudioClient->Release();
    if (pDevice)
        pDevice->Release();
    if (pEnumerator)
        pEnumerator->Release();

    WSACleanup();     // 清理 Winsock
    CoUninitialize(); // 清理 COM

    std::cout << "Client finished." << std::endl;
    return 0;
}