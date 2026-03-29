import Taro from '@tarojs/taro'
import { doubaoRealtimeService, type ASRResult as RealtimeASRResult, type TTSResult as RealtimeTTSResult, type ChatResult } from './doubao-realtime'
import { GLM_CONFIG, DOUBAO_CONFIG } from '../config/env'

/**
 * 语音服务配置
 */
const VOICE_CONFIG = {
  // 录音配置
  record: {
    duration: 30000,      // 最长录音时长（毫秒）
    format: 'mp3',        // 音频格式：mp3（微信小程序实际输出格式）
    sampleRate: 16000,    // 采样率
    numberOfChannels: 1,   // 声道数
    encodeBitRate: 48000, // 编码码率
    frameSize: 50         // 指定帧大小
  },
  // GLM-ASR 配置（备用）
  glmAsr: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/audio/transcriptions',
    get apiKey(): string {
      return GLM_CONFIG.API_KEY
    },
    model: 'glm-asr-2512'
  },
  // 豆包级联模式配置
  doubao: {
    // ASR 配置（豆包语音识别）
    asr: {
      baseUrl: 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash',
      get appId(): string {
        return DOUBAO_CONFIG.APP_ID
      },
      get accessKey(): string {
        return DOUBAO_CONFIG.ACCESS_KEY
      },
      language: 'zh-CN',
      format: 'mp3'  // 与录音格式保持一致
    },
    // LLM 配置（火山方舟）
    llm: {
      get baseUrl(): string {
        return DOUBAO_CONFIG.API_ENDPOINT
      },
      get apiKey(): string {
        return DOUBAO_CONFIG.ACCESS_KEY
      },
      model: 'doubao-pro-32k',
      maxTokens: 1024,
      temperature: 0.7
    },
    // TTS 配置（豆包语音合成）
    tts: {
      baseUrl: 'https://openspeech.bytedance.com/api/v1',
      get appId(): string {
        return DOUBAO_CONFIG.APP_ID
      },
      get accessKey(): string {
        return DOUBAO_CONFIG.ACCESS_KEY
      },
      get appKey(): string {
        return DOUBAO_CONFIG.SECRET_KEY
      },  // TTS 需要使用 Secret Key 作为 App Key
      voiceType: 'BV001_streaming',  // 通用女声（儿童友好）
      speed: 1.0,
      pitch: 1.0
    }
  },
  // 当前使用的服务模式：'doubao-cascade' | 'glm-asr' | 'doubao-realtime'
  mode: 'doubao-cascade' as const
}

/**
 * 语音识别结果接口
 */
export interface ASRResult {
  success: boolean
  text: string
  confidence?: number
  errorMessage?: string
  tempFilePath?: string  // 录音文件路径（实时模式使用）
}

/**
 * 语音合成结果接口
 */
export interface TTSResult {
  success: boolean
  audioUrl?: string
  duration?: number
  errorMessage?: string
}

/**
 * 播放状态接口
 */
export interface PlayState {
  isPlaying: boolean
  currentMessageId: string | null
  progress: number
  duration: number
}

/**
 * 语音服务类
 */
class VoiceService {
  private recorderManager: any = null
  private innerAudio: any = null
  private playState: PlayState = {
    isPlaying: false,
    currentMessageId: null,
    progress: 0,
    duration: 0
  }
  private playStateListeners: Array<(state: PlayState) => void> = []
  private recorderInitialized = false
  private startResolve: (() => void) | null = null
  private startReject: ((error: any) => void) | null = null
  private stopResolve: ((result: any) => void) | null = null
  private cancelResolve: (() => void) | null = null

  constructor() {
    this.initRecorderManager()
    this.initAudioPlayer()
  }

  /**
   * 初始化录音管理器（只初始化一次）
   */
  private initRecorderManager() {
    try {
      // 如果已经初始化过，直接返回
      if (this.recorderInitialized) {
        console.log('录音管理器已初始化，跳过')
        return
      }

      // 获取录音管理器实例
      this.recorderManager = Taro.getRecorderManager()

      // 监听录音开始
      this.recorderManager.onStart(() => {
        console.log('录音开始事件')
        if (this.startResolve) {
          this.startResolve()
          this.startResolve = null
        }
      })

      // 监听录音暂停
      this.recorderManager.onPause(() => {
        console.log('录音暂停事件')
      })

      // 监听录音停止
      this.recorderManager.onStop((res: any) => {
        console.log('录音停止事件:', res)
        if (this.stopResolve) {
          this.stopResolve(res)
          this.stopResolve = null
        }
        if (this.cancelResolve) {
          this.cancelResolve()
          this.cancelResolve = null
        }
      })

      // 监听录音错误
      this.recorderManager.onError((err: any) => {
        console.error('录音错误事件:', err)
        if (this.startReject) {
          this.startReject(err)
          this.startReject = null
        }
        // 录音错误时，stopResolve 传入一个包含错误信息的对象
        if (this.stopResolve) {
          this.stopResolve({ tempFilePath: '', duration: 0, fileSize: 0, error: err })
          this.stopResolve = null
        }
        if (this.cancelResolve) {
          this.cancelResolve()
          this.cancelResolve = null
        }
      })

      // 监听录音帧数据（可用于波形显示）
      if (this.recorderManager.onFrameRecorded) {
        this.recorderManager.onFrameRecorded((res: any) => {
          // res.frameBuffer 是录音帧数据
          // 可以根据这些数据计算音量并显示波形
          const volume = this.calculateVolume(res.frameBuffer)
          this.onVolumeChanged(volume)
        })
      }

      this.recorderInitialized = true
      console.log('录音管理器初始化完成')
    } catch (error) {
      console.error('初始化录音管理器失败:', error)
    }
  }

