import Taro from '@tarojs/taro'
import { Question, ChildInfo, ChildAnalysis, Recommendation } from '../types'

const STORAGE_KEYS = {
  CHILD_INFO: 'child_info',
  QUESTIONS: 'questions',
  ANALYSIS: 'analysis',
  RECOMMENDATIONS: 'recommendations'
}

/**
 * 获取孩子信息
 */
export function getChildInfo(): ChildInfo | null {
  try {
    const data = Taro.getStorageSync(STORAGE_KEYS.CHILD_INFO)
    return data || null
  } catch (error) {
    console.error('获取孩子信息失败:', error)
    return null
  }
}

/**
 * 保存孩子信息
 */
export function saveChildInfo(info: ChildInfo): boolean {
  try {
    Taro.setStorageSync(STORAGE_KEYS.CHILD_INFO, info)
    return true
  } catch (error) {
    console.error('保存孩子信息失败:', error)
    return false
  }
}

/**
 * 获取所有问题
 */
export function getAllQuestions(): Question[] {
  try {
    const data = Taro.getStorageSync(STORAGE_KEYS.QUESTIONS)
    return data || []
  } catch (error) {
    console.error('获取问题列表失败:', error)
    return []
  }
}

/**
 * 保存问题
 */
export function saveQuestion(question: Question): boolean {
  try {
    const questions = getAllQuestions()
    questions.unshift(question) // 新问题放在前面
    Taro.setStorageSync(STORAGE_KEYS.QUESTIONS, questions)
    return true
  } catch (error) {
    console.error('保存问题失败:', error)
    return false
  }
}

/**
 * 更新问题（添加回答）
 */
export function updateQuestionWithAnswer(questionId: string, answer: any): boolean {
  try {
    const questions = getAllQuestions()
    const index = questions.findIndex(q => q.id === questionId)
    if (index !== -1) {
      questions[index].answer = answer
      Taro.setStorageSync(STORAGE_KEYS.QUESTIONS, questions)
      return true
    }
    return false
  } catch (error) {
    console.error('更新问题失败:', error)
    return false
  }
}

/**
 * 获取分析结果
 */
export function getChildAnalysis(): ChildAnalysis | null {
  try {
    const data = Taro.getStorageSync(STORAGE_KEYS.ANALYSIS)
    return data || null
  } catch (error) {
    console.error('获取分析结果失败:', error)
    return null
  }
}

/**
 * 保存分析结果
 */
export function saveChildAnalysis(analysis: ChildAnalysis): boolean {
  try {
    Taro.setStorageSync(STORAGE_KEYS.ANALYSIS, analysis)
    return true
  } catch (error) {
    console.error('保存分析结果失败:', error)
    return false
  }
}

/**
 * 获取推荐内容
 */
export function getRecommendations(): Recommendation[] {
  try {
    const data = Taro.getStorageSync(STORAGE_KEYS.RECOMMENDATIONS)
    return data || []
  } catch (error) {
    console.error('获取推荐内容失败:', error)
    return []
  }
}

/**
 * 保存推荐内容
 */
export function saveRecommendations(recommendations: Recommendation[]): boolean {
  try {
    Taro.setStorageSync(STORAGE_KEYS.RECOMMENDATIONS, recommendations)
    return true
  } catch (error) {
    console.error('保存推荐内容失败:', error)
    return false
  }
}

/**
 * 清除所有数据
 */
export function clearAllData(): boolean {
  try {
    Taro.removeStorageSync(STORAGE_KEYS.CHILD_INFO)
    Taro.removeStorageSync(STORAGE_KEYS.QUESTIONS)
    Taro.removeStorageSync(STORAGE_KEYS.ANALYSIS)
    Taro.removeStorageSync(STORAGE_KEYS.RECOMMENDATIONS)
    return true
  } catch (error) {
    console.error('清除数据失败:', error)
    return false
  }
}
