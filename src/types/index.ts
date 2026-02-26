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
  childName: string
  childAge: number
  totalQuestions: number
  interestTopics: string[]
  personalityTraits: string[]
  learningStyle: string
  suggestions: string[]
}

// 推荐内容类型
export interface Recommendation {
  id: string
  type: 'book' | 'animation' | 'game' | 'video'
  title: string
  description: string
  ageRange: string
  coverImage?: string
  tags: string[]
  relatedTopics: string[]
  rating?: number
}
