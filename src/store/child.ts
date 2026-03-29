import Taro from '@tarojs/taro'
import { Question, ChildInfo, ChildAnalysis, Recommendation } from '../types'

const STORAGE_KEYS = {
  CHILD_INFO: 'child_info',
  QUESTIONS: 'questions',
  ANALYSIS: 'analysis',
  RECOMMENDATIONS: 'recommendations'
}

/**
 * 初始化默认孩子信息
 */
export function initChildInfo(selectedStage: number = 0): ChildInfo {
  const stageAgeMap: Record<number, number> = {
    0: 4,  // 3-5岁，默认4岁
    1: 6,  // 6-7岁，默认6岁
    2: 8,  // 8-9岁，默认8岁
    3: 11  // 10-12岁，默认11岁
  }

  const defaultInfo: ChildInfo = {
    name: '小朋友',
    age: stageAgeMap[selectedStage] || 4,
    stage: selectedStage,  // 保存年龄段
    createdAt: new Date().toISOString()
  }

  saveChildInfo(defaultInfo)
  console.log('初始化孩子信息:', defaultInfo)
  return defaultInfo
}

/**
 * 获取孩子信息（如果不存在则自动初始化）
 */
export function getChildInfo(selectedStage: number = 0): ChildInfo | null {
  try {
    const data = Taro.getStorageSync(STORAGE_KEYS.CHILD_INFO)
    if (!data) {
      // 如果没有孩子信息，自动初始化
      return initChildInfo(selectedStage)
    }
    return data
  } catch (error) {
    console.error('获取孩子信息失败:', error)
    // 出错时也尝试初始化
    return initChildInfo(selectedStage)
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
