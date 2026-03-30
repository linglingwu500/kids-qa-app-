import React, { useState, useEffect, useRef } from 'react'
import { View, Text, Textarea, Button, ScrollView, Canvas, Image } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { getChildInfo, saveChildInfo, saveQuestion, updateQuestionWithAnswer } from '../../store/child'
import { generateChildFriendlyAnswer } from '../../services/ai'
import { formatRelativeTime } from '../../utils/format'
import { voiceService, ASRResult } from '../../services/voice'
import { type ASRResult as RealtimeASRResult, type ChatResult, type TTSResult as RealtimeTTSResult } from '../../services/doubao-realtime'
import micIcon from '../../assets/icons/mic.svg'
import keyboardIcon from '../../assets/icons/keyboard.svg'
import sendIcon from '../../assets/icons/send.svg'
import './index.scss'

// 认知发展阶段
const AGE_STAGES = [
  {
    range: [3, 5],
    label: '3-5岁',
    emoji: '🧸',
    desc: '具体形象思维'
  },
  {
    range: [6, 7],
    label: '6-7岁',
    emoji: '📚',
    desc: '逻辑思维萌芽'
  },
  {
    range: [8, 9],
    label: '8-9岁',
    emoji: '🎨',
    desc: '抽象思维开始'
  },
  {
    range: [10, 12],
    label: '10-12岁',
    emoji: '🚀',
    desc: '逻辑思维发展'
  }
]

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  simpleExplanation?: string
  curiosityQuestions?: string[]
  timestamp: string
  isPlaying?: boolean
  showText?: boolean
  isCuriosityQuestion?: boolean // 标记是否为「继续探索」问题
  isStageChange?: boolean // 标记是否为年龄段切换消息
  isLoading?: boolean // 是否是加载中的消息
}

