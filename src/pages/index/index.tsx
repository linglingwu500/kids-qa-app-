import React, { useState, useEffect } from 'react'
import { View, Text, Textarea, Button, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { getChildInfo, saveQuestion, updateQuestionWithAnswer } from '../../store/child'
import { generateChildFriendlyAnswer } from '../../services/ai'
import { formatRelativeTime } from '../../utils/format'
import './index.scss'

// 认知发展阶段
const AGE_STAGES = [
  {
    range: [3, 5],
    label: '3-5岁',
    emoji: '🧒',
    desc: '具体形象思维'
  },
  {
    range: [6, 7],
    label: '6-7岁',
    emoji: '🎒',
    desc: '逻辑思维萌芽'
  },
  {
    range: [8, 9],
    label: '8-9岁',
    emoji: '🧠',
    desc: '抽象思维开始'
  },
  {
    range: [10, 12],
    label: '10-12岁',
    emoji: '🔭',
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
}

const Index = () => {
  const childInfoData = getChildInfo()
  const [childInfo, setChildInfo] = useState<ChildInfo | null>(childInfoData)
  const [question, setQuestion] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedStage, setSelectedStage] = useState<number>(0)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [scrollTop, setScrollTop] = useState(0)
  const [showSetup, setShowSetup] = useState(false)
  const [childName, setChildName] = useState('')
  const [childAge, setChildAge] = useState('')

  // 语音相关状态
  const [inputMode, setInputMode] = useState<'text' | 'voice'>('text')
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [recordingTimer, setRecordingTimer] = useState<NodeJS.Timeout | null>(null)

  // 音频播放器
  const [innerAudio, setInnerAudio] = useState<Taro.InnerAudioContext | null>(null)

  const router = useRouter()

  console.log('=== Index 组件 ===')

  // 根据孩子年龄自动选择对应的阶段
  useEffect(() => {
    try {
      if (childInfo) {
        const savedStage = Taro.getStorageSync('selected_age_stage')
        if (savedStage && savedStage !== '') {
          setSelectedStage(parseInt(savedStage))
        } else {
          const stageIndex = AGE_STAGES.findIndex(s =>
            childInfo.age >= s.range[0] && childInfo.age <= s.range[1]
          )
          if (stageIndex !== -1) {
            setSelectedStage(stageIndex)
          }
        }
      }
    } catch (error) {
      console.error('设置阶段失败:', error)
    }
  }, [childInfo])

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

  // 滚动到底部
  useEffect(() => {
    try {
      if (chatMessages.length > 0) {
        setTimeout(() => {
          setScrollTop(99999)
        }, 100)
      }
    } catch (error) {
      console.error('滚动失败:', error)
    }
  }, [chatMessages.length])

  const handleInputChange = (e: any) => {
    setQuestion(e.detail.value)
  }

  const handleStageSelect = (index: number) => {
    try {
      setSelectedStage(index)
      Taro.setStorageSync('selected_age_stage', index.toString())
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

      // 检查是否已设置孩子信息
      if (!childInfo) {
        Taro.showToast({ title: '请先设置孩子信息', icon: 'none' })
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
      const questionData = {
        id: userMessage.id,
        content: userQuestion,
        childName: childInfo.name,
        childAge: childInfo.age,
        childStage: selectedStage,
        createdAt: userMessage.timestamp
      }

      saveQuestion(questionData)

      // 调用 AI 生成回答
      const answer = await generateChildFriendlyAnswer(
        userQuestion,
        childInfo.age,
        selectedStage,
        childInfo.name
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

  const handleSetupChild = () => {
    try {
      if (!childName.trim() || !childAge.trim()) {
        Taro.showToast({ title: '请填写完整信息', icon: 'none' })
        return
      }

      const age = parseInt(childAge)
      if (isNaN(age) || age < 3 || age > 12) {
        Taro.showToast({ title: '请输入3-12岁的年龄', icon: 'none' })
        return
      }

      // 保存孩子信息
      const newChildInfo: ChildInfo = {
        name: childName.trim(),
        age: age,
        createdAt: new Date().toISOString()
      }

      Taro.setStorageSync('child_info', newChildInfo)
      setChildInfo(newChildInfo)
      setShowSetup(false)
      Taro.showToast({ title: '设置成功', icon: 'success' })

      // 自动选择对应的年龄段
      const stageIndex = AGE_STAGES.findIndex(s => age >= s.range[0] && age <= s.range[1])
      if (stageIndex !== -1) {
        setSelectedStage(stageIndex)
        Taro.setStorageSync('selected_age_stage', stageIndex.toString())
      }
    } catch (error) {
      console.error('设置孩子信息失败:', error)
      Taro.showToast({ title: '设置失败', icon: 'none' })
    }
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

  // 开始录音
  const handleStartRecording = () => {
    try {
      const recorderManager = Taro.getRecorderManager()

      recorderManager.onStart(() => {
        console.log('录音开始')
        setIsRecording(true)
        setRecordingTime(0)

        // 启动计时器
        const timer = setInterval(() => {
          setRecordingTime(prev => prev + 1)
        }, 1000)
        setRecordingTimer(timer)
      })

      recorderManager.onStop((res: any) => {
        console.log('录音结束', res)
        setIsRecording(false)
        setRecordingTime(0)

        if (recordingTimer) {
          clearInterval(recordingTimer)
          setRecordingTimer(null)
        }

        // 使用模拟的语音识别（实际项目中需要接入真实的语音识别服务）
        const mockRecognizedText = getMockRecognizedText()
        setQuestion(mockRecognizedText)
        setInputMode('text')
        Taro.showToast({ title: '识别成功', icon: 'success' })
      })

      recorderManager.onError((err: any) => {
        console.error('录音错误:', err)
        setIsRecording(false)
        setRecordingTime(0)

        if (recordingTimer) {
          clearInterval(recordingTimer)
          setRecordingTimer(null)
        }

        Taro.showToast({ title: '录音失败', icon: 'none' })
      })

      // 开始录音
      recorderManager.start({
        duration: 60000, // 最长60秒
        format: 'mp3',
        sampleRate: 16000,
        numberOfChannels: 1,
        encodeBitRate: 48000,
        frameSize: 50
      })
    } catch (error) {
      console.error('开始录音失败:', error)
      Taro.showToast({ title: '开始录音失败', icon: 'none' })
    }
  }

  // 停止录音
  const handleStopRecording = () => {
    try {
      const recorderManager = Taro.getRecorderManager()
      recorderManager.stop()
    } catch (error) {
      console.error('停止录音失败:', error)
    }
  }

  // 格式化录音时长
  const formatRecordingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 模拟语音识别结果（实际项目中需要接入真实的语音识别服务）
  const getMockRecognizedText = (): string => {
    const questions = [
      '天为什么是蓝色的？',
      '小鸟为什么会飞？',
      '月亮为什么有圆有缺？',
      '彩虹是怎么形成的？',
      '为什么会有四季变化？',
      '星星为什么会发光？',
      '鱼为什么能在水里呼吸？'
    ]
    return questions[Math.floor(Math.random() * questions.length)]
  }

  // 播放语音回答
  const handlePlayVoice = (message: ChatMessage) => {
    try {
      if (!innerAudio) {
        Taro.showToast({ title: '音频播放器未初始化', icon: 'none' })
        return
      }

      // 更新所有消息的播放状态
      setChatMessages(prev =>
        prev.map(m => ({ ...m, isPlaying: m.id === message.id }))
      )

      // 使用 TTS 播放文本
      const textToPlay = message.content + (message.simpleExplanation ? `\n${message.simpleExplanation}` : '')

      // 调用微信语音合成 API
      Taro.getBackgroundAudioManager().play({
        src: '', // TTS 生成的音频地址（实际使用时需要真实的音频地址）
        title: '回答',
        author: '好奇宝宝'
      })

      // 由于微信小程序 TTS 需要后端服务支持，这里使用 Web Speech API 作为替代方案
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(textToPlay)
        utterance.lang = 'zh-CN'
        utterance.rate = 0.9
        utterance.pitch = 1.1

        utterance.onend = () => {
          setChatMessages(prev =>
            prev.map(m => ({ ...m, isPlaying: false }))
          )
        }

        utterance.onerror = () => {
          setChatMessages(prev =>
            prev.map(m => ({ ...m, isPlaying: false }))
          )
          Taro.showToast({ title: '语音播放失败', icon: 'none' })
        }

        window.speechSynthesis.speak(utterance)
      } else {
        // 如果不支持 Web Speech API，使用 Toast 提示
        setTimeout(() => {
          setChatMessages(prev =>
            prev.map(m => ({ ...m, isPlaying: false }))
          )
          Taro.showToast({ title: '当前环境不支持语音播放', icon: 'none' })
        }, 500)
      }
    } catch (error) {
      console.error('播放语音失败:', error)
      setChatMessages(prev =>
        prev.map(m => ({ ...m, isPlaying: false }))
      )
      Taro.showToast({ title: '播放语音失败', icon: 'none' })
    }
  }

  // 切换文本显示
  const handleToggleText = (message: ChatMessage) => {
    setChatMessages(prev =>
      prev.map(m =>
        m.id === message.id ? { ...m, showText: !m.showText } : m
      )
    )
  }

  const currentStage = AGE_STAGES[selectedStage] || AGE_STAGES[0]

  return (
    <View className="index-page">
      {/* 设置孩子信息弹窗 */}
      {showSetup && (
        <View className="setup-modal">
          <View className="setup-content">
            <Text className="setup-title">设置孩子信息</Text>
            <View className="setup-form">
              <View className="form-item">
                <Text className="form-label">孩子姓名</Text>
                <Textarea
                  className="form-input"
                  placeholder="请输入孩子的名字"
                  value={childName}
                  onInput={(e: any) => setChildName(e.detail.value)}
                  maxlength={20}
                  showConfirmBar={false}
                  disableDefaultPadding
                />
              </View>
              <View className="form-item">
                <Text className="form-label">孩子年龄（3-12岁）</Text>
                <Textarea
                  className="form-input"
                  placeholder="请输入孩子的年龄"
                  value={childAge}
                  onInput={(e: any) => setChildAge(e.detail.value)}
                  maxlength={2}
                  showConfirmBar={false}
                  disableDefaultPadding
                />
              </View>
            </View>
            <View className="setup-buttons">
              <Button
                className="setup-btn cancel-btn"
                onClick={() => setShowSetup(false)}
              >
                取消
              </Button>
              <Button
                className="setup-btn confirm-btn"
                onClick={handleSetupChild}
              >
                确定
              </Button>
            </View>
          </View>
        </View>
      )}

      {/* 顶部欢迎区域 */}
      <View className="welcome-section">
        <View className="welcome-content">
          <Text className="welcome-title">
            {childInfo ? `你好，${childInfo.name}！` : '欢迎来到好奇宝宝问答'}
          </Text>
          <Text className="welcome-subtitle">
            {childInfo ? '有什么问题想问吗？' : '请先设置孩子信息'}
          </Text>
          {!childInfo && (
            <Button className="setup-trigger" onClick={() => setShowSetup(true)}>
              设置孩子信息
            </Button>
          )}
        </View>
        <View className="welcome-illustration">
          <Text className="illustration-emoji">🐻</Text>
        </View>
      </View>

      {/* 年龄段选择器 */}
      <View className="age-stage-section">
        <Text className="section-label">选择回答难度：</Text>
        <View className="stages-list">
          {AGE_STAGES.map((stage, index) => (
            <View
              key={index}
              className={`stage-item ${selectedStage === index ? 'active' : ''}`}
              onClick={() => handleStageSelect(index)}
            >
              <Text className="stage-emoji">{stage.emoji}</Text>
              <Text className="stage-label">{stage.label}</Text>
            </View>
          ))}
        </View>
        <Text className="stage-desc">
          {currentStage.emoji} {currentStage.label} - {currentStage.desc}
        </Text>
      </View>

      {/* 聊天对话区域 */}
      <ScrollView
        scrollY
        className="chat-section"
        scrollTop={scrollTop}
      >
        {chatMessages.length === 0 ? (
          // 没有对话时显示建议问题
          <View className="suggestions-section">
            <Text className="suggestions-title">你可以试试问：</Text>
            <View className="suggestions-list">
              {['天为什么是蓝色的？', '小鸟为什么会飞？', '月亮为什么有圆有缺？', '彩虹是怎么形成的？'].map((suggestion, index) => (
                <View
                  key={index}
                  className="suggestion-item"
                  onClick={() => handleSuggestionClick(suggestion)}
                >
                  <Text className="suggestion-text">{suggestion}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          // 显示对话
          <>
            {chatMessages.map((message) => (
              <View
                key={message.id}
                className={`chat-message ${message.role}`}
              >
                {message.role === 'user' ? (
                  // 用户消息
                  <View className="message-user">
                    <Text className="message-content">{message.content}</Text>
                    <Text className="message-time">
                      {formatRelativeTime(message.timestamp)}
                    </Text>
                  </View>
                ) : (
                  // AI回答
                  <View className="message-assistant">
                    <View className="message-content">
                      {/* 语音控制按钮 */}
                      <View className="voice-controls">
                        <View
                          className={`voice-play-btn ${message.isPlaying ? 'playing' : ''}`}
                          onClick={() => handlePlayVoice(message)}
                        >
                          <Text className="voice-icon">
                            {message.isPlaying ? '⏸️' : '🔊'}
                          </Text>
                        </View>
                        <View
                          className="voice-toggle-btn"
                          onClick={() => handleToggleText(message)}
                        >
                          <Text className="toggle-icon">
                            {message.showText ? '👁️' : '📝'}
                          </Text>
                          <Text className="toggle-text">
                            {message.showText ? '隐藏文字' : '显示文字'}
                          </Text>
                        </View>
                      </View>

                      {/* 文字内容（可隐藏） */}
                      {message.showText !== false && (
                        <>
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
                                {message.curiosityQuestions.map((q, index) => (
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
                        </>
                      )}

                      {/* 仅显示语音模式时的提示 */}
                      {message.showText === false && (
                        <View className="voice-only-hint">
                          <Text className="hint-text">点击🔊按钮播放语音</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* 底部输入区域 */}
      <View className="input-section">
        <View
          className="parent-entry"
          onClick={() => Taro.navigateTo({ url: '/pages/parent/index' })}
        >
          <Text className="parent-entry-icon">👨‍👩‍👧</Text>
          <Text className="parent-entry-text">家长中心</Text>
        </View>

        {/* 文字输入模式 */}
        {inputMode === 'text' ? (
          <View className="input-wrapper">
            <Textarea
              className="question-input"
              placeholder="在这里写下你的问题..."
              value={question}
              onInput={handleInputChange}
              maxlength={500}
              autoHeight
              showConfirmBar={false}
              adjustPosition
              disableDefaultPadding
            />
            <Text className="char-count">{question.length}/500</Text>
            <View className="input-mode-toggle" onClick={handleToggleInputMode}>
              <Text className="toggle-icon">🎙️</Text>
            </View>
          </View>
        ) : (
          /* 语音输入模式 */
          <View className="voice-input-wrapper">
            <View className="voice-input-content">
              {isRecording ? (
                <View className="recording-status">
                  <Text className="recording-icon">🎤</Text>
                  <Text className="recording-text">录音中...</Text>
                  <Text className="recording-time">{formatRecordingTime(recordingTime)}</Text>
                  <Button className="stop-record-btn" onClick={handleStopRecording}>
                    停止
                  </Button>
                </View>
              ) : (
                <View className="voice-prompt" onClick={handleStartRecording}>
                  <Text className="voice-prompt-icon">🎙️</Text>
                  <Text className="voice-prompt-text">点击开始录音</Text>
                </View>
              )}
            </View>
            <View className="input-mode-toggle" onClick={handleToggleInputMode}>
              <Text className="toggle-icon">⌨️</Text>
            </View>
          </View>
        )}

        <Button
          className="submit-button"
          onClick={handleSubmit}
          disabled={isSubmitting || !question.trim()}
        >
          {isSubmitting ? '...' : '问一下'}
        </Button>
      </View>
    </View>
  )
}

export default Index
