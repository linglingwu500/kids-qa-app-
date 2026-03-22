// 孩子信息类型
export interface ChildInfo {
  name: string
  age: number
  avatar?: string
  createdAt: string
}

// 问题类型
export interface Question {
  id: string
  content: string
  childName: string
  childAge: number
  childStage: number
  createdAt: string
  answer?: Answer
}

// 回答类型
export interface Answer {
  id: string
  questionId: string
  content: string
  simpleExplanation: string
  curiosityQuestions: string[]
  createdAt: string
}

// 孩子分析结果
export interface ChildAnalysis {
  rawAnalysis: string  // AI 的完整原始分析文本
  interestAnalysis: {
    overview: string  // 兴趣领域概述
    coreInterests: string[]  // 核心兴趣
    extendedInterests: string[]  // 延伸兴趣
    characteristics: string[]  // 特点
  }
  personalityTraits: string[]  // 性格特点，分点概述
  recommendations: Recommendation[]  // 推荐内容
}

// 推荐内容类型
export interface Recommendation {
  type: 'book' | 'animation' | 'movie'  // 类型
  overview: string  // 概述
  items: {
    title: string  // 标题
    description: string  // 推荐理由
    suitableAge: string  // 适合年龄
  }[]
}
