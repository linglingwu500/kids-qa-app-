import Taro from '@tarojs/taro'

/**
 * 豆包实时语音对话配置接口
 */
export interface DoubaoRealtimeConfig {
  appId: string
  accessKey: string
  resourceId?: string
  appKey?: string
  wsUrl?: string
}

/**
 * 豆包实时语音对话配置
 */
let REALTIME_CONFIG: {
  wsUrl: string
  appId: string
  accessKey: string
  resourceId: string
  appKey: string
  audio: {
    format: string
    rate: number
    channel: number
    bits: number
  }
  asr: {
    language: string
    itn: boolean
  }
  tts: {
    voice_type: string
    speed_ratio: number
    volume_ratio: number
    pitch_ratio: number
  }
} = {
  // WebSocket 连接地址
  wsUrl: 'wss://openspeech.bytedance.com/api/v3/realtime/dialog',

  // 认证信息
  appId: '',
  accessKey: '',
  resourceId: 'volc.speech.dialog',
  appKey: 'PlgvMymc7f3tQnJ6',

  // 音频配置
  audio: {
    format: 'pcm',          // 音频格式：pcm
    rate: 16000,           // 采样率：16000 Hz
    channel: 1,             // 声道数：1
    bits: 16               // 位深：16
  },

  // ASR 配置
  asr: {
    language: 'zh-CN',     // 语言：中文
    itn: true             // 逆文本规范化
  },

  // TTS 配置
  tts: {
    voice_type: 'zh_female_qingxin',  // 清新女声（儿童友好）
    speed_ratio: 1.0,
    volume_ratio: 1.0,
    pitch_ratio: 1.0
  }
}

/**
 * 二进制帧类型枚举
 */
enum FrameType {
  // 客户端发送的事件
  StartConnection = 0x01,
  StartSession = 0x02,
  TaskRequest = 0x03,
  CancelTask = 0x04,
  EndSession = 0x05,

  // 服务端返回的事件
  ConnectionStart = 0x11,
  ConnectionStarted = 0x12,
  SessionStart = 0x13,
  SessionStarted = 0x14,
  SessionTerminated = 0x15,
  Audio = 0x16,
  ASRInfo = 0x17,
  ASRResponse = 0x18,
  ChatResponse = 0x19,
  TTSInfo = 0x1a,
  TTSResponse = 0x1b,
  CancelTaskResponse = 0x1c
}

/**
 * WebSocket 状态
 */
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  SESSION_ACTIVE = 'session_active'
}

/**
 * ASR 识别结果
 */
export interface ASRResult {
  text: string
  isFinal: boolean
  confidence?: number
}

/**
 * TTS 合成结果
 */
export interface TTSResult {
  text: string
  audioData?: ArrayBuffer
  isFinal: boolean
}

/**
 * LLM 回复结果
 */
export interface ChatResult {
  text: string
  isFinal: boolean
}

/**
 * 回调接口
 */
export interface DoubaoRealtimeCallbacks {
  onConnectStart?: () => void
  onConnected?: () => void
  onSessionStarted?: () => void
  onASRResult?: (result: ASRResult) => void
  onChatResponse?: (result: ChatResult) => void
  onTTSResult?: (result: TTSResult) => void
  onSessionTerminated?: () => void
  onError?: (error: string) => void
  onClose?: () => void
}

/**
 * 豆包实时语音对话服务
 */
class DoubaoRealtimeService {
  private socket: any = null
  private connectId: string = ''
  private state: ConnectionState = ConnectionState.DISCONNECTED
  private sessionId: string = ''
  private callbacks: DoubaoRealtimeCallbacks = {}
  private reconnectTimer: any = null
  private taskCount: number = 0

  constructor() {
    this.generateConnectId()
  }

  /**
   * 设置配置
   */
  setConfig(config: DoubaoRealtimeConfig): void {
    console.log('=== 设置实时语音服务配置 ===', config)
    if (config.appId) {
      REALTIME_CONFIG.appId = config.appId
    }
    if (config.accessKey) {
      REALTIME_CONFIG.accessKey = config.accessKey
    }
    if (config.resourceId) {
      REALTIME_CONFIG.resourceId = config.resourceId
    }
    if (config.appKey) {
      REALTIME_CONFIG.appKey = config.appKey
    }
    if (config.wsUrl) {
      REALTIME_CONFIG.wsUrl = config.wsUrl
    }
  }