  /**
   * 初始化音频播放器
   */
  private initAudioPlayer() {
    try {
      console.log('=== 初始化音频播放器 ===')
      this.innerAudio = Taro.createInnerAudioContext()

      // 设置音频播放模式
      this.innerAudio.obeyMuteSwitch = false  // 不遵循静音开关
      this.innerAudio.autoplay = false  // 不自动播放

      // 监听音频加载事件
      this.innerAudio.onCanplay(() => {
        console.log('音频可以播放了，时长:', this.innerAudio.duration, '秒')
      })

      // 监听音频播放事件
      this.innerAudio.onPlay(() => {
        console.log('=== 开始播放 ===')
        this.updatePlayState({ isPlaying: true })
      })

      // 监听音频暂停事件
      this.innerAudio.onPause(() => {
        console.log('=== 暂停播放 ===')
        this.updatePlayState({ isPlaying: false })
      })

      // 监听音频停止事件
      this.innerAudio.onStop(() => {
        console.log('=== 停止播放 ===')
        this.updatePlayState({ isPlaying: false, progress: 0, currentMessageId: null })
      })

      // 监听音频自然播放结束事件
      this.innerAudio.onEnded(() => {
        console.log('=== 播放结束 ===')
        this.updatePlayState({ isPlaying: false, progress: 0, currentMessageId: null })
      })

      // 监听音频播放进度更新
      this.innerAudio.onTimeUpdate(() => {
        const currentTime = this.innerAudio.currentTime
        const duration = this.innerAudio.duration
        const progress = duration > 0 ? currentTime / duration : 0
        console.log('播放进度:', currentTime, '/', duration, '秒')
        this.updatePlayState({
          progress,
          duration
        })
      })

      // 监听音频播放错误事件
      this.innerAudio.onError((err: any) => {
        console.error('=== 播放错误 ===', err)
        console.error('错误详情:', {
          errMsg: err.errMsg,
          errorCode: err.errorCode
        })
        this.updatePlayState({ isPlaying: false })
      })

      console.log('音频播放器初始化完成')
      console.log('obeyMuteSwitch:', this.innerAudio.obeyMuteSwitch)
      console.log('autoplay:', this.innerAudio.autoplay)
    } catch (error) {
      console.error('初始化音频播放器失败:', error)
    }
  }

  /**
   * 更新播放状态
   */
  private updatePlayState(updates: Partial<PlayState>) {
    this.playState = { ...this.playState, ...updates }
    this.playStateListeners.forEach(listener => listener(this.playState))
  }

  /**
   * 计算音量（用于波形显示）
   */
  private calculateVolume(buffer: any): number {
    // 简化版：实际使用时可以根据音频帧数据计算真实的音量
    // 这里返回 0-1 之间的数值，表示音量大小
    return Math.random() * 0.5 + 0.3
  }

  /**
   * 音量变化回调（可外部覆盖）
   */
  protected onVolumeChanged(volume: number) {
    // 默认不处理，外部可以覆盖此方法
  }

  /**
   * 开始录音
   * @param options 录音选项
   * @returns Promise<void>
   */
  async startRecording(options?: Partial<typeof VOICE_CONFIG.record>): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('=== voiceService.startRecording ===')

        // 清除之前的 resolve/reject
        this.startResolve = null
        this.startReject = null
        this.stopResolve = null
        this.cancelResolve = null

        // 保存 resolve/reject
        this.startResolve = resolve
        this.startReject = reject

        // 获取配置
        const config = { ...VOICE_CONFIG.record, ...options }
        console.log('录音配置:', config)

