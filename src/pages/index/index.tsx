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
        </View>
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