  /**
   * 生成连接 ID
   */
  private generateConnectId(): void {
    this.connectId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: DoubaoRealtimeCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks }
  }

  /**
   * 获取当前状态
   */
  getState(): ConnectionState {
    return this.state
  }

  /**
   * 连接 WebSocket
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.state !== ConnectionState.DISCONNECTED) {
        console.warn('WebSocket 已连接或正在连接中')
        resolve()
        return
      }

      try {
        console.log('=== 开始连接豆包实时语音服务 ===')
        console.log('配置:', {
          url: REALTIME_CONFIG.wsUrl,
          appId: REALTIME_CONFIG.appId,
          resourceId: REALTIME_CONFIG.resourceId,
          appKey: REALTIME_CONFIG.appKey,
          connectId: this.connectId
        })
        this.state = ConnectionState.CONNECTING

        // 构建请求头
        const headers = {
          'X-Api-App-ID': REALTIME_CONFIG.appId,
          'X-Api-Access-Key': REALTIME_CONFIG.accessKey,
          'X-Api-Resource-Id': REALTIME_CONFIG.resourceId,
          'X-Api-App-Key': REALTIME_CONFIG.appKey,
          'X-Api-Connect-Id': this.connectId
        }

        console.log('请求头:', headers)

        // 使用 connectSocket 创建连接
        const socketTask = Taro.connectSocket({
          url: REALTIME_CONFIG.wsUrl,
          header: headers,
          success: () => {
            console.log('WebSocket 连接请求已发送')
          },
          fail: (err: any) => {
            console.error('WebSocket connectSocket 失败:', err)
            this.state = ConnectionState.DISCONNECTED
            this.callbacks.onError?.(`连接请求失败: ${err.errMsg || err.message}`)
            reject(err)
          }
        })

        console.log('SocketTask 创建:', socketTask)
        console.log('SocketTask 类型:', typeof socketTask)
        console.log('SocketTask.onOpen:', typeof socketTask?.onOpen)
        console.log('SocketTask.onClose:', typeof socketTask?.onClose)
        console.log('SocketTask.onError:', typeof socketTask?.onError)
        console.log('SocketTask.onMessage:', typeof socketTask?.onMessage)

        // 保存 socket 引用
        this.socket = socketTask

        // 检查 socket 是否有效
        if (!socketTask) {
          const error = new Error('SocketTask 创建失败')
          console.error(error)
          this.state = ConnectionState.DISCONNECTED
          reject(error)
          return
        }

        // 直接设置事件监听器（不使用 setTimeout）
        // 监听连接打开
        socketTask.onOpen(() => {
          console.log('✅ WebSocket 连接已打开')
          this.state = ConnectionState.CONNECTED
          this.callbacks.onConnected?.()
          resolve()
        })

        // 监听连接错误（如果 connectSocket 的 fail 没捕获到）
        socketTask.onError((err: any) => {
          console.error('❌ WebSocket 错误:', err)
          this.state = ConnectionState.DISCONNECTED
          this.callbacks.onError?.(`WebSocket 错误: ${err.errMsg || err.message}`)
        })

        // 监听连接关闭
        socketTask.onClose(() => {
          console.log('🔴 WebSocket 连接已关闭')
          this.state = ConnectionState.DISCONNECTED
          this.sessionId = ''
          this.callbacks.onClose?.()
          this.callbacks.onSessionTerminated?.()
        })

        // 监听消息
        socketTask.onMessage((res: any) => {
          console.log('📨 收到 WebSocket 消息，长度:', res.data?.length)
          if (res.data) {
            this.handleServerMessage(res.data)
          }
        })
      } catch (error) {
        console.error('❌ 连接异常:', error)
        this.state = ConnectionState.DISCONNECTED
        reject(error)
      }
    })
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    console.log('=== 断开豆包实时语音服务连接 ===')

    // 清除重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // 如果会话还活跃，先结束会话
    if (this.state === ConnectionState.SESSION_ACTIVE) {
      this.endSession()
    }

    // 关闭连接（添加防护检查）
    if (this.socket && typeof this.socket.close === 'function') {
      try {
        this.socket.close()
      } catch (error) {
        console.error('关闭 socket 失败:', error)
      }
      this.socket = null
    }

    this.state = ConnectionState.DISCONNECTED
    this.sessionId = ''
  }

  /**
   * 开始会话
   */
  startSession(): void {
    console.log('=== 开始实时语音会话 ===')

    if (this.state !== ConnectionState.CONNECTED) {
      throw new Error('WebSocket 未连接，请先调用 connect()')
    }

    const frame = this.buildFrame(FrameType.StartSession, {
      app: {
        appid: REALTIME_CONFIG.appId,
        token: REALTIME_CONFIG.accessKey,
        cluster: 'volc_asr_common'
      },
      user: {
        uid: 'user_' + Date.now()
      },
      audio: {
        format: REALTIME_CONFIG.audio.format,
        rate: REALTIME_CONFIG.audio.rate,
        channel: REALTIME_CONFIG.audio.channel,
        bits: REALTIME_CONFIG.audio.bits
      },
      request: {
        reqid: `req_${Date.now()}_${this.taskCount++}`,
        nbest: 1
      },
      asr_config: {
        language: REALTIME_CONFIG.asr.language,
        itn: REALTIME_CONFIG.asr.itn
      },
      tts_config: {
        voice_type: REALTIME_CONFIG.tts.voice_type,
        speed_ratio: REALTIME_CONFIG.tts.speed_ratio,
        volume_ratio: REALTIME_CONFIG.tts.volume_ratio,
        pitch_ratio: REALTIME_CONFIG.tts.pitch_ratio
      },
      llm_config: {
        model: 'doubao-pro-32k',
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 0.9
      },
      system_prompt: '你是一个儿童友好的问答助手。请用简单、生动、有趣的语言回答小朋友的问题，语气温柔亲切。回答要适合3-8岁的儿童理解，避免复杂的专业术语。如果遇到不适合儿童的内容，请温柔地引导他们问其他问题。'
    })

    this.sendFrame(frame)
    this.state = ConnectionState.SESSION_ACTIVE
  }

  /**
   * 结束会话
   */
  endSession(): void {
    console.log('=== 结束实时语音会话 ===')

    if (this.state !== ConnectionState.SESSION_ACTIVE) {
      console.warn('会话未启动')
      return
    }

    const frame = this.buildFrame(FrameType.EndSession, {})

    this.sendFrame(frame)
    this.state = ConnectionState.CONNECTED
    this.sessionId = ''
  }

  /**
   * 发送音频数据
   * @param audioData PCM 音频数据（ArrayBuffer）
   */
  sendAudio(audioData: ArrayBuffer): void {
    if (this.state !== ConnectionState.SESSION_ACTIVE) {
      console.warn('会话未启动，无法发送音频')
      return
    }

    const frame = this.buildFrame(FrameType.TaskRequest, audioData)
    this.sendFrame(frame)
  }

  /**
   * 取消任务
   */
  cancelTask(): void {
    if (this.state !== ConnectionState.SESSION_ACTIVE) {
      console.warn('会话未启动')
      return
    }

    const frame = this.buildFrame(FrameType.CancelTask, {})
    this.sendFrame(frame)
  }

  /**
   * 构建二进制帧
   * @param type 帧类型
   * @param payload 数据负载（JSON 对象或 ArrayBuffer）
   * @returns 完整的二进制帧
   */
  private buildFrame(type: FrameType, payload: any): ArrayBuffer {
    let payloadData: ArrayBuffer

    if (payload instanceof ArrayBuffer) {
      // 直接使用音频数据
      payloadData = payload
    } else {
      // 将 JSON 对象转换为字符串，再转换为 UTF-8 编码的 ArrayBuffer
      const jsonStr = JSON.stringify(payload)
      const encoder = new TextEncoder()
      payloadData = encoder.encode(jsonStr)
    }

    // 计算总长度（4字节头部 + 负载数据）
    const totalLength = 4 + payloadData.byteLength

    // 创建 ArrayBuffer
    const buffer = new ArrayBuffer(totalLength)
    const view = new DataView(buffer)

    // 写入帧头（4字节：1字节版本 + 1字节类型 + 2字节长度）
    view.setUint8(0, 0x01)              // 版本：1
    view.setUint8(1, type)             // 帧类型
    view.setUint16(2, payloadData.byteLength, false)  // 负载长度（大端序）

    // 写入负载数据
    const payloadView = new Uint8Array(payloadData)
    const bufferView = new Uint8Array(buffer)
    bufferView.set(payloadView, 4)

    return buffer
  }

  /**
   * 发送帧
   * @param frame 二进制帧
   */
  private sendFrame(frame: ArrayBuffer): void {
    if (!this.socket) {
      console.error('WebSocket 未连接')
      return
    }

    if (typeof this.socket.send !== 'function') {
      console.error('WebSocket.send 方法不可用')
      return
    }

    // 将 ArrayBuffer 转换为 Uint8Array
    const data = new Uint8Array(frame)

    this.socket.send({
      data: data.buffer,
      success: () => {
        // console.log('帧发送成功，类型:', data[1])
      },
      fail: (err: any) => {
        console.error('帧发送失败:', err)
      }
    })
  }

  /**
   * 处理服务端消息
   * @param data 二进制数据
   */
  private handleServerMessage(data: ArrayBuffer): void {
    try {
      const view = new DataView(data)

      // 读取帧头
      const version = view.getUint8(0)
      const type = view.getUint8(1)
      const length = view.getUint16(2, false)

      console.log(`收到帧: 版本=${version}, 类型=0x${type.toString(16)}, 长度=${length}`)

      // 读取负载
      let payload: ArrayBuffer = data.slice(4, 4 + length)

      // 根据类型处理
      switch (type) {
        case FrameType.ConnectionStart:
          console.log('收到 ConnectionStart')
          this.callbacks.onConnectStart?.()
          break

        case FrameType.ConnectionStarted:
          console.log('收到 ConnectionStarted')
          break

        case FrameType.SessionStart:
          console.log('收到 SessionStart')
          break

        case FrameType.SessionStarted:
          console.log('收到 SessionStarted，会话已建立')
          this.callbacks.onSessionStarted?.()
          break

        case FrameType.ASRInfo:
          this.handleASRInfo(payload)
          break

        case FrameType.ASRResponse:
          this.handleASRResponse(payload)
          break

        case FrameType.ChatResponse:
          this.handleChatResponse(payload)
          break

        case FrameType.TTSInfo:
          this.handleTTSInfo(payload)
          break

        case FrameType.TTSResponse:
          this.handleTTSResponse(payload)
          break

        case FrameType.Audio:
          console.log('收到音频数据，长度:', payload.byteLength)
          this.callbacks.onTTSResult?.({
            text: '',
            audioData: payload,
            isFinal: false
          })
          break

        case FrameType.SessionTerminated:
          console.log('收到 SessionTerminated')
          this.state = ConnectionState.CONNECTED
          this.sessionId = ''
          this.callbacks.onSessionTerminated?.()
          break

        default:
          console.warn('未知的帧类型:', type)
      }
    } catch (error) {
      console.error('处理服务端消息失败:', error)
    }
  }

  /**
   * 处理 ASR 信息
   */
  private handleASRInfo(data: ArrayBuffer): void {
    try {
      const decoder = new TextDecoder()
      const jsonStr = decoder.decode(data)
      const info = JSON.parse(jsonStr)

      console.log('ASR Info:', info)
    } catch (error) {
      console.error('解析 ASR Info 失败:', error)
    }
  }

  /**
   * 处理 ASR 响应
   */
  private handleASRResponse(data: ArrayBuffer): void {
    try {
      const decoder = new TextDecoder()
      const jsonStr = decoder.decode(data)
      const response = JSON.parse(jsonStr)

      console.log('ASR Response:', response)

      const text = response.result?.text || response.text || ''
      const isFinal = response.is_final || response.isFinal || false

      this.callbacks.onASRResult?.({
        text,
        isFinal,
        confidence: response.confidence
      })
    } catch (error) {
      console.error('解析 ASR Response 失败:', error)
    }
  }

  /**
   * 处理 LLM 回复响应
   */
  private handleChatResponse(data: ArrayBuffer): void {
    try {
      const decoder = new TextDecoder()
      const jsonStr = decoder.decode(data)
      const response = JSON.parse(jsonStr)

      console.log('Chat Response:', response)

      const text = response.result?.text || response.text || ''
      const isFinal = response.is_final || response.isFinal || false

      this.callbacks.onChatResponse?.({
        text,
        isFinal
      })
    } catch (error) {
      console.error('解析 Chat Response 失败:', error)
    }
  }

  /**
   * 处理 TTS 信息
   */
  private handleTTSInfo(data: ArrayBuffer): void {
    try {
      const decoder = new TextDecoder()
      const jsonStr = decoder.decode(data)
      const info = JSON.parse(jsonStr)

      console.log('TTS Info:', info)
    } catch (error) {
      console.error('解析 TTS Info 失败:', error)
    }
  }

  /**
   * 处理 TTS 响应
   */
  private handleTTSResponse(data: ArrayBuffer): void {
    try {
      const decoder = new TextDecoder()
      const jsonStr = decoder.decode(data)
      const response = JSON.parse(jsonStr)

      console.log('TTS Response:', response)

      const text = response.result?.text || response.text || ''
      const isFinal = response.is_final || response.isFinal || false

      this.callbacks.onTTSResult?.({
        text,
        isFinal
      })
    } catch (error) {
      console.error('解析 TTS Response 失败:', error)
    }
  }

  /**
   * 将 MP3 转换为 PCM
   * 注意：小程序环境中可能无法直接解码 MP3，需要在录音时直接录制 PCM 格式
   */
  private async convertMP3ToPCM(mp3Data: ArrayBuffer): Promise<ArrayBuffer> {
    // 简化版：实际实现需要使用音频解码库
    // 在小程序中，建议直接录制 PCM 格式，或者使用 Taro 的音频解码能力
    console.warn('MP3 转 PCM 功能暂未实现，请直接录制 PCM 格式音频')
    return mp3Data
  }
}

// 导出单例
export const doubaoRealtimeService = new DoubaoRealtimeService()

// 导出类型
export { ConnectionState, FrameType }