const Index = () => {
  // 先初始化年龄段选择
  const [selectedStage, setSelectedStage] = useState<number>(0) // 默认选中"3-5岁"

  // 根据选择的年龄段获取/初始化孩子信息
  const childInfoData = getChildInfo(selectedStage)
  const [childInfo, setChildInfo] = useState<ChildInfo | null>(childInfoData)

  const [question, setQuestion] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [scrollTop, setScrollTop] = useState(0)
  const [shouldResetHistory, setShouldResetHistory] = useState(false) // 是否需要重置对话历史

  // 状态栏高度
  const [statusBarHeight, setStatusBarHeight] = useState(44)

  // 语音相关状态
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('voice')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordingTimer, setRecordingTimer] = useState<NodeJS.Timeout | null>(null) // 保留state用于调试显示
  const [currentVolume, setCurrentVolume] = useState(0) // 当前音量（0-1）
  const [volumeHistory, setVolumeHistory] = useState<number[]>([]) // 音量历史，用于波形显示
  const [isCancelingRecording, setIsCancelingRecording] = useState(false) // 是否正在上滑取消录音
  const [touchStartY, setTouchStartY] = useState(0) // 触摸开始Y坐标

  // 使用 useRef 来同步状态，避免 useState 异步更新的问题
  const isRecordingRef = React.useRef(false)
  const isCancelingRecordingRef = React.useRef(false)
  const recordingStartedRef = React.useRef(false) // 跟踪录音是否真的启动成功了
  const isStoppingRecordingRef = React.useRef(false) // 防止重复停止录音
  const handleVoiceTouchEndCalledRef = React.useRef(false) // 防止重复调用 handleVoiceTouchEnd
  const handleVoiceTouchEndTimestampRef = React.useRef(0) // 记录上次调用的时间戳
  const stopRecordingAndSendTimestampRef = React.useRef(0) // 记录 stopRecordingAndSend 上次调用的时间戳

  // 定时器引用（使用 ref 确保在异步函数中能访问到最新值）
  const recordingTimerRef = React.useRef<NodeJS.Timeout | null>(null)
  const volumeTimerRef = React.useRef<NodeJS.Timeout | null>(null)

  // 跟踪当前播放的消息（用于在播放结束时触发继续探索问题）
  const currentPlayingMessageRef = React.useRef<ChatMessage | null>(null)

  // 音频播放器
  const [innerAudio, setInnerAudio] = useState<Taro.InnerAudioContext | null>(null)
  const [playProgress, setPlayProgress] = useState(0) // 播放进度（0-1）
  const [playDuration, setPlayDuration] = useState(0) // 总时长（秒）

  // 实时语音服务状态
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [realtimeSessionActive, setRealtimeSessionActive] = useState(false)
  const [realtimeAsrText, setRealtimeAsrText] = useState('') // 实时识别文本
  const [realtimeChatText, setRealtimeChatText] = useState('') // 实时聊天回复文本
  const [isRealtimeSpeaking, setIsRealtimeSpeaking] = useState(false) // 是否正在播放 AI 回复

  const router = useRouter()

  // ScrollView ref，用于滚动控制
  const scrollViewRef = React.useRef<any>(null)

  console.log('=== Index 组件 ===')

  // 获取系统信息（状态栏高度）
  useEffect(() => {
    try {
      const systemInfo = Taro.getSystemInfoSync()
      console.log('系统信息:', systemInfo)
      setStatusBarHeight(systemInfo.statusBarHeight || 44)
    } catch (error) {
      console.error('获取系统信息失败:', error)
      setStatusBarHeight(44)
    }
  }, [])

  // 初始化年龄段选择
  useEffect(() => {
    try {
      const savedStage = Taro.getStorageSync('selected_age_stage')
      if (savedStage && savedStage !== '') {
        setSelectedStage(parseInt(savedStage))
      }
      // 默认已为0（3-5岁），无需额外设置
    } catch (error) {
      console.error('设置阶段失败:', error)
    }
  }, [])

  // 每次显示页面时刷新数据
  useEffect(() => {
    try {
      const refreshData = () => {
        const info = getChildInfo()
        console.log('刷新数据 - childInfo:', info)
        setChildInfo(info)
      }
      refreshData()
    } catch (error) {
      console.error('刷新数据失败:', error)
    }
  }, [])

  // 初始化音频播放器
  useEffect(() => {
    try {
      const audio = Taro.createInnerAudioContext()
      setInnerAudio(audio)

      return () => {
        audio.stop()
        audio.destroy()
      }
    } catch (error) {
      console.error('初始化音频播放器失败:', error)
    }
  }, [])

  // ========== 自动滚动功能 ==========

  // 精确滚动到底部，让最后一条消息刚好完整显示
  const scrollToBottom = React.useCallback(() => {
    Taro.createSelectorQuery()
      .select('.chat-section')
      .scrollOffset()
      .exec((res) => {
        if (res && res[0]) {
          const { scrollHeight } = res[0]

          // 简化计算：
          // 占位符高度 120px
          // 最后一条消息底部需要距离输入框顶部约 20px
          // 所以滚动位置 = scrollHeight - 120 + 20 = scrollHeight - 100
          const spacerHeight = 120 // 占位符高度
          const bottomMargin = 20 // 最后一条消息底部间距
          const targetScrollTop = scrollHeight - spacerHeight + bottomMargin + Date.now() % 100

          console.log(`[滚动] scrollHeight: ${scrollHeight}, targetScrollTop: ${targetScrollTop}`)
          setScrollTop(targetScrollTop)
        }
      })
  }, [])

  // 监听消息变化，自动滚动
  React.useEffect(() => {
    if (chatMessages.length > 0) {
      // 延迟滚动，等待DOM渲染完成
      setTimeout(() => {
        scrollToBottom()
      }, 200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages.length])
  // ========== 自动滚动功能结束 ==========

  // 监听语音播放状态变化
  useEffect(() => {
    const unsubscribe = voiceService.onPlayStateChange((state) => {
      // 更新播放进度
      setPlayProgress(state.progress)
      setPlayDuration(state.duration)

      // 更新消息的播放状态
      if (state.currentMessageId) {
        // 开始播放：记录当前播放的消息
        setChatMessages(prev =>
          prev.map(m => {
            if (m.id === state.currentMessageId) {
              currentPlayingMessageRef.current = m
              return { ...m, isPlaying: true }
            }
            return { ...m, isPlaying: false }
          })
        )
      } else if (!state.isPlaying) {
        // 停止播放：清除所有消息的播放状态
        setChatMessages(prev =>
          prev.map(m => ({ ...m, isPlaying: false }))
        )

        // 检查是否需要播放继续探索问题（只播放第一个）
        const lastMessage = currentPlayingMessageRef.current
        if (lastMessage &&
            lastMessage.role === 'assistant' &&
            lastMessage.curiosityQuestions &&
            lastMessage.curiosityQuestions.length > 0) {
          // 只播放第一个继续探索问题
          const firstQuestion = lastMessage.curiosityQuestions[0]
          console.log('=== 播放继续探索问题（第一个） ===', firstQuestion)

          // 添加一个小延迟，让用户感受到回答已经结束
          setTimeout(() => {
            playCuriosityQuestion(firstQuestion, lastMessage.id)
          }, 500)

          // 清除引用，避免重复播放
          currentPlayingMessageRef.current = null
        }
      }
    })

    return unsubscribe
  }, [])

  // 初始化实时语音服务
  useEffect(() => {
    // 检查是否使用实时模式
    if (voiceService.getMode() !== 'doubao-realtime') {
      console.log('非实时模式，跳过 WebSocket 连接')
      return
    }

    console.log('=== 初始化实时语音服务 ===')

    // 设置回调
    voiceService.setRealtimeCallbacks({
      onASRResult: (result: RealtimeASRResult) => {
        console.log('收到 ASR 结果:', result)
        setRealtimeAsrText(result.text)

        // 如果是最终结果，提交问题
        if (result.isFinal && result.text.trim()) {
          submitQuestionMessage(result.text)
        }
      },
      onChatResponse: (result: ChatResult) => {
        console.log('收到 LLM 回复:', result)
        if (result.text) {
          setRealtimeChatText(prev => prev + result.text)
        }
      },
      onTTSResult: (result: RealtimeTTSResult) => {
        console.log('收到 TTS 结果:', result)

        // 如果有音频数据，播放
        if (result.audioData) {
          playTTSAudio(result.audioData)
        }
      },
      onError: (error: string) => {
        console.error('实时服务错误:', error)
        Taro.showToast({ title: error, icon: 'none' })
      }
    })

    // 连接服务
    const initRealtimeService = async () => {
      try {
        console.log('正在连接实时语音服务...')
        await voiceService.connectRealtimeService()
        setRealtimeConnected(true)
        console.log('实时语音服务连接成功')

        // 启动会话
        voiceService.startRealtimeSession()
        setRealtimeSessionActive(true)
        console.log('实时语音会话已启动')
      } catch (error) {
        console.error('连接实时语音服务失败:', error)
        Taro.showToast({ title: '连接语音服务失败', icon: 'none' })
      }
    }

    initRealtimeService()

    // 清理函数
    return () => {
      console.log('=== 清理实时语音服务 ===')
      voiceService.endRealtimeSession()
      voiceService.disconnectRealtimeService()
      setRealtimeConnected(false)
      setRealtimeSessionActive(false)
    }
  }, [])

  // 播放 TTS 音频
  const playTTSAudio = (audioData: ArrayBuffer) => {
    try {
      if (!innerAudio) {
        console.warn('音频播放器未初始化')
        return
      }

      // 将 PCM 转换为 WAV 格式
      const wavData = pcmToWav(audioData, 16000, 1, 16)

      // 保存为临时文件
      const tempFilePath = `${Taro.env.USER_DATA_PATH}/tts_${Date.now()}.wav`
      Taro.getFileSystemManager().writeFile({
        filePath: tempFilePath,
        data: wavData,
        encoding: 'binary',
        success: () => {
          console.log('TTS 音频保存成功:', tempFilePath)
          innerAudio.src = tempFilePath
          setIsRealtimeSpeaking(true)
          innerAudio.play()
        },
        fail: (err) => {
          console.error('保存 TTS 音频失败:', err)
        }
      })

      // 监听播放结束
      innerAudio.onEnded(() => {
        setIsRealtimeSpeaking(false)
        setRealtimeChatText('')
      })
    } catch (error) {
      console.error('播放 TTS 音频失败:', error)
    }
  }

  // 将 PCM 数据转换为 WAV 格式
  const pcmToWav = (pcmData: ArrayBuffer, sampleRate: number, channels: number, bits: number): ArrayBuffer => {
    const byteRate = sampleRate * channels * bits / 8
    const blockAlign = channels * bits / 8
    const dataSize = pcmData.byteLength
    const bufferSize = 44 + dataSize

    const buffer = new ArrayBuffer(bufferSize)
    const view = new DataView(buffer)

    // RIFF header
    writeString(view, 0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)
    writeString(view, 8, 'WAVE')

    // fmt chunk
    writeString(view, 12, 'fmt ')
    view.setUint32(16, 16, true)  // Subchunk1Size
    view.setUint16(20, 1, true)   // AudioFormat (1 for PCM)
    view.setUint16(22, channels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bits, true)

    // data chunk
    writeString(view, 36, 'data')
    view.setUint32(40, dataSize, true)

    // Write PCM data
    const pcmView = new Uint8Array(pcmData)
    const bufferView = new Uint8Array(buffer)
    bufferView.set(pcmView, 44)

    return buffer
  }

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  const handleInputChange = (e: any) => {
    setQuestion(e.detail.value)
  }

  const handleStageSelect = (index: number) => {
    try {
      if (index !== selectedStage) {
        const stageInfo = AGE_STAGES[index]
        // 标记需要重置对话历史（但不清空UI显示）
        setShouldResetHistory(true)
        setSelectedStage(index)
        Taro.setStorageSync('selected_age_stage', index.toString())

        // 更新孩子信息的年龄
        const stageAgeMap: Record<number, number> = {
          0: 4,  // 3-5岁，默认4岁
          1: 6,  // 6-7岁，默认6岁
          2: 8,  // 8-9岁，默认8岁
          3: 11  // 10-12岁，默认11岁
        }

        if (childInfo) {
          const updatedInfo = {
            ...childInfo,
            age: stageAgeMap[index] || 4,
            stage: index  // 保存年龄段
          }
          setChildInfo(updatedInfo)
          saveChildInfo(updatedInfo)
          console.log('更新孩子信息年龄:', updatedInfo)
        }

        // 只有在用户已经开始输入问题后，才显示年龄切换消息
        if (chatMessages.length > 0) {
          const stageChangeMessage: ChatMessage = {
            id: `stage_change_${Date.now()}`,
            role: 'assistant',
            content: `已切换到${stageInfo.label}回答模式`,
            timestamp: new Date().toISOString(),
            isStageChange: true // 标记为年龄段切换消息
          }
          setChatMessages(prev => [...prev, stageChangeMessage])
        }

        Taro.showToast({ title: `已切换到${stageInfo.label}`, icon: 'success' })
      }
    } catch (error) {
      console.error('选择阶段失败:', error)
    }
  }

  const handleSubmit = async () => {
    try {
      if (!question.trim()) {
        Taro.showToast({ title: '请输入问题', icon: 'none' })
        return
      }

      const userQuestion = question.trim()
      setIsSubmitting(true)

      // 添加用户消息
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: userQuestion,
        timestamp: new Date().toISOString()
      }
      setChatMessages(prev => [...prev, userMessage])
      setQuestion('')

      // 保存问题
      const currentStage = AGE_STAGES[selectedStage]
      const questionData = {
        id: userMessage.id,
        content: userQuestion,
        childName: '小朋友', // 固定称呼，不需要输入名字
        childAge: currentStage ? `${currentStage.range[0]}-${currentStage.range[1]}岁` : '3-5岁',
        childStage: selectedStage,
        createdAt: userMessage.timestamp
      }

      saveQuestion(questionData)

      // 调用 AI 生成回答
      console.log('=== handleSubmit 调用 AI 生成回答 ===')

      // 收集对话历史（排除默认回答，只保留真实对话）
      // 如果刚刚切换了年龄段，使用空的历史对话（确保新年龄段风格生效）
      let conversationHistory: Array<{ role: string; content: string }> = []
      if (!shouldResetHistory) {
        conversationHistory = chatMessages
          .filter(msg => msg.content.trim().length > 0) // 过滤空消息
          .filter(msg => !msg.content.includes('我的耳朵好像出小问题')) // 过滤默认回答
          .filter(msg => !msg.isStageChange) // 过滤年龄段切换消息
          .slice(-12) // 只取最近的 6 轮对话
          .map(msg => {
            // 如果是继续探索问题，将其作为 assistant 的消息添加
            if (msg.isCuriosityQuestion && msg.curiosityQuestions && msg.curiosityQuestions.length > 0) {
              return {
                role: 'assistant',
                content: msg.curiosityQuestions.join(' ')
              }
            }
            return {
              role: msg.role,
              content: msg.content
            }
          })
      }

      // 重置标志
      if (shouldResetHistory) {
        setShouldResetHistory(false)
      }

      console.log('========== 构建的对话历史 ==========')
      conversationHistory.forEach((msg, index) => {
        console.log(`历史 ${index + 1}: [${msg.role}] ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`)
      })
      console.log('==================================')

      const answer = await generateChildFriendlyAnswer(
        userQuestion,
        conversationHistory,
        `${currentStage.range[0]}-${currentStage.range[1]}岁`,
        selectedStage,
        '小朋友'
      )

      // 更新问题，添加回答
      updateQuestionWithAnswer(questionData.id, answer)

      // 添加AI回答消息
      const assistantMessage: ChatMessage = {
        id: Date.now().toString() + '_ans',
        role: 'assistant',
        content: answer.content,
        simpleExplanation: answer.simpleExplanation,
        curiosityQuestions: answer.curiosityQuestions,
        timestamp: new Date().toISOString()
      }
      setChatMessages(prev => [...prev, assistantMessage])

    } catch (error) {
      console.error('提交失败:', error)
      Taro.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setQuestion(suggestion)
  }

  // 切换输入模式
  const handleToggleInputMode = () => {
    try {
      const newMode = inputMode === 'text' ? 'voice' : 'text'
      setInputMode(newMode)
      console.log('切换输入模式:', newMode)
    } catch (error) {
      console.error('切换输入模式失败:', error)
    }
  }

  // 切换录音状态（点击触发）
  const toggleRecord = async () => {
    try {
      console.log('=== 切换录音状态 ===', {
        isRecording: isRecordingRef.current
      })

      if (!isRecordingRef.current) {
        // 立即更新 UI 状态，显示录音界面
        setIsRecording(true)
        isRecordingRef.current = true

        // 开始录音（异步）
        await startRecording()
      } else {
        // 停止录音并发送
        await stopRecordingAndSend()
      }
    } catch (error) {
      console.error('切换录音状态异常:', error)
      Taro.showToast({ title: '录音异常，请重试', icon: 'none' })
      // 发生错误时重置状态
      setIsRecording(false)
      isRecordingRef.current = false
    }
  }

  // 开始录音
  const startRecording = async () => {
    try {
      console.log('=== 开始录音 ===')

      // 注意：不要在这里检查 isRecordingRef.current，因为调用者已经设置过了
      // 如果需要防止重复调用，应该在调用者层面处理

      console.log('准备检查录音权限...')

      // ⭐ 优化权限检查：只检查明确的拒绝，其他情况直接尝试录音
      // 这样可以兼容预览模式、真机等各种环境
      const setting = await Taro.getSetting()
      console.log('权限设置:', setting)

      // 如果用户明确拒绝过，引导去设置
      if (setting.authSetting['scope.record'] === false) {
        console.log('录音权限被拒绝')
        Taro.showModal({
          title: '录音权限被拒绝',
          content: '请在设置中开启麦克风权限',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              Taro.openSetting()
            }
          }
        })
        return
      }

      // ⭐ 其他情况（未授权、已授权、预览模式等）直接尝试启动录音
      // 微信会自动处理权限弹窗（如果需要的话）
      console.log('准备开始录音...')

      // 清理之前的状态
      setRecordingTime(0)
      setVolumeHistory([])
      setIsCancelingRecording(false)
      isCancelingRecordingRef.current = false

      // 启动计时器
      const timer = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1
          // 30秒后自动停止
          if (newTime >= 30) {
            stopRecordingAndSend()
          }
          return newTime
        })
      }, 1000)
      recordingTimerRef.current = timer
      setRecordingTimer(timer) // 保留state用于调试

      // 启动音量采样定时器（用于波形显示）
      const volumeTimer = setInterval(() => {
        const newVolume = Math.random() * 0.5 + 0.2
        setCurrentVolume(newVolume)

        setVolumeHistory(prev => {
          const newHistory = [...prev, newVolume]
          return newHistory.slice(-50)
        })
      }, 100)
      volumeTimerRef.current = volumeTimer

      // 开始录音（等待 onStart 事件才更新 isRecording）
      console.log('调用 voiceService.startRecording...')

      try {
        // 实时模式需要使用 WAV 格式
        const format = voiceService.getMode() === 'doubao-realtime' ? 'wav' : 'mp3'

        console.log('录音配置:', {
          duration: 60000,
          format: format,
          sampleRate: 16000,
          numberOfChannels: 1
        })

        // 添加超时保护，延长到10秒
        const startTime = Date.now()
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('录音启动超时（10秒）')), 10000)
        )

        console.log('开始等待录音启动...')

        // 等待录音启动或超时
        await Promise.race([
          voiceService.startRecording({
            duration: 60000,
            format: format,
            sampleRate: 16000,
            numberOfChannels: 1
          }),
          timeout
        ])

        const elapsed = Date.now() - startTime
        console.log(`✅ 录音启动成功，耗时 ${elapsed}ms`)

        // 录音启动成功，设置标志
        recordingStartedRef.current = true
        console.log('设置 recordingStarted = true')

        Taro.vibrateShort({ type: 'medium' })
        console.log('=== 录音已启动 ===')
      } catch (error) {
        console.error('❌ 开始录音失败:', error)
        console.error('错误详情:', error?.message || error)

        // 录音启动失败，保持标志为 false
        recordingStartedRef.current = false
        console.log('设置 recordingStarted = false')

        // 立即清理定时器
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
          setRecordingTimer(null)
        }
        if (volumeTimerRef.current) {
          clearInterval(volumeTimerRef.current)
          volumeTimerRef.current = null
        }

        // 立即重置状态
        console.log('立即重置 isRecording = false')
        setIsRecording(false)
        isRecordingRef.current = false

        // 根据错误类型显示不同提示
        let errorMessage = '开始录音失败，请重试'
        if (error?.message) {
          if (error.message.includes('权限') || error.message.includes('authorize')) {
            errorMessage = '需要录音权限'
          } else if (error.message.includes('超时')) {
            errorMessage = '录音启动超时，请重试'
          } else if (error.message.includes('format')) {
            errorMessage = '录音格式不支持'
          }
        }

        Taro.showToast({ title: errorMessage, icon: 'none' })
      }
    } catch (error) {
      console.error('startRecording 异常:', error)

      // 立即清理定时器
      const timer = recordingTimer
      if (timer) {
        clearInterval(timer)
        setRecordingTimer(null)
      }

      // 立即重置状态
      console.log('异常：立即重置 isRecording = false')
      setIsRecording(false)
      isRecordingRef.current = false

      Taro.showToast({ title: '录音异常，请重试', icon: 'none' })
    }
  }

  // 停止录音并发送（点击交互）
  const stopRecordingAndSend = async () => {
    const now = Date.now()
    const timeSinceLastCall = now - stopRecordingAndSendTimestampRef.current

    // 时间戳检查：如果距离上次调用不到1秒，忽略
    if (timeSinceLastCall < 1000) {
      console.log(`❌ stopRecordingAndSend 正在处理中，忽略重复调用 (距离上次调用 ${timeSinceLastCall}ms)`)
      return
    }
    stopRecordingAndSendTimestampRef.current = now
    console.log('✅ stopRecordingAndSend 设置时间戳:', now)

    try {
      console.log('=== 停止录音并发送 ===')

      if (!isRecordingRef.current) {
        console.log('没有正在进行的录音')
        return
      }

      console.log('停止录音')

      // 清理定时器（使用 ref 确保能访问到最新的定时器）
      if (recordingTimerRef.current) {
        console.log('✅ 清理录音计时器')
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
        setRecordingTimer(null)
      }

      // 清理音量采样定时器
      if (volumeTimerRef.current) {
        console.log('✅ 清理音量采样定时器')
        clearInterval(volumeTimerRef.current)
        volumeTimerRef.current = null
      }

      // 设置正在停止标志，防止重复调用
      isStoppingRecordingRef.current = true

      // ⭐ 更新内部逻辑状态
      console.log('✅ 更新内部逻辑状态')
      isRecordingRef.current = false

      // ⭐ 设置识别中状态（显示"语音识别中"）
      console.log('✅ 设置识别中状态')
      setIsSubmitting(true)

      // 如果是实时模式，处理不同
      if (voiceService.getMode() === 'doubao-realtime') {
        console.log('实时模式：发送音频到服务')

        // 停止录音获取音频文件路径
        const result = await voiceService.stopRecording()

        if (result.success && result.tempFilePath) {
          // 发送音频到实时服务
          try {
            await voiceService.sendAudioToRealtime(result.tempFilePath)
          } catch (error) {
            console.error('发送音频失败:', error)
            setIsSubmitting(false)  // ⭐ 重置识别中状态
            Taro.showToast({ title: '发送失败', icon: 'none' })
          }
        } else {
          // 录音失败，显示错误信息
          setIsSubmitting(false)  // ⭐ 重置识别中状态
          Taro.showToast({ title: result.errorMessage || '录音失败，请重试', icon: 'none' })
        }
      } else {
        // 级联模式：停止录音并识别
        console.log('级联模式：停止录音并识别')

        // 停止录音并识别
        const result: ASRResult = await voiceService.stopRecording()

        console.log('识别结果:', result)

        if (result.success && result.text) {
          // 1. 设置识别的文字
          setQuestion(result.text)

          // 2. 直接提交消息
          await submitQuestionMessage(result.text)

          // 3. 清空输入框
          setQuestion('')

          // 4. 切换回语音输入模式
          setInputMode('voice')

          // ✅ 不显示"发送成功"toast
        } else {
          setIsSubmitting(false)  // ⭐ 重置识别中状态
          Taro.showToast({ title: result.errorMessage || '识别失败，请重试', icon: 'none' })
        }
      }

      Taro.vibrateShort({ type: 'light' })
    } catch (error) {
      console.error('录音处理失败:', error)
      setIsRecording(false)
      isRecordingRef.current = false
      recordingStartedRef.current = false
      isStoppingRecordingRef.current = false
      setRecordingTime(0)
      setVolumeHistory([])
      setCurrentVolume(0)
      setIsSubmitting(false)  // ⭐ 重置识别中状态

      Taro.showToast({ title: '录音处理失败', icon: 'none' })
    }
  }

  // 录音触摸开始
  const handleVoiceTouchStart = (e: any) => {
    try {
      console.log('=== 触摸开始 ===')

      const touch = e.touches[0]
      setTouchStartY(touch.clientY)
      console.log('触摸Y:', touch.clientY)

      // 重置所有标志位
      isStoppingRecordingRef.current = false
      isCancelingRecordingRef.current = false

      // 立即设置UI状态，确保波形显示
      console.log('设置 isRecording = true')
      setIsRecording(true)
      isRecordingRef.current = true
      recordingStartedRef.current = false

      // 异步启动录音
      startRecording()
    } catch (error) {
      console.error('触摸开始失败:', error)
    }
  }

  // 录音触摸移动
  const handleVoiceTouchMove = (e: any) => {
    try {
      if (!isRecordingRef.current) return

      const touch = e.touches[0]
      const deltaY = touch.clientY - touchStartY

      console.log('触摸移动 - deltaY:', deltaY)

      // 如果上滑超过 100px，显示取消状态
      if (deltaY < -100) {
        setIsCancelingRecording(true)
        isCancelingRecordingRef.current = true
        console.log('显示取消状态')
      } else {
        setIsCancelingRecording(false)
        isCancelingRecordingRef.current = false
      }
    } catch (error) {
      console.error('触摸移动失败:', error)
    }
  }

  // 录音触摸结束
  const handleVoiceTouchEnd = async (e?: any) => {
    const now = Date.now()
    const timeSinceLastCall = now - handleVoiceTouchEndTimestampRef.current

    // 使用时间戳和布尔标志双重检查，防止重复调用
    if (handleVoiceTouchEndCalledRef.current && timeSinceLastCall < 1000) {
      console.log(`❌ 触摸结束正在处理中，忽略重复调用 (距离上次调用 ${timeSinceLastCall}ms)`)
      return
    }
    handleVoiceTouchEndCalledRef.current = true
    handleVoiceTouchEndTimestampRef.current = now

    console.log('✅ 设置防重复标志，时间戳:', now)

    // 设置一个定时器，在较长时间后重置标志（允许下次调用）
    setTimeout(() => {
      console.log('⏰ 重置防重复标志')
      handleVoiceTouchEndCalledRef.current = false
    }, 1000) // 增加到 1000ms 冷却时间

    try {
      console.log('=== 触摸结束 ===')
      console.log('当前状态 - isRecordingRef:', isRecordingRef.current)
      console.log('当前状态 - isStoppingRecordingRef:', isStoppingRecordingRef.current)
      console.log('当前状态 - isCancelingRecordingRef:', isCancelingRecordingRef.current)

      // 检查是否在录音中
      if (!isRecordingRef.current) {
        console.log('❌ 没有正在进行的录音，忽略')
        return
      }

      // 检查是否在取消状态
      if (isCancelingRecordingRef.current) {
        console.log('⚠️ 检测到上滑取消，执行取消操作')
        handleCancelRecording()
        return
      }

      // ⭐ 立即更新UI状态，让用户松开按钮后马上看到反馈
      console.log('✅✅✅ 立即更新按钮UI状态')

      // 📌 关键：先更新内部引用，防止后续逻辑错误
      // 但不要立即更新 isRecordingRef.current，让 stopRecordingAndSend 能正常执行
      // isRecordingRef.current 保持为 true

      // 立即更新UI状态
      setIsRecording(false)
      setRecordingTime(0)
      setVolumeHistory([])
      setCurrentVolume(0)

      // 震动反馈（立即执行）
      try {
        Taro.vibrateShort({ type: 'light' })
      } catch (e) {
        // 预览版可能不支持震动，忽略错误
      }

      // ⭐ 使用 requestAnimationFrame 确保 UI 渲染后再执行后续逻辑
      console.log('✅✅✅ 安排异步执行停止录音')

      // 方案：使用 requestAnimationFrame + setTimeout 双重保险
      requestAnimationFrame(() => {
        console.log('✅✅✅ requestAnimationFrame 回调执行')
        // 在下一帧执行，确保 UI 已更新
        setTimeout(() => {
          console.log('✅✅✅ 延迟执行 stopRecordingAndSend')
          stopRecordingAndSend().catch(error => {
            console.error('❌ 停止录音失败:', error)
            // 出错时重置状态
            setIsSubmitting(false)
          })
        }, 50) // 50ms 延迟，确保 UI 完全渲染
      })

    } catch (error) {
      console.error('❌ 触摸结束处理失败:', error)
      // 出错时重置UI状态
      setIsRecording(false)
      isRecordingRef.current = false
      recordingStartedRef.current = false
      setIsCancelingRecording(false)
      isCancelingRecordingRef.current = false
      setRecordingTime(0)
      setVolumeHistory([])
      setCurrentVolume(0)
    } finally {
      // 重置全局标志位
      isStoppingRecordingRef.current = false
    }
  }

  // 处理触摸取消事件（系统取消触摸，如来电、通知等）
  const handleVoiceTouchCancel = async () => {
    console.log('=== 触摸取消（系统中断）===')

    const now = Date.now()
    const timeSinceLastCall = now - handleVoiceTouchEndTimestampRef.current

    // 同样的防重复检查
    if (handleVoiceTouchEndCalledRef.current && timeSinceLastCall < 1000) {
      console.log(`❌ 触摸取消正在处理中，忽略 (距离上次调用 ${timeSinceLastCall}ms)`)
      return
    }
    handleVoiceTouchEndCalledRef.current = true
    handleVoiceTouchEndTimestampRef.current = now

    setTimeout(() => {
      handleVoiceTouchEndCalledRef.current = false
    }, 1000)

    try {
      // 检查是否在录音中
      if (!isRecordingRef.current) {
        console.log('❌ 没有正在进行的录音，忽略')
        return
      }

      // 取消录音，不发送
      console.log('✅ 系统中断，取消录音')
      setIsRecording(false)
      isRecordingRef.current = false
      recordingStartedRef.current = false
      setRecordingTime(0)
      setVolumeHistory([])
      setCurrentVolume(0)

      // 停止录音（不发送）
      try {
        await voiceService.stopRecording()
      } catch (error) {
        console.error('停止录音失败:', error)
      }

    } catch (error) {
      console.error('❌ 触摸取消处理失败:', error)
    } finally {
      isStoppingRecordingRef.current = false
    }
  }

  // 提交问题消息（用于语音识别后自动提交）
  const submitQuestionMessage = async (questionText: string) => {
    try {
      console.log('=== 提交问题消息 ===', questionText)

      // 检查问题是否为空
      const trimmedQuestion = questionText.trim()
      if (!trimmedQuestion || trimmedQuestion.length === 0) {
        console.log('问题为空，使用默认回答')
        // 直接显示默认回答，不添加用户消息
        const defaultAnswer = '哎呀，我的耳朵好像出小问题啦，没听到你的声音。你可以再说一次吗？我保证这次认真听！'

        const assistantMessage: ChatMessage = {
          id: Date.now().toString() + '_default',
          role: 'assistant',
          content: defaultAnswer,
          timestamp: new Date().toISOString()
          // 不包含 curiosityQuestions，避免播放继续探索问题
        }
        setChatMessages(prev => [...prev, assistantMessage])

        // 自动播放默认回答
        autoPlayVoice(assistantMessage)
        return
      }

      // ⭐ 如果不是从语音识别调用来的，才设置 isSubmitting
      // （语音识别时已经在 stopRecordingAndSend 中设置过了）
      // setIsSubmitting(true)  // ← 注释掉，避免重复设置

      // 添加用户消息到聊天记录
      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: questionText,
        timestamp: new Date().toISOString()
      }
      setChatMessages(prev => [...prev, userMessage])

      // 添加加载消息，显示"正在思考"
      const loadingMessageId = `loading_${Date.now()}`
      const loadingMessage: ChatMessage = {
        id: loadingMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
        isLoading: true
      }
      setChatMessages(prev => [...prev, loadingMessage])

      // 保存问题
      const questionData = {
        id: userMessage.id,
        content: questionText,
        childName: childInfo.name,
        childAge: childInfo.age,
        childStage: selectedStage,
        createdAt: userMessage.timestamp
      }
      saveQuestion(questionData)

      // 调用 AI 生成回答
      console.log('=== 调用 AI 生成回答 ===')
      console.log('当前聊天消息数量:', chatMessages.length)

      // 收集对话历史（排除默认回答，只保留真实对话）
      // 如果刚刚切换了年龄段，使用空的历史对话（确保新年龄段风格生效）
      let conversationHistory: Array<{ role: string; content: string }> = []
      if (!shouldResetHistory) {
        conversationHistory = chatMessages
          .filter(msg => msg.content.trim().length > 0) // 过滤空消息
          .filter(msg => !msg.content.includes('我的耳朵好像出小问题')) // 过滤默认回答
          .filter(msg => !msg.isStageChange) // 过滤年龄段切换消息
          .slice(-12) // 只取最近的 6 轮对话
          .map(msg => {
            // 如果是继续探索问题，将其作为 assistant 的消息添加
            if (msg.isCuriosityQuestion && msg.curiosityQuestions && msg.curiosityQuestions.length > 0) {
              return {
                role: 'assistant',
                content: msg.curiosityQuestions.join(' ')
              }
            }
            return {
              role: msg.role,
              content: msg.content
            }
          })
      }

      // 重置标志
      if (shouldResetHistory) {
        setShouldResetHistory(false)
      }

      console.log('========== 构建的对话历史 ==========')
      conversationHistory.forEach((msg, index) => {
        console.log(`历史 ${index + 1}: [${msg.role}] ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`)
      })
      console.log('==================================')

      const currentStage = AGE_STAGES[selectedStage]
      const answer = await generateChildFriendlyAnswer(
        questionText,
        conversationHistory,
        `${currentStage.range[0]}-${currentStage.range[1]}岁`,
        selectedStage,
        '小朋友'
      )
      console.log('=== AI 回答 ===', answer)

      // 检查回答是否为空
      const trimmedAnswer = answer.content.trim()
      let finalAnswer = answer
      if (!trimmedAnswer || trimmedAnswer.length === 0) {
        console.log('AI 回答为空，使用默认回答')
        finalAnswer = {
          ...answer,
          content: '哎呀，我的耳朵好像出小问题啦，没听到你的声音。你可以再说一次吗？我保证这次认真听！',
          simpleExplanation: '',
          curiosityQuestions: [] // 空数组，避免播放继续探索问题
        }
      }

      // 更新问题，添加回答
      updateQuestionWithAnswer(questionData.id, finalAnswer)

      // 先移除加载消息，再添加真实的AI回答
      const assistantMessage: ChatMessage = {
        id: Date.now().toString() + '_ans',
        role: 'assistant',
        content: finalAnswer.content,
        simpleExplanation: finalAnswer.simpleExplanation,
        curiosityQuestions: finalAnswer.curiosityQuestions,
        timestamp: new Date().toISOString()
      }

      setChatMessages(prev => {
        // 移除加载消息，添加真实的AI回答
        return prev
          .filter(msg => !msg.isLoading) // 移除所有加载消息
          .concat(assistantMessage) // 添加AI回答
      })

      // 自动播放语音回答
      console.log('准备调用 autoPlayVoice，消息ID:', assistantMessage.id)
      autoPlayVoice(assistantMessage).catch(error => {
        console.error('autoPlayVoice 执行失败:', error)
      })

      console.log('=== 消息提交完成 ===')
    } catch (error) {
      console.error('提交失败:', error)
      Taro.showToast({ title: '提交失败，请重试', icon: 'none' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // 取消录音
  const handleCancelRecording = async () => {
    try {
      // 清理定时器
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
        setRecordingTimer(null)
      }
      if (volumeTimerRef.current) {
        clearInterval(volumeTimerRef.current)
        volumeTimerRef.current = null
      }

      setIsCancelingRecording(false)
      isCancelingRecordingRef.current = false
      setIsRecording(false)
      isRecordingRef.current = false
      recordingStartedRef.current = false
      isStoppingRecordingRef.current = false
      setRecordingTime(0)
      setVolumeHistory([])
      setCurrentVolume(0)

      // 取消录音
      await voiceService.cancelRecording()

      Taro.showToast({ title: '已取消录音', icon: 'none' })
    } catch (error) {
      console.error('取消录音失败:', error)
      Taro.showToast({ title: '取消录音失败', icon: 'none' })
    }
  }

  // 完成录音并发送
  const handleCompleteRecording = async () => {
    try {
      // 清理定时器
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
        setRecordingTimer(null)
      }
      if (volumeTimerRef.current) {
        clearInterval(volumeTimerRef.current)
        volumeTimerRef.current = null
      }

      // 实时模式下直接发送
      if (voiceService.getMode() === 'doubao-realtime') {
        console.log('实时模式：完成录音并发送')
        const result: ASRResult = await voiceService.stopRecording()

        setIsRecording(false)
        isRecordingRef.current = false
        recordingStartedRef.current = false
        isStoppingRecordingRef.current = false
        setRecordingTime(0)
        setVolumeHistory([])
        setCurrentVolume(0)

        if (result.success && result.tempFilePath) {
          await voiceService.sendAudioToRealtime(result.tempFilePath)
          Taro.showToast({ title: '发送成功', icon: 'success' })
        }
      } else {
        Taro.showToast({ title: '正在识别...', icon: 'loading', duration: 2000 })

        const result: ASRResult = await voiceService.stopRecording()

        setIsRecording(false)
        isRecordingRef.current = false
        recordingStartedRef.current = false
        isStoppingRecordingRef.current = false
        setRecordingTime(0)
        setVolumeHistory([])
        setCurrentVolume(0)

        console.log('识别结果:', result)

        if (result.success && result.text) {
          setQuestion(result.text)
          setInputMode('text')
          Taro.showToast({ title: '识别成功', icon: 'success' })
        } else {
          Taro.showToast({ title: result.errorMessage || '识别失败，请重试', icon: 'none' })
        }
      }
    } catch (error) {
      console.error('录音处理失败:', error)
      setIsRecording(false)
      isRecordingRef.current = false
      recordingStartedRef.current = false
      isStoppingRecordingRef.current = false
      setRecordingTime(0)
      setVolumeHistory([])
      setCurrentVolume(0)

      Taro.showToast({ title: '录音处理失败', icon: 'none' })
    }
  }

  // 格式化录音时长
  const formatRecordingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 重置录音状态的辅助函数
  const resetRecordingState = () => {
    setIsRecording(false)
    isRecordingRef.current = false
    recordingStartedRef.current = false
    isStoppingRecordingRef.current = false
    setRecordingTime(0)
    setVolumeHistory([])
    setCurrentVolume(0)
    setIsCancelingRecording(false)
    isCancelingRecordingRef.current = false
  }

  // 播放语音回答
  const handlePlayVoice = async (message: ChatMessage) => {
    try {
      const wasPlaying = message.isPlaying

      // 更新所有消息的播放状态
      setChatMessages(prev =>
        prev.map(m => ({ ...m, isPlaying: wasPlaying ? false : m.id === message.id }))
      )

      // 如果正在播放，则停止
      if (wasPlaying) {
        voiceService.stop()
        setPlayProgress(0)
        return
      }

      // 播放语音
      await voiceService.playText(message.content, message.id)

    } catch (error) {
      console.error('播放语音失败:', error)
      setChatMessages(prev =>
        prev.map(m => ({ ...m, isPlaying: false }))
      )
      setPlayProgress(0)
      Taro.showToast({ title: '播放语音失败', icon: 'none' })
    }
  }

  // 自动播放语音回答
  const autoPlayVoice = async (message: ChatMessage) => {
    try {
      console.log('=== 自动播放语音 ===', {
        content: message.content,
        inputMode: inputMode,
        messageId: message.id
      })

      // 记录当前播放的消息（用于后续播放继续探索问题）
      currentPlayingMessageRef.current = message

      // 更新消息播放状态
      setChatMessages(prev =>
        prev.map(m => ({ ...m, isPlaying: m.id === message.id }))
      )

      // 播放语音
      await voiceService.playText(message.content, message.id)

    } catch (error) {
      console.error('自动播放语音失败:', error)
      currentPlayingMessageRef.current = null
      setChatMessages(prev =>
        prev.map(m => ({ ...m, isPlaying: false }))
      )
      setPlayProgress(0)
    }
  }

  // 播放继续探索问题
  const playCuriosityQuestion = async (question: string, parentMessageId: string) => {
    try {
      console.log('=== 播放继续探索问题 ===', question)

      // 清除引用，避免播放探索问题结束后再次触发
      currentPlayingMessageRef.current = null

      // 将「继续探索」问题添加到对话历史（仅用于语音回应时的上下文）
      // 标记为 isCuriosityQuestion，这样渲染时可以跳过显示
      const curiosityMessage: ChatMessage = {
        id: `${parentMessageId}_curiosity`,
        role: 'assistant', // AI 提出的引导性问题
        content: question,
        timestamp: new Date().toISOString(),
        isCuriosityQuestion: true // 标记为继续探索问题
      }
      setChatMessages(prev => [...prev, curiosityMessage])
      console.log('=== 已添加继续探索问题到对话历史 ===', question)

      // 直接播放问题
      await voiceService.playText(question, `${parentMessageId}_curiosity_0`)

    } catch (error) {
      console.error('播放继续探索问题失败:', error)
    }
  }

  // 切换文本显示
  const currentStage = AGE_STAGES[selectedStage] || AGE_STAGES[0]

  return (
    <View className="index-page" style={{ paddingTop: `${statusBarHeight + 44}px` }}>
      {/* 自定义状态栏和导航栏 */}
      <View className="custom-navbar">
        <View className="status-bar" style={{ paddingTop: `${statusBarHeight}px` }}>
        </View>
      </View>

      {/* 儿童信息卡片 */}
      <View className="kid-info-card">
        {/* 头部信息 */}
        <View className="kid-header">
          <View className="product-slogan">
            Big questions deserve Little{'\n'}answers <Text className="star-large">✦</Text><Text className="star-small">✦</Text>
          </View>
          <View
            className="parent-center-btn"
            onClick={() => Taro.navigateTo({ url: '/pages/parent/index' })}
          >
            <Text className="parent-text">家长中心</Text>
          </View>
        </View>

        {/* 年龄段选择器 */}
        <View className="age-selector">
          {AGE_STAGES.map((stage, index) => (
            <View
              key={index}
              className={`age-option ${selectedStage === index ? 'active' : ''}`}
              onClick={() => handleStageSelect(index)}
            >
              <Text className="age-emoji">{stage.emoji}</Text>
              <Text className="age-range">{stage.label}</Text>
              <Text className="age-description">{stage.desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 实时语音连接状态 */}
      {voiceService.getMode() === 'doubao-realtime' && (
        <View className={`realtime-status ${realtimeConnected ? 'connected' : 'disconnected'}`}>
          <Text className="status-icon">{realtimeConnected ? '🟢' : '🔴'}</Text>
          <Text className="status-text">
            {realtimeConnected ? '实时语音已连接' : '实时语音连接中...'}
          </Text>
          {isRealtimeSpeaking && (
            <Text className="speaking-indicator">🔊 说话中...</Text>
          )}
        </View>
      )}

      {/* 聊天对话区域 */}
      <ScrollView
        ref={scrollViewRef}
        scrollY
        scrollTop={scrollTop}
        className="chat-section"
        scrollWithAnimation
      >
        {chatMessages.length === 0 ? (
          // 没有对话时显示建议问题
          <View className="default-questions">
            <Text className="questions-title">✨ 开启今天的好奇时刻：</Text>
            <View className="questions-grid">
              {['天为什么是蓝色的？', '小鸟为什么会飞？', '月亮为什么有圆有缺？', '彩虹是怎么形成的？'].map((suggestion, index) => (
                <View
                  key={index}
                  className="question-card"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <Text>{suggestion}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          // 显示对话
          <>
            {chatMessages
              .filter(msg => !msg.isCuriosityQuestion) // 过滤掉「继续探索」问题，不在对话框显示
              .map((message, index) => {
                const filteredMessages = chatMessages.filter(msg => !msg.isCuriosityQuestion)
                const isLast = index === filteredMessages.length - 1
                return (
                  <View
                    key={message.id}
                    id={`msg-scroll-${message.id}`}
                    className={`chat-message ${message.role}`}
                  >
                {message.isStageChange ? (
                  // 年龄段切换消息
                  <View className="message-stage-change">
                    <Text className="stage-change-icon">✨</Text>
                    <Text className="stage-change-text">{message.content}</Text>
                  </View>
                ) : message.role === 'user' ? (
                  // 用户消息
                  <View className="message-user">
                    <Text className="message-content">{message.content}</Text>
                    <Text className="message-time">
                      {formatRelativeTime(message.timestamp)}
                    </Text>
                  </View>
                ) : message.isLoading ? (
                  // 加载中动画
                  <View className="message-assistant">
                    <View className="message-content-wrapper">
                      <View className="loading-animation">
                        <Text className="loading-text">正在思考中</Text>
                        <View className="loading-dots">
                          <View className="dot dot-1"></View>
                          <View className="dot dot-2"></View>
                          <View className="dot dot-3"></View>
                        </View>
                      </View>
                    </View>
                  </View>
                ) : (
                  // AI回答
                  <View className="message-assistant">
                    <View className="message-content-wrapper">
                      <View className="message-content">
                        <Text className="answer-text">{message.content}</Text>

                        {/* 简单总结 */}
                        {message.simpleExplanation && (
                          <View className="simple-summary">
                            <Text className="summary-icon">💡</Text>
                            <Text className="summary-text">{message.simpleExplanation}</Text>
                          </View>
                        )}

                        {/* 继续探索 */}
                        {message.curiosityQuestions && message.curiosityQuestions.length > 0 && (
                          <View className="curiosity-section">
                            <Text className="curiosity-title">继续探索：</Text>
                            <View className="curiosity-list">
                              {/* 只显示第一个问题 */}
                              {message.curiosityQuestions.slice(0, 1).map((q, index) => (
                                <View
                                  key={index}
                                  className="curiosity-item"
                                  onClick={() => handleSuggestionClick(q)}
                                >
                                  <Text className="curiosity-dot">•</Text>
                                  <Text className="curiosity-text">{q}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        )}

                        {/* 语音播放按钮 - 在 message-content 内部 */}
                        <View
                          className={`voice-play-button ${message.isPlaying ? 'playing' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePlayVoice(message)
                          }}
                        >
                          <View className="voice-wave-icon">
                            <Text className="speaker-emoji">⏵️</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
                </View>
              )
            })}
            {/* 底部占位，防止最后一条消息被输入框遮挡 */}
            <View style={{ height: '120px' }}></View>
          </>
        )}
      </ScrollView>

      {/* 底部输入区域 */}
      <View className="input-section">
        <View className="input-container">
          {/* 模式切换按钮 - 始终在最左侧 */}
          <View className="input-mode-toggle" onClick={handleToggleInputMode}>
            <Image className="toggle-icon-image" src={inputMode === 'voice' ? keyboardIcon : micIcon} />
          </View>

          {/* 输入区域 - 语音或文字 */}
          <View className="input-area">
            {/* 语音输入模式（默认） */}
            {inputMode === 'voice' ? (
              <View
                className={`voice-input-wrapper ${isRecording ? 'recording' : ''}`}
                onTouchStart={handleVoiceTouchStart}
                onTouchMove={handleVoiceTouchMove}
                onTouchEnd={handleVoiceTouchEnd}
                onTouchCancel={handleVoiceTouchCancel}
              >
                <View className="voice-input-content">
                  {isRecording ? (
                    /* 录音中状态 */
                    <View className="recording-status">
                      <Text className="recording-text">
                        {isCancelingRecording ? '松手取消' : '松开发送'}
                      </Text>
                      {/* 录音波形动画 - 5条白色竖线 */}
                      <View className="waveform-container-inline">
                        <View className="wave-bar" style={{ height: '8px', animationDelay: '0s' }}></View>
                        <View className="wave-bar" style={{ height: '16px', animationDelay: '0.1s' }}></View>
                        <View className="wave-bar" style={{ height: '12px', animationDelay: '0.2s' }}></View>
                        <View className="wave-bar" style={{ height: '16px', animationDelay: '0.3s' }}></View>
                        <View className="wave-bar" style={{ height: '8px', animationDelay: '0.4s' }}></View>
                      </View>
                    </View>
                  ) : isSubmitting ? (
                    /* 识别中状态 */
                    <View className="voice-prompt recognizing">
                      <View className="recognizing-indicator">
                        <View className="recognizing-dots">
                          <View className="recognizing-dot dot-1"></View>
                          <View className="recognizing-dot dot-2"></View>
                          <View className="recognizing-dot dot-3"></View>
                        </View>
                      </View>
                      <Text className="voice-prompt-text">语音识别中</Text>
                    </View>
                  ) : (
                    /* 默认状态：按住说话 */
                    <View className="voice-prompt">
                      <Image className="voice-prompt-icon-image" src={micIcon} />
                      <Text className="voice-prompt-text">按住说话</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              /* 文字输入模式 */
              <View className="input-wrapper">
                <Textarea
                  className="question-input"
                  placeholder="输入你的问题..."
                  value={question}
                  onInput={handleInputChange}
                  maxlength={500}
                  showConfirmBar={false}
                  adjustPosition
                  disableDefaultPadding
                />
              </View>
            )}
          </View>

          {/* 发送按钮 - 只在文字输入模式时显示 */}
          {inputMode === 'text' && (
            <View className="submit-button-wrapper">
              <Button
                className="submit-button"
                onClick={handleSubmit}
                disabled={isSubmitting || !question.trim()}
              >
                <Image className="submit-button-icon" src={sendIcon} />
              </Button>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

export default Index