        // 直接调用 start，让录音管理器自己管理状态
        console.log('调用 recorderManager.start()')
        this.recorderManager.start(config)
      } catch (error) {
        console.error('startRecording 异常:', error)
        reject(error)
      }
    })
  }

  /**
   * 停止录音并识别
   * @returns Promise<ASRResult> 语音识别结果
   */
  async stopRecording(): Promise<ASRResult & { tempFilePath?: string }> {
    return new Promise((resolve, reject) => {
      try {
        console.log('=== voiceService.stopRecording ===')
        console.log('当前模式:', VOICE_CONFIG.mode)

        // 清除之前的回调
        this.startResolve = null
        this.startReject = null

        // 保存 stop 的 resolve
        this.stopResolve = async (res: any) => {
          console.log('录音停止回调:', res)

          // 检查是否有错误
          if (!res || res.error || !res.tempFilePath) {
            console.error('录音失败，无法获取录音文件:', res)
            resolve({
              success: false,
              text: '',
              errorMessage: '录音失败，请重试'
            })
            return
          }

          console.log('录音文件:', res.tempFilePath)
          console.log('录音时长:', res.duration)
          console.log('文件大小:', res.fileSize)

          // 检查录音时长，太短可能是误操作
          if (res.duration < 500) {
            console.warn('录音时长太短:', res.duration)
            resolve({
              success: false,
              text: '',
              errorMessage: '录音时间太短，请重新录音'
            })
            return
          }

          // 如果是实时模式，直接返回文件路径
          if (VOICE_CONFIG.mode === 'doubao-realtime') {
            console.log('实时模式：返回音频文件路径')
            resolve({
              success: true,
              text: '',
              tempFilePath: res.tempFilePath
            })
            return
          }

          // 否则进行语音识别
          const result = await this.recognizeSpeech(res.tempFilePath, res.duration)

          resolve(result)
        }

        this.cancelResolve = null

        // 停止录音
        this.recorderManager.stop()

        // 设置超时，防止 stop 没有响应
        setTimeout(() => {
          if (this.stopResolve) {
            console.warn('停止录音超时')
            this.stopResolve = null
            reject({ errMsg: 'stop timeout' })
          }
        }, 5000)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 取消录音（不进行识别）
   * @returns Promise<void>
   */
  async cancelRecording(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('=== voiceService.cancelRecording ===')

        // 清除之前的回调
        this.startResolve = null
        this.startReject = null
        this.stopResolve = null

        // 保存 cancel 的 resolve
        this.cancelResolve = () => {
          console.log('录音已取消')
          resolve()
        }

        // 停止录音
        this.recorderManager.stop()

        // 设置超时
        setTimeout(() => {
          if (this.cancelResolve) {
            console.warn('取消录音超时')
            this.cancelResolve = null
            resolve()
          }
        }, 5000)
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 切换语音服务模式
   * @param mode 'doubao-cascade' | 'glm-asr' | 'doubao-realtime'
   */
  switchMode(mode: 'doubao-cascade' | 'glm-asr' | 'doubao-realtime'): void {
    console.log('切换语音服务模式:', mode)
    VOICE_CONFIG.mode = mode
  }

  /**
   * 获取当前模式
   * @returns 当前模式
   */
  getMode(): 'doubao-cascade' | 'glm-asr' | 'doubao-realtime' {
    return VOICE_CONFIG.mode
  }

  /**
   * 语音识别
   * 根据配置使用 GLM-ASR 或 豆包 ASR 进行语音识别
   * @param audioFilePath 音频文件路径
   * @param duration 录音时长（毫秒）
   * @returns Promise<ASRResult> 识别结果
   */
  private async recognizeSpeech(
    audioFilePath: string,
    duration: number
  ): Promise<ASRResult> {
    try {
      console.log('=== 开始语音识别 ===')
      console.log('音频文件:', audioFilePath)
      console.log('录音时长:', duration, 'ms')
      console.log('使用模式:', VOICE_CONFIG.mode)

      // 根据配置选择 ASR 服务
      if (VOICE_CONFIG.mode === 'doubao-cascade') {
        return await this.doubaoASR(audioFilePath, duration)
      } else {
        return await this.glmASR(audioFilePath, duration)
      }
    } catch (error) {
      console.error('语音识别失败:', error)
      return {
        success: false,
        text: '',
        errorMessage: error instanceof Error ? error.message : '语音识别失败'
      }
    }
  }

  /**
   * GLM-ASR 语音识别（备用）
   * @param audioFilePath 音频文件路径
   * @param duration 录音时长（毫秒）
   * @returns Promise<ASRResult> 识别结果
   */
  private async glmASR(
    audioFilePath: string,
    duration: number
  ): Promise<ASRResult> {
    try {
      console.log('=== 开始 GLM-ASR 语音识别 ===')

      // 检查 API Key 是否配置
      const apiKey = VOICE_CONFIG.glmAsr.apiKey
      if (!apiKey) {
        console.error('GLM-ASR API Key 未配置')
        return {
          success: false,
          text: '',
          errorMessage: '请配置 GLM-ASR API Key'
        }
      }

      // 使用 Taro.uploadFile 上传音频文件到 GLM-ASR API
      const uploadResult = await new Promise<any>((resolve, reject) => {
        Taro.uploadFile({
          url: VOICE_CONFIG.glmAsr.baseUrl,
          filePath: audioFilePath,
          name: 'file',
          formData: {
            model: VOICE_CONFIG.glmAsr.model,
            stream: 'false'
          },
          header: {
            'Authorization': `Bearer ${apiKey}`
          },
          success: (res: any) => {
            console.log('上传成功，状态码:', res.statusCode)
            console.log('响应数据:', res.data)
            resolve(res)
          },
          fail: (err: any) => {
            console.error('上传失败:', err)
            reject(err)
          }
        })
      })

      // 检查 HTTP 状态码
      if (uploadResult.statusCode !== 200) {
        console.error('GLM-ASR API 返回错误状态码:', uploadResult.statusCode)
        return {
          success: false,
          text: '',
          errorMessage: `API 错误: ${uploadResult.statusCode}`
        }
      }

      // 解析响应数据
      let responseText = uploadResult.data
      if (typeof responseText === 'string') {
        try {
          responseText = JSON.parse(responseText)
        } catch (e) {
          console.error('解析响应数据失败:', e)
          return {
            success: false,
            text: '',
            errorMessage: '解析响应数据失败'
          }
        }
      }

      // 检查 API 是否返回错误
      if (responseText.error) {
        console.error('GLM-ASR API 返回错误:', responseText.error)
        return {
          success: false,
          text: '',
          errorMessage: responseText.error.message || '语音识别失败'
        }
      }

      // 提取识别结果
      const recognizedText = responseText.text || ''
      console.log('=== GLM-ASR 识别结果:', recognizedText, '===')

      return {
        success: true,
        text: recognizedText,
        confidence: 0.95
      }
    } catch (error) {
      console.error('GLM-ASR 语音识别失败:', error)
      return {
        success: false,
        text: '',
        errorMessage: error instanceof Error ? error.message : '语音识别失败'
      }
    }
  }

  /**
   * 语音合成
   * @param text 要合成的文本
   * @returns Promise<TTSResult> 合成结果
   */
  async synthesizeSpeech(text: string): Promise<TTSResult> {
    try {
      console.log('=== 开始语音合成 ===')
      console.log('文本:', text)

      // 如果使用豆包级联模式，调用豆包 TTS
      if (VOICE_CONFIG.mode === 'doubao-cascade') {
        return await this.doubaoTTS(text)
      }

      // 模拟网络请求延迟
      await this.delay(500)

      // 返回模拟的合成结果
      const mockAudioUrl = ''
      const mockDuration = Math.ceil(text.length * 200) // 估算时长

      console.log('=== 合成完成，时长:', mockDuration, 'ms', '===')

      return {
        success: true,
        audioUrl: mockAudioUrl,
        duration: mockDuration
      }
    } catch (error) {
      console.error('语音合成失败:', error)
      return {
        success: false,
        errorMessage: '语音合成失败'
      }
    }
  }

  /**
   * 豆包 ASR - 语音识别（文件识别 API）
   * @param audioFilePath 音频文件路径
   * @param duration 录音时长（毫秒）
   * @returns Promise<ASRResult> 识别结果
   */
  private async doubaoASR(audioFilePath: string, duration: number): Promise<ASRResult> {
    try {
      console.log('=== 开始豆包 ASR 语音识别 ===')
      console.log('音频文件:', audioFilePath)
      console.log('录音时长:', duration, 'ms')

      const config = VOICE_CONFIG.doubao.asr

      // 检查配置
      if (!config.appId || !config.accessKey) {
        console.error('豆包 ASR 配置不完整')
        return {
          success: false,
          text: '',
          errorMessage: '请配置豆包 App ID 和 Access Key'
        }
      }

      // 使用极速版 API 格式
      const appId = config.appId
      const resourceId = 'volc.bigasr.auc_turbo'

      // 生成 UUID
      const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0
          const v = c === 'x' ? r : (r & 0x3 | 0x8)
          return v.toString(16)
        })
      }

      console.log('=== 豆包 ASR 极速版请求信息 ===')
      console.log('API URL:', config.baseUrl)
      console.log('config.appId 原始值:', config.appId)
      console.log('config.appId 类型:', typeof config.appId)
      console.log('config.appId 长度:', config.appId?.length)
      console.log('App ID:', appId)
      console.log('Access Key (前10位):', config.accessKey.substring(0, 10) + '...')
      console.log('Resource ID:', resourceId)
      console.log('音频文件路径:', audioFilePath)

      // 读取音频文件并转换为 base64
      const readFileBase64 = (): Promise<string> => {
        return new Promise((resolve, reject) => {
          Taro.getFileSystemManager().readFile({
            filePath: audioFilePath,
            encoding: 'base64',
            success: (res: any) => {
              console.log('音频文件读取成功，大小:', res.data.length, '字符')
              resolve(res.data)
            },
            fail: (err: any) => {
              console.error('读取音频文件失败:', err)
              reject(err)
            }
          })
        })
      }

      const audioBase64 = await readFileBase64()

      // 构建请求体
      const requestBody = {
        user: {
          uid: appId
        },
        audio: {
          data: audioBase64
        },
        request: {
          model_name: 'bigmodel'
        }
      }

      console.log('请求体:', JSON.stringify(requestBody, null, 2))

      // 生成请求 ID
      const requestId = generateUUID()

      const submitResult = await new Promise<any>((resolve, reject) => {
        Taro.request({
          url: config.baseUrl,
          method: 'POST',
          header: {
            'Content-Type': 'application/json',
            'X-Api-App-Key': appId,
            'X-Api-Access-Key': config.accessKey,
            'X-Api-Resource-Id': resourceId,
            'X-Api-Request-Id': requestId,
            'X-Api-Sequence': '-1'
          },
          data: requestBody,
          success: (res: any) => {
            console.log('豆包 ASR 提交成功，HTTP状态码:', res.statusCode)
            console.log('响应头:', res.header)
            console.log('响应数据:', res.data)
            resolve(res)
          },
          fail: (err: any) => {
            console.error('豆包 ASR 提交失败:', err)
            reject(err)
          }
        })
      })

      // 检查 HTTP 状态码
      if (submitResult.statusCode !== 200) {
        console.error('豆包 ASR API 返回错误状态码:', submitResult.statusCode)
        console.error('响应头:', submitResult.header)
        console.error('响应数据:', submitResult.data)
        return {
          success: false,
          text: '',
          errorMessage: `HTTP 错误: ${submitResult.statusCode}`
        }
      }

      // 检查 API 状态码（从响应头中获取）
      const apiStatusCode = submitResult.header['X-Api-Status-Code'] || submitResult.header['x-api-status-code']
      console.log('API 状态码:', apiStatusCode)

      if (apiStatusCode !== '20000000') {
        const apiMessage = submitResult.header['X-Api-Message'] || submitResult.header['x-api-message']
        console.error('豆包 ASR API 返回错误，状态码:', apiStatusCode)
        console.error('错误信息:', apiMessage)
        return {
          success: false,
          text: '',
          errorMessage: `API 错误: ${apiStatusCode} - ${apiMessage || '未知错误'}`
        }
      }

      // 解析响应数据
      const responseText = submitResult.data

      // 提取识别结果
      const recognizedText = responseText.result?.text || ''
      console.log('=== 豆包 ASR 识别结果:', recognizedText, '===')

      return {
        success: true,
        text: recognizedText,
        confidence: 0.95
      }
    } catch (error) {
      console.error('豆包 ASR 语音识别失败:', error)
      return {
        success: false,
        text: '',
        errorMessage: error instanceof Error ? error.message : '语音识别失败'
      }
    }
  }

  /**
   * 豆包 LLM - 文本生成
   * @param prompt 用户问题
   * @returns Promise<string> 生成结果
   */
  private async doubaoLLM(prompt: string): Promise<string> {
    try {
      console.log('=== 开始豆包 LLM 文本生成 ===')
      console.log('问题:', prompt)

      const config = VOICE_CONFIG.doubao.llm

      // 检查配置
      if (!config.apiKey) {
        console.error('豆包 LLM API Key 未配置')
        throw new Error('请配置豆包 Access Key')
      }

      // 构建儿童友好的系统提示
      const systemMessage = {
        role: 'system',
        content: '你是一个儿童友好的问答助手。请用简单、生动、有趣的语言回答小朋友的问题，语气温柔亲切。回答要适合3-8岁的儿童理解，避免复杂的专业术语。如果遇到不适合儿童的内容，请温柔地引导他们问其他问题。'
      }

      // 调用豆包 LLM API（OpenAI 兼容）
      const response = await new Promise<any>((resolve, reject) => {
        Taro.request({
          url: `${config.baseUrl}/chat/completions`,
          method: 'POST',
          header: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
          },
          data: {
            model: config.model,
            messages: [
              systemMessage,
              { role: 'user', content: prompt }
            ],
            max_tokens: config.maxTokens,
            temperature: config.temperature
          },
          success: (res: any) => {
            console.log('豆包 LLM 响应:', res.data)
            resolve(res.data)
          },
          fail: (err: any) => {
            console.error('豆包 LLM 请求失败:', err)
            reject(err)
          }
        })
      })

      // 提取生成结果
      const result = response.choices?.[0]?.message?.content || ''
      console.log('=== 豆包 LLM 生成结果:', result, '===')

      return result
    } catch (error) {
      console.error('豆包 LLM 文本生成失败:', error)
      throw error
    }
  }

  /**
   * 豆包 TTS - 语音合成
   * @param text 要合成的文本
   * @returns Promise<TTSResult> 合成结果
   */
  private async doubaoTTS(text: string): Promise<TTSResult> {
    try {
      console.log('=== 开始豆包 TTS 语音合成 ===')
      console.log('文本:', text)

      const config = VOICE_CONFIG.doubao.tts

      // 检查配置
      if (!config.appId || !config.accessKey) {
        console.error('豆包 TTS 配置不完整')
        return {
          success: false,
          errorMessage: '请配置豆包 App ID 和 Access Key'
        }
      }

      // 生成请求 ID
      const generateUUID = () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0
          const v = c === 'x' ? r : (r & 0x3 | 0x8)
          return v.toString(16)
        })
      }
      const requestId = generateUUID()

      // 调用豆包 TTS API（HTTP 非流式接口）
      const fullUrl = `${config.baseUrl}/tts`
      console.log('=== TTS 完整 URL:', fullUrl, '===')
      console.log('TTS baseUrl:', config.baseUrl)

      const requestData = {
        app: {
          appid: config.appId,
          token: config.accessKey,
          cluster: 'volcano_tts'  // 内置音色使用 volcano_tts 集群
        },
        user: {
          uid: 'user_001'  // 用户标识
        },
        audio: {
          voice_type: config.voiceType,
          encoding: 'mp3',  // 改用 mp3 格式，微信小程序支持更好
          speed_ratio: config.speed,
          volume_ratio: 1.0,
          pitch_ratio: config.pitch
        },
        request: {
          reqid: requestId,  // 使用 UUID
          text: text,
          text_type: 'plain',
          operation: 'query'  // query 模式：HTTP 非流式合成
        }
      }
      console.log('=== TTS 请求参数 ===')
      console.log(JSON.stringify(requestData, null, 2))

      const response = await new Promise<any>((resolve, reject) => {
        Taro.request({
          url: fullUrl,
          method: 'POST',
          header: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer;${config.accessKey}`  // 官方文档推荐格式：Bearer;{token}
          },
          data: requestData,
          success: (res: any) => {
            console.log('豆包 TTS 响应，状态码:', res.statusCode)
            console.log('响应数据:', res.data)
            if (res.statusCode === 200) {
              resolve(res)
            } else {
              reject({ statusCode: res.statusCode, data: res.data })
            }
          },
          fail: (err: any) => {
            console.error('豆包 TTS 请求失败:', err)
            reject(err)
          }
        })

        console.log('=== TTS 请求头 ===')
        console.log('Authorization:', `Bearer;${config.accessKey}`)
      })

      // 解析响应数据
      const result = response.data

      // 检查是否返回了错误
      // VolcEngine TTS 返回 code: 3000 表示成功，code: 3001 表示失败
      if (result.code === 3001) {
        console.error('豆包 TTS 返回错误:', result)
        return {
          success: false,
          errorMessage: result.message || result.msg || '语音合成失败'
        }
      }

      // 获取 base64 音频数据（API 返回 base64 编码的音频）
      const base64Audio = result.data || ''

      if (!base64Audio) {
        console.error('豆包 TTS 未返回音频数据')
        console.error('完整响应:', result)
        return {
          success: false,
          errorMessage: '语音合成失败：未返回音频数据'
        }
      }

      console.log('=== 豆包 TTS 合成完成，收到 base64 数据，长度:', base64Audio.length, '===')
      console.log('音频数据前100个字符（用于检查）:', base64Audio.substring(0, 100))

      // 直接保存为 MP3 文件（不需要转换）
      const audioData = base64Audio
      console.log('音频数据大小:', audioData.length, '字符（base64）')

      // 估算 MP3 文件大小（base64 解码后约为原来的 3/4）
      const estimatedSize = Math.floor(audioData.length * 0.75)
      console.log('预计 MP3 文件大小:', estimatedSize, '字节')
      console.log('预计音频时长:', Math.ceil(text.length * 0.15), '秒（按每秒约 6-7 字计算）')

      // 生成临时文件路径（使用 .mp3 扩展名）
      const timestamp = Date.now()
      const fileName = `tts_audio_${timestamp}.mp3`
      const tempDir = `${Taro.env.USER_DATA_PATH}/temp`
      const audioFilePath = `${tempDir}/${fileName}`

      try {
        // 确保临时目录存在
        const fs = Taro.getFileSystemManager()
        try {
          fs.accessSync(tempDir)
          console.log('临时目录已存在:', tempDir)
        } catch (e) {
          // 目录不存在，创建目录
          console.log('创建临时目录:', tempDir)
          fs.mkdirSync(tempDir, true)
        }

        // 将 MP3 数据写入临时文件（直接使用 base64）
        console.log('写入音频文件:', audioFilePath)
        console.log('MP3 数据大小:', audioData.length, '字符（base64）')

        // 使用 writeFileSync 写入 base64 数据，指定 base64 编码
        fs.writeFileSync(audioFilePath, audioData, 'base64')
        console.log('=== 音频已保存到临时文件:', audioFilePath, '===')

        // 验证文件是否成功写入
        try {
          const stat = fs.statSync(audioFilePath)
          console.log('文件已保存，大小:', stat.size, '字节')

          // 如果文件大小太小，说明有问题
          if (stat.size < 1000) {
            console.error('警告：音频文件太小，可能有问题')
          }
        } catch (e) {
          console.error('无法获取文件状态:', e)
        }

        return {
          success: true,
          audioUrl: audioFilePath,
          duration: Math.ceil(text.length * 200) // 估算时长
        }
      } catch (fileError) {
        console.error('保存音频文件失败:', fileError)
        return {
          success: false,
          errorMessage: '语音合成失败：无法保存音频文件'
        }
      }
    } catch (error) {
      console.error('豆包 TTS 语音合成失败:', error)
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : '语音合成失败'
      }
    }
  }

  /**
   * 豆包级联模式 - 完整的语音对话流程
   * @param audioFilePath 音频文件路径
   * @param duration 录音时长（毫秒）
   * @returns Promise<{ text: string, audioUrl?: string }> 识别结果和合成音频
   */
  async doubaoCascade(audioFilePath: string, duration: number): Promise<{ text: string, audioUrl?: string }> {
    try {
      // 第一步：语音识别 (ASR)
      const asrResult = await this.doubaoASR(audioFilePath, duration)
      if (!asrResult.success || !asrResult.text) {
        throw new Error(asrResult.errorMessage || '语音识别失败')
      }

      const recognizedText = asrResult.text

      // 第二步：文本生成 (LLM)
      const answer = await this.doubaoLLM(recognizedText)

      // 第三步：语音合成 (TTS)
      const ttsResult = await this.doubaoTTS(answer)

      if (!ttsResult.success) {
        throw new Error(ttsResult.errorMessage || '语音合成失败')
      }

      return {
        text: answer,
        audioUrl: ttsResult.audioUrl
      }
    } catch (error) {
      console.error('豆包级联模式失败:', error)
      throw error
    }
  }

  /**
   * 生成签名（用于豆包 ASR 认证）
   * @param appId App ID
   * @param accessKey Access Key
   * @param timestamp 时间戳
   * @returns Promise<string> 签名
   */
  private async generateSignature(appId: string, accessKey: string, timestamp: string): Promise<string> {
    // 简化版签名生成，实际应根据豆包 API 文档实现
    // 这里返回 base64(appId + accessKey + timestamp)
    const str = appId + accessKey + timestamp
    const signature = Taro.base64ToArrayBuffer?.(str) || btoa(str)
    return typeof signature === 'string' ? signature : String(signature)
  }

  /**
   * 保存 base64 音频数据为临时文件
   * @param base64Data base64 音频数据
   * @returns Promise<string> 临时文件路径
   */
  private async saveBase64Audio(base64Data: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const tempFilePath = `${Taro.env.USER_DATA_PATH}/tts_${Date.now()}.mp3`
      const fs = Taro.getFileSystemManager()

      fs.writeFile({
        filePath: tempFilePath,
        data: base64Data,
        encoding: 'base64',
        success: () => {
          console.log('音频文件保存成功:', tempFilePath)
          resolve(tempFilePath)
        },
        fail: (err) => {
          console.error('保存音频文件失败:', err)
          reject(err)
        }
      })
    })
  }

  /**
   * 播放语音
   * @param audioUrl 音频 URL
   * @param messageId 消息 ID（用于跟踪播放状态）
   */
  play(audioUrl: string, messageId?: string): void {
    try {
      console.log('=== voiceService.play ===')
      console.log('音频路径:', audioUrl)
      console.log('消息 ID:', messageId)

      // 停止并销毁旧的音频实例（如果存在）
      if (this.innerAudio) {
        try {
          console.log('停止旧音频实例')
          this.innerAudio.stop()
          this.innerAudio.destroy()
        } catch (err) {
          console.warn('停止/销毁旧音频实例时出错，忽略:', err)
        }
        this.innerAudio = null
      }

      // 创建新的音频实例
      this.initAudioPlayer()

      // 确保 audio player 已成功初始化
      if (!this.innerAudio) {
        console.error('音频播放器初始化失败')
        return
      }

      // 设置音频源
      console.log('设置音频源:', audioUrl)
      this.innerAudio.src = audioUrl

      // 设置音量（0.0-1.0）
      this.innerAudio.volume = 1.0
      console.log('设置播放音量为:', this.innerAudio.volume)

      // 重要：设置不遵循静音开关，确保静音模式下也能播放
      this.innerAudio.obeyMuteSwitch = false
      console.log('设置 obeyMuteSwitch 为:', this.innerAudio.obeyMuteSwitch)

      // 监听音频时长（调试用）
      setTimeout(() => {
        const duration = this.innerAudio.duration
        console.log('音频时长:', duration, '秒')
        console.log('当前音量:', this.innerAudio.volume)
        console.log('obeyMuteSwitch:', this.innerAudio.obeyMuteSwitch)
        if (duration === 0 || isNaN(duration)) {
          console.error('音频时长异常，可能是音频文件损坏')
        }
      }, 200)

      // 设置当前消息 ID
      this.updatePlayState({
        currentMessageId: messageId || null,
        progress: 0
      })

      // 等待音频加载完成后再播放
      const playWhenReady = () => {
        console.log('开始播放音频...')
        console.log('当前音量:', this.innerAudio.volume)
        this.innerAudio.play()
      }

      // 检查是否已经可以播放
      setTimeout(() => {
        // 直接尝试播放，InnerAudioContext 会自动处理加载
        playWhenReady()
      }, 300)
    } catch (error) {
      console.error('播放失败:', error)
    }
  }

  /**
   * 暂停播放
   */
  pause(): void {
    try {
      if (this.innerAudio && this.playState.isPlaying) {
        this.innerAudio.pause()
      }
    } catch (error) {
      console.error('暂停失败:', error)
    }
  }

  /**
   * 恢复播放
   */
  resume(): void {
    try {
      if (this.innerAudio && !this.playState.isPlaying) {
        this.innerAudio.play()
      }
    } catch (error) {
      console.error('恢复播放失败:', error)
    }
  }

  /**
   * 停止播放
   */
  stop(): void {
    try {
      if (this.innerAudio) {
        this.innerAudio.stop()
        this.updatePlayState({
          isPlaying: false,
          progress: 0,
          currentMessageId: null
        })
      }
    } catch (error) {
      console.error('停止播放失败:', error)
    }
  }

  /**
   * 获取当前播放状态
   */
  getPlayState(): PlayState {
    return { ...this.playState }
  }

  /**
   * 订阅播放状态变化
   */
  onPlayStateChange(listener: (state: PlayState) => void): () => void {
    this.playStateListeners.push(listener)
    return () => {
      const index = this.playStateListeners.indexOf(listener)
      if (index > -1) {
        this.playStateListeners.splice(index, 1)
      }
    }
  }

  /**
   * 将 PCM 数据转换为 WAV 格式
   * @param pcmData PCM 音频数据
   * @param sampleRate 采样率
   * @param numChannels 声道数
   * @param bitsPerSample 位深
   * @returns WAV 格式的 ArrayBuffer
   */
  private pcmToWav(pcmData: ArrayBuffer, sampleRate: number, numChannels: number, bitsPerSample: number): ArrayBuffer {
    const pcmView = new Uint8Array(pcmData)
    const pcmLength = pcmData.byteLength
    const wavLength = 44 + pcmLength  // 44 字节 WAV 头 + PCM 数据
    const wavBuffer = new ArrayBuffer(wavLength)
    const wavView = new DataView(wavBuffer)

    // RIFF 头 (12 字节)
    this.writeString(wavView, 0, 'RIFF')
    wavView.setUint32(4, wavLength - 8, true)  // 文件大小 - 8
    this.writeString(wavView, 8, 'WAVE')

    // fmt chunk (24 字节)
    this.writeString(wavView, 12, 'fmt ')
    wavView.setUint32(16, 16, true)  // fmt chunk 大小
    wavView.setUint16(20, 1, true)   // 音频格式: 1 = PCM
    wavView.setUint16(22, numChannels, true)  // 声道数
    wavView.setUint32(24, sampleRate, true)  // 采样率
    const byteRate = sampleRate * numChannels * bitsPerSample / 8
    wavView.setUint32(28, byteRate, true)  // 字节率
    const blockAlign = numChannels * bitsPerSample / 8
    wavView.setUint16(32, blockAlign, true)  // 块对齐
    wavView.setUint16(34, bitsPerSample, true)  // 位深

    // data chunk (8 字节)
    this.writeString(wavView, 36, 'data')
    wavView.setUint32(40, pcmLength, true)  // 数据大小

    // 写入 PCM 数据
    const wavBytes = new Uint8Array(wavBuffer)
    wavBytes.set(pcmView, 44)

    return wavBuffer
  }

  /**
   * 将字符串写入 DataView
   * @param view DataView
   * @param offset 偏移量
   * @param string 字符串
   */
  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  /**
   * 播放文本（自动合成并播放）
   * @param text 要播放的文本
   * @param messageId 消息 ID
   */
  async playText(text: string, messageId?: string): Promise<void> {
    try {
      console.log('=== voiceService.playText ===')
      console.log('文本:', text)
      console.log('消息 ID:', messageId)

      // 1. 合成语音
      console.log('开始合成语音...')
      const result = await this.synthesizeSpeech(text)

      console.log('合成结果:', result)

      if (!result.success || !result.audioUrl) {
        console.error('语音合成失败:', result.errorMessage)
        throw new Error(result.errorMessage || '语音合成失败')
      }

      console.log('合成成功，音频路径:', result.audioUrl)

      // 2. 播放语音
      console.log('开始播放语音...')
      this.play(result.audioUrl, messageId)
    } catch (error) {
      console.error('播放文本失败:', error)
      throw error
    }
  }

  /**
   * 工具方法：延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 连接豆包实时语音服务
   * @returns Promise<void>
   */
  async connectRealtimeService(): Promise<void> {
    console.log('=== 连接豆包实时语音服务 ===')
    return await doubaoRealtimeService.connect()
  }

  /**
   * 断开豆包实时语音服务
   */
  disconnectRealtimeService(): void {
    console.log('=== 断开豆包实时语音服务 ===')
    doubaoRealtimeService.disconnect()
  }

  /**
   * 开始实时语音会话
   */
  startRealtimeSession(): void {
    console.log('=== 开始实时语音会话 ===')
    doubaoRealtimeService.startSession()
  }

  /**
   * 结束实时语音会话
   */
  endRealtimeSession(): void {
    console.log('=== 结束实时语音会话 ===')
    doubaoRealtimeService.endSession()
  }

  /**
   * 发送音频数据到实时服务
   * @param audioFilePath 音频文件路径
   */
  async sendAudioToRealtime(audioFilePath: string): Promise<void> {
    try {
      console.log('=== 发送音频到实时服务 ===')
      console.log('音频文件:', audioFilePath)

      // 读取音频文件
      const audioData = await new Promise<ArrayBuffer>((resolve, reject) => {
        Taro.getFileSystemManager().readFile({
          filePath: audioFilePath,
          success: (res: any) => {
            resolve(res.data)
          },
          fail: (err: any) => {
            console.error('读取音频文件失败:', err)
            reject(err)
          }
        })
      })

      // 如果是 WAV 文件，提取 PCM 数据（WAV 有 44 字节的头部）
      const pcmData = this.extractPCMFromWAV(audioData)

      console.log('发送 PCM 数据，长度:', pcmData.byteLength)

      // 发送到实时服务
      doubaoRealtimeService.sendAudio(pcmData)
    } catch (error) {
      console.error('发送音频到实时服务失败:', error)
      throw error
    }
  }

  /**
   * 从 WAV 文件中提取 PCM 数据
   * WAV 文件格式：
   * - 前 44 字节是 WAV 头部
   * - 44 字节之后是 PCM 数据
   */
  private extractPCMFromWAV(wavData: ArrayBuffer): ArrayBuffer {
    // WAV 头部是 44 字节，PCM 数据从第 44 字节开始
    const headerSize = 44

    if (wavData.byteLength <= headerSize) {
      console.warn('WAV 文件过小，可能是无效的文件')
      return wavData
    }

    // 返回 PCM 数据部分
    return wavData.slice(headerSize)
  }

  /**
   * 设置实时语音服务回调
   */
  setRealtimeCallbacks(callbacks: {
    onASRResult?: (result: RealtimeASRResult) => void
    onChatResponse?: (result: ChatResult) => void
    onTTSResult?: (result: RealtimeTTSResult) => void
    onError?: (error: string) => void
  }): void {
    doubaoRealtimeService.setCallbacks(callbacks)
  }

  /**
   * 获取实时服务状态
   */
  getRealtimeState(): string {
    return doubaoRealtimeService.getState()
  }

  /**
   * 销毁服务，释放资源
   */
  destroy() {
    try {
      // 停止录音
      if (this.recorderManager) {
        this.recorderManager.stop()
      }

      // 停止播放
      if (this.innerAudio) {
        this.innerAudio.stop()
        this.innerAudio.destroy()
      }

      // 清理监听器
      this.playStateListeners = []
    } catch (error) {
      console.error('销毁语音服务失败:', error)
    }
  }
}

// 导出单例
export const voiceService = new VoiceService()

// 初始化实时语音服务配置
if (DOUBAO_CONFIG.REALTIME_APP_ID) {
  doubaoRealtimeService.setConfig({
    appId: DOUBAO_CONFIG.REALTIME_APP_ID,
    accessKey: DOUBAO_CONFIG.REALTIME_ACCESS_KEY,
    resourceId: DOUBAO_CONFIG.REALTIME_RESOURCE_ID,
    appKey: DOUBAO_CONFIG.REALTIME_APP_KEY
  })
}

// 导出配置
export { VOICE_CONFIG }
