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
  rawAnalysis: string  // AI 的原始分析文本
  recommendations: Recommendation[]  // 推荐内容
}

// 推荐内容类型
export interface Recommendation {
  rawAnalysis: string  // AI 对该推荐内容的分析
}
