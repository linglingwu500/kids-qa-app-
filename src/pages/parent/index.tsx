import React, { useState, useEffect } from 'react'
import { View, Text, Button, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getChildInfo, getAllQuestions } from '../../store/child'
import { analyzeChildInterests, getRecommendations } from '../../services/ai'
import { formatRelativeTime } from '../../utils/format'
import { Question, ChildAnalysis, Recommendation } from '../../types'
import './index.scss'

// 年龄段映射
const AGE_STAGE_LABELS = {
  0: '3-5岁',
  1: '6-7岁',
  2: '8-9岁',
  3: '10-12岁'
}

const Parent = () => {
  const [childInfo, setChildInfo] = useState(getChildInfo())
  const [questions, setQuestions] = useState<Question[]>([])
  const [activeTab, setActiveTab] = useState<'history' | 'analysis'>('history')
  const [interestAnalysis, setInterestAnalysis] = useState<ChildAnalysis | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [lastAnalysisQuestionCount, setLastAnalysisQuestionCount] = useState(0) // 记录上次分析时的问题数量
  const [statusBarHeight, setStatusBarHeight] = useState(44) // 状态栏高度

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

  // 清理文本中的 Markdown 加粗标记 **，并返回清理后的文本
  const cleanMarkdownBold = (text: string): string => {
    return text.replace(/\*\*/g, '')
  }

  // 过滤掉无意义的列表项（如纯符号、空内容等）
  const filterValidItems = (items: string[]): string[] => {
    return items.filter(item => {
      const trimmed = item.trim()
      // 过滤：空内容、纯符号（---, ###）、只有冒号的项
      return trimmed.length > 0 &&
             !trimmed.match(/^[-=#*•·]{2,}$/) &&
             !trimmed.match(/^[:：]+$/)
    })
  }

  // 加载问题历史
  useEffect(() => {
    try {
      loadQuestions()
      loadSavedAnalysis() // 加载保存的分析结果
    } catch (error) {
      console.error('加载问题失败:', error)
    }
  }, [])

  // 每次显示页面时刷新数据
  useEffect(() => {
    try {
      setChildInfo(getChildInfo())
      loadQuestions()
    } catch (error) {
      console.error('刷新数据失败:', error)
    }
  }, [])

  // 加载保存的分析结果
  const loadSavedAnalysis = () => {
    try {
      const savedAnalysis = Taro.getStorageSync('child_interest_analysis')
      const savedRecommendations = Taro.getStorageSync('child_recommendations')
      const savedQuestionCount = Taro.getStorageSync('last_analysis_question_count')

      if (savedAnalysis) {
        console.log('加载保存的分析结果:', savedAnalysis)
        setInterestAnalysis(savedAnalysis)
      }

      if (savedRecommendations && Array.isArray(savedRecommendations)) {
        console.log('加载保存的推荐内容:', savedRecommendations)
        setRecommendations(savedRecommendations)
      }

      if (savedQuestionCount) {
        console.log('上次分析时的问题数量:', savedQuestionCount)
        setLastAnalysisQuestionCount(savedQuestionCount)
      }
    } catch (error) {
      console.error('加载保存的分析结果失败:', error)
    }
  }

  const loadQuestions = () => {
    const allQuestions = getAllQuestions()
    // 按时间倒序排列
    setQuestions(allQuestions.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ))
  }

  // 分析兴趣点
  const handleAnalyze = async () => {
    if (questions.length === 0) {
      Taro.showToast({ title: '暂无提问记录', icon: 'none' })
      return
    }

    setIsAnalyzing(true)
    try {
      // 分析兴趣和特点，获取推荐内容
      const analysis = await analyzeChildInterests(questions)
      setInterestAnalysis(analysis)

      // 获取推荐内容（传入孩子的问题列表，以便根据问题进行推荐）
      const recommendations = await getRecommendations(
        questions,
        childInfo?.age || 6
      )
      setRecommendations(recommendations)

      // 保存分析结果到本地存储
      try {
        Taro.setStorageSync('child_interest_analysis', analysis)
        Taro.setStorageSync('child_recommendations', recommendations)
        Taro.setStorageSync('last_analysis_question_count', questions.length)
        setLastAnalysisQuestionCount(questions.length)
        console.log('分析结果已保存到本地存储，问题数量:', questions.length)
      } catch (saveError) {
        console.error('保存分析结果失败:', saveError)
      }

      setActiveTab('analysis')
      Taro.showToast({ title: '分析完成', icon: 'success' })
    } catch (error) {
      console.error('分析失败:', error)
      Taro.showToast({ title: '分析失败，请重试', icon: 'none' })
    } finally {
      setIsAnalyzing(false)
    }
  }

  // 返回聊天页面
  const handleBack = () => {
    Taro.navigateBack()
  }

  return (
    <View className="parent-page" style={{ paddingTop: `${statusBarHeight}px` }}>
      {/* 顶部信息区域 */}
      <View className="header-section">
        <View className="header-with-back">
          <View className="back-button" onClick={handleBack}>
            <Text className="back-icon">‹</Text>
            <Text className="back-text">返回</Text>
          </View>
          <Text className="header-title">家长中心</Text>
        </View>
        {childInfo && (
          <View className="child-info">
            <Text className="child-name">{childInfo.name}</Text>
            <Text className="child-age">
              {childInfo.stage !== undefined ? AGE_STAGE_LABELS[childInfo.stage as keyof typeof AGE_STAGE_LABELS] : `${childInfo.age}岁`}
            </Text>
          </View>
        )}
        <Text className="header-subtitle">
          了解孩子的探索足迹
        </Text>
      </View>

      {/* Tab 切换 */}
      <View className="tab-section">
        <View
          className={`tab-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <Text className="tab-label">提问历史</Text>
          <View className="tab-count">{questions.length}</View>
        </View>
        <View
          className={`tab-item ${activeTab === 'analysis' ? 'active' : ''}`}
          onClick={() => setActiveTab('analysis')}
        >
          <Text className="tab-label">兴趣分析</Text>
        </View>
      </View>

      {/* 提问历史 */}
      {activeTab === 'history' && (
        <ScrollView scrollY className="history-section">
          {questions.length === 0 ? (
            <View className="empty-state">
              <Text className="empty-emoji">📝</Text>
              <Text className="empty-text">还没有提问记录</Text>
              <Text className="empty-hint">鼓励孩子多提问吧！</Text>
            </View>
          ) : (
            questions.map((question) => (
              <View key={question.id} className="question-card">
                <View className="question-header">
                  <Text className="question-content">{question.content}</Text>
                  <Text className="question-time">
                    {formatRelativeTime(question.createdAt)}
                  </Text>
                </View>
                {question.answer && (
                  <View className="answer-section">
                    <Text className="answer-text">{question.answer.content}</Text>
                    {question.answer.simpleExplanation && (
                      <View className="simple-summary">
                        <Text className="summary-icon">💡</Text>
                        <Text className="summary-text">{question.answer.simpleExplanation}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* 兴趣分析 */}
      {activeTab === 'analysis' && (
        <ScrollView scrollY className="analysis-section">
          {!interestAnalysis ? (
            <View className="analysis-placeholder">
              <Text className="placeholder-emoji">🔍</Text>
              <Text className="placeholder-text">分析孩子的兴趣点</Text>
              <Text className="placeholder-hint">根据孩子的提问记录，我们AI会帮您分析孩子的兴趣特点并推荐适合的内容</Text>
              <Button
                className="analyze-button"
                onClick={handleAnalyze}
                disabled={isAnalyzing || questions.length === 0}
              >
                {isAnalyzing ? '分析中...' : '开始分析'}
              </Button>
            </View>
          ) : (
            <>
              {/* 重新分析部分（移到最前面） */}
              <View className="reanalyze-section">
                {/* 新问题提示 */}
                {questions.length > lastAnalysisQuestionCount && lastAnalysisQuestionCount > 0 && (
                  <View className="new-questions-hint">
                    <Text className="hint-icon">💡</Text>
                    <Text className="hint-text">
                      自上次分析以来，新增了 {questions.length - lastAnalysisQuestionCount} 个问题，点击重新分析可更新结果
                    </Text>
                  </View>
                )}

                <Button
                  className="reanalyze-button"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? '分析中...' : '重新分析'}
                </Button>
              </View>

              {/* 兴趣领域 */}
              <View className="analysis-card">
                <Text className="card-title">🌟 兴趣领域</Text>

                {/* 概述 */}
                {interestAnalysis.interestAnalysis?.overview && (
                  <View className="interest-overview">
                    <Text className="overview-label">概述</Text>
                    <Text className="overview-text">{cleanMarkdownBold(interestAnalysis.interestAnalysis.overview)}</Text>
                  </View>
                )}

                {/* 核心兴趣 */}
                {interestAnalysis.interestAnalysis?.coreInterests && filterValidItems(interestAnalysis.interestAnalysis.coreInterests).length > 0 && (
                  <View className="interest-section">
                    <Text className="section-subtitle">🎯 核心兴趣</Text>
                    <View className="interest-list">
                      {filterValidItems(interestAnalysis.interestAnalysis.coreInterests).map((interest, index) => (
                        <View key={index} className="interest-item">
                          <Text className="interest-dot">•</Text>
                          <Text className="interest-text interest-bold">{cleanMarkdownBold(interest)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 延伸兴趣 */}
                {interestAnalysis.interestAnalysis?.extendedInterests && filterValidItems(interestAnalysis.interestAnalysis.extendedInterests).length > 0 && (
                  <View className="interest-section">
                    <Text className="section-subtitle">🌈 延伸兴趣</Text>
                    <View className="interest-list">
                      {filterValidItems(interestAnalysis.interestAnalysis.extendedInterests).map((interest, index) => (
                        <View key={index} className="interest-item">
                          <Text className="interest-dot">•</Text>
                          <Text className="interest-text interest-bold">{cleanMarkdownBold(interest)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* 特点 */}
                {interestAnalysis.interestAnalysis?.characteristics && filterValidItems(interestAnalysis.interestAnalysis.characteristics).length > 0 && (
                  <View className="interest-section">
                    <Text className="section-subtitle">✨ 特点</Text>
                    <View className="interest-list">
                      {filterValidItems(interestAnalysis.interestAnalysis.characteristics).map((char, index) => (
                        <View key={index} className="interest-item">
                          <Text className="interest-dot">•</Text>
                          <Text className="interest-text interest-bold">{cleanMarkdownBold(char)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>

              {/* 性格特点 */}
              {interestAnalysis.personalityTraits && filterValidItems(interestAnalysis.personalityTraits).length > 0 && (
                <View className="analysis-card">
                  <Text className="card-title">🎭 性格特点</Text>
                  <View className="personality-list">
                    {filterValidItems(interestAnalysis.personalityTraits).map((trait, index) => (
                      <View key={index} className="personality-item">
                        <View className="personality-number">{index + 1}</View>
                        <Text className="personality-text personality-bold">{cleanMarkdownBold(trait)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* 推荐内容 */}
              {recommendations.length > 0 && recommendations.map((rec, recIndex) => (
                <View key={recIndex} className="analysis-card">
                  <Text className="card-title">
                    {rec.type === 'book' ? '📚 书籍推荐' : rec.type === 'animation' ? '🎬 动画片推荐' : '🎞️ 儿童电影推荐'}
                  </Text>

                  {/* 概述 */}
                  {rec.overview && (
                    <View className="recommend-overview">
                      <Text className="overview-label">概述</Text>
                      <Text className="overview-text">{cleanMarkdownBold(rec.overview)}</Text>
                    </View>
                  )}

                  {/* 推荐列表 */}
                  {rec.items && rec.items.map((item: any, itemIndex: number) => (
                    <View key={itemIndex} className="recommend-item">
                      <View className="recommend-header">
                        <Text className="recommend-title">《{cleanMarkdownBold(item.title)}》</Text>
                        <View className="recommend-age-badge">
                          <Text className="age-text">{cleanMarkdownBold(item.suitableAge)}</Text>
                        </View>
                      </View>
                      <View className="recommend-reason">
                        <Text className="reason-label">推荐理由：</Text>
                        <Text className="reason-text">{cleanMarkdownBold(item.description)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

export default Parent
