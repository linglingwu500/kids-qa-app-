import React, { useState, useEffect } from 'react'
import { View, Text, Button, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { getChildInfo, getAllQuestions } from '../../store/child'
import { analyzeChildInterests, getRecommendations } from '../../services/ai'
import { formatRelativeTime } from '../../utils/format'
import { Question, ChildAnalysis, Recommendation } from '../../types'
import './index.scss'

const Parent = () => {
  const [childInfo, setChildInfo] = useState(getChildInfo())
  const [questions, setQuestions] = useState<Question[]>([])
  const [activeTab, setActiveTab] = useState<'history' | 'analysis'>('history')
  const [interestAnalysis, setInterestAnalysis] = useState<ChildAnalysis | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // 加载问题历史
  useEffect(() => {
    try {
      loadQuestions()
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
      // 分析兴趣和特点
      const analysis = await analyzeChildInterests(questions)
      setInterestAnalysis(analysis)

      // 获取推荐内容
      const recommendations = await getRecommendations(
        analysis.interestTopics || [],
        childInfo?.age || 6
      )
      setRecommendations(recommendations)

      setActiveTab('analysis')
      Taro.showToast({ title: '分析完成', icon: 'success' })
    } catch (error) {
      console.error('分析失败:', error)
      Taro.showToast({ title: '分析失败，请重试', icon: 'none' })
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleRecommendationClick = (rec: Recommendation) => {
    // 复制推荐内容到剪贴板
    const typeText = rec.type === 'book' ? '书籍' : rec.type === 'animation' ? '动画片' : '影片'
    const content = `【${typeText}】${rec.title}\n适合年龄：${rec.ageRange}\n推荐理由：${rec.description}`
    Taro.setClipboardData({
      data: content,
      success: () => {
        Taro.showToast({ title: '已复制', icon: 'success' })
      }
    })
  }

  return (
    <View className="parent-page">
      {/* 顶部信息区域 */}
      <View className="header-section">
        <Text className="header-title">家长中心</Text>
        {childInfo && (
          <View className="child-info">
            <Text className="child-name">{childInfo.name}</Text>
            <Text className="child-age">{childInfo.age}岁</Text>
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
              {/* 兴趣领域 */}
              {interestAnalysis.interestTopics && interestAnalysis.interestTopics.length > 0 && (
                <View className="analysis-card">
                  <Text className="card-title">🌟 兴趣领域</Text>
                  <View className="tags-list">
                    {interestAnalysis.interestTopics.map((topic, index) => (
                      <View key={index} className="tag-item">
                        <Text className="tag-text">{topic}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* 性格特点 */}
              {interestAnalysis.personalityTraits && interestAnalysis.personalityTraits.length > 0 && (
                <View className="analysis-card">
                  <Text className="card-title">🎭 性格特点</Text>
                  <View className="traits-list">
                    {interestAnalysis.personalityTraits.map((trait, index) => (
                      <View key={index} className="trait-item">
                        <Text className="trait-dot">•</Text>
                        <Text className="trait-text">{trait}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* 学习风格 */}
              {interestAnalysis.learningStyle && (
                <View className="analysis-card">
                  <Text className="card-title">📚 学习风格</Text>
                  <Text className="learning-text">{interestAnalysis.learningStyle}</Text>
                </View>
              )}

              {/* 引导建议 */}
              {interestAnalysis.suggestions && interestAnalysis.suggestions.length > 0 && (
                <View className="analysis-card">
                  <Text className="card-title">💡 引导建议</Text>
                  <View className="suggestions-list">
                    {interestAnalysis.suggestions.map((suggestion, index) => (
                      <View key={index} className="suggestion-item">
                        <Text className="suggestion-num">{index + 1}.</Text>
                        <Text className="suggestion-text">{suggestion}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* 推荐内容 */}
              {recommendations.length > 0 && (
                <View className="recommendations-section">
                  <Text className="section-title">📖 推荐内容</Text>
                  <View className="recommendations-list">
                    {recommendations.map((rec) => (
                      <View
                        key={rec.id}
                        className="recommendation-card"
                        onClick={() => handleRecommendationClick(rec)}
                      >
                        <View className="rec-header">
                          <Text className="rec-type-badge">
                            {rec.type === 'book' ? '📚 书籍' : rec.type === 'animation' ? '🎬 动画片' : '🎬 影片'}
                          </Text>
                          <Text className="rec-age">{rec.ageRange}</Text>
                        </View>
                        <Text className="rec-title">{rec.title}</Text>
                        <Text className="rec-description">{rec.description}</Text>
                        {rec.tags && rec.tags.length > 0 && (
                          <View className="rec-tags">
                            {rec.tags.map((tag, index) => (
                              <Text key={index} className="rec-tag">{tag}</Text>
                            ))}
                          </View>
                        )}
                        <Text className="rec-hint">点击复制</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* 重新分析按钮 */}
              <View className="reanalyze-section">
                <Button
                  className="reanalyze-button"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing}
                >
                  重新分析
                </Button>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

export default Parent
