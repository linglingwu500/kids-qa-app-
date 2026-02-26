import { Answer } from '../types'
import { request } from '../utils/request'

// AI 服务配置
const AI_CONFIG = {
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: 'ce430a2eddae4513a1d691060b0309f1.hlJGURZ4HTFHxlos',
  model: 'glm-5' // 可选: glm-4, glm-4-flash, glm-3-turbo
}

/**
 * 调用 AI 生成适合儿童理解的回答
 */
export async function generateChildFriendlyAnswer(
  question: string,
  childAge: number,
  childStage: number,
  childName: string
): Promise<Answer> {
  try {
    const prompt = buildChildFriendlyPrompt(question, childAge, childStage, childName)

    console.log('=== AI请求开始 ===')
    console.log('URL:', AI_CONFIG.baseUrl + '/chat/completions')
    console.log('Model:', AI_CONFIG.model)

    const response = await request({
      url: AI_CONFIG.baseUrl + '/chat/completions',
      method: 'POST',
      header: {
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`
      },
      data: {
        model: AI_CONFIG.model,
        messages: [
          {
            role: 'system',
            content: getStageSystemPrompt(childStage)
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.8,
        max_tokens: 1500
      }
    })

    console.log('=== AI响应成功 ===')
    console.log('Response:', response)

    // 解析 OpenAI 兼容格式返回的回答
    if (!response.choices || response.choices.length === 0) {
      console.error('响应中没有choices字段')
      throw new Error('Invalid response format: missing choices')
    }

    const answerContent = response.choices[0].message?.content || ''
    console.log('Answer content:', answerContent)

    return parseAnswerResponse(answerContent, question)
  } catch (error) {
    console.error('=== AI 生成回答失败 ===')
    console.error('Error:', error)
    console.error('Error message:', error instanceof Error ? error.message : JSON.stringify(error))
    // 返回一个友好的错误回答
    return {
      id: Date.now().toString(),
      questionId: Date.now().toString(),
      content: '哎呀，我现在有点困惑，让我再想想。你可以换个方式问我吗？',
      simpleExplanation: '抱歉，我暂时没有理解你的问题。',
      curiosityQuestions: ['你还有什么想问的吗？'],
      createdAt: new Date().toISOString()
    }
  }
}

/**
 * 根据年龄段获取 System Prompt
 */
function getStageSystemPrompt(stage: number): string {
  // 根据年龄段确定语言复杂度和句子数量
  const stageConfig = {
    0: { age: '3-5岁', complexity: '非常简单、形象', sentences: '3-5句话', examples: '具体、可触摸的例子（比如"像苹果一样圆"）', style: '拟声词和叠词（比如"红红的"、"圆圆的"）' },
    1: { age: '6-7岁', complexity: '生动有趣、有逻辑', sentences: '4-6句话', examples: '具体但稍复杂一些的例子', style: '因果关系表达（因为...所以...）' },
    2: { age: '8-9岁', complexity: '系统、有条理', sentences: '5-8句话', examples: '抽象概念配合具体例子', style: '逻辑推理和分类' },
    3: { age: '10-12岁', complexity: '严谨、深入', sentences: '6-10句话', examples: '完整的科学概念和原理', style: '批判性思维和多视角' }
  }

  const config = stageConfig[stage] || stageConfig[0]

  return `你是一位精通儿童心理学、儿童教育学、善于与儿童沟通的专家。你的任务是回答${config.age}孩子的科学、自然、生活类问题。

回答原则：
1. 身份定位：你是孩子的好朋友，以朋友的身份和语气与孩子交流，用"我"自称，不要自称"老师"
2. 语言风格：${config.complexity}，使用${config.style}
3. 例子选择：使用${config.examples}
4. 情感表达：鼓励孩子的好奇心，说"你问得真好"、"这个问题很有趣"，让孩子觉得自己的问题有价值
5. 回答长度：${config.sentences}
6. 认知引导：根据孩子的认知水平，帮助TA理解世界，启发TA继续探索的好奇心`
}

/**
 * 构建适合儿童的提示词
 */
function buildChildFriendlyPrompt(
  question: string,
  childAge: number,
  childStage: number,
  childName: string
): string {
  return `
我叫${childName}，今年${childAge}岁了。我的问题是：${question}

请用以下方式回答我：
1. 用简单、生动、有趣的语言，符合${childAge}岁孩子的理解水平
2. 用生活化的比喻和例子
3. 回答要温暖、鼓励，让我觉得我的问题很有价值
4. 最后给我1-2个有趣的问题，这些问题必须与原问题直接相关，是原问题的延伸或深入，比如：
   - 如果问"天为什么是蓝色的？"，延伸问题可以是"那晚上为什么是黑色的？"或"彩虹为什么有这么多颜色？"
   - 如果问"小鸟为什么会飞？"，延伸问题可以是"所有的鸟都会飞吗？"或"飞机为什么能飞？"

请按以下格式回答：
【回答】：你的回答内容

【给小朋友的话】：简单的一句话总结

【继续探索】：1-2个与原问题相关的延伸问题
`
}

/**
 * 解析 AI 返回的回答
 */
function parseAnswerResponse(content: string, questionId: string): Answer {
  console.log('=== 解析 AI 响应 ===')
  console.log('原始内容:', content)

  // 提取回答内容 - 使用贪婪匹配获取完整内容
  const answerMatch = content.match(/【回答】：([\s\S]*?)(?=\n【|$)/)
  const answerContent = answerMatch ? answerMatch[1].trim() : content.trim()

  console.log('提取的回答内容:', answerContent)

  // 提取简单解释
  const simpleMatch = content.match(/【给小朋友的话】：([\s\S]*?)(?=\n【|$)/)
  const simpleExplanation = simpleMatch ? simpleMatch[1].trim() : '这个问题很有趣！'

  console.log('提取的简单解释:', simpleExplanation)

  // 提取引导性问题
  const curiosityMatch = content.match(/【继续探索】：([\s\S]*?)(?=$|\n*$)/)
  const curiosityQuestions = curiosityMatch
    ? curiosityMatch[1]
        .split(/[0-9]+\.[\s]*/)
        .filter(q => q.trim().length > 0)
        .map(q => q.trim())
    : []

  console.log('提取的延伸问题:', curiosityQuestions)

  const result = {
    id: Date.now().toString(),
    questionId,
    content: answerContent,
    simpleExplanation,
    curiosityQuestions,
    createdAt: new Date().toISOString()
  }

  console.log('解析结果:', result)
  return result
}

/**
 * 生成孩子的兴趣和性格分析
 */
export async function analyzeChildInterests(
  questions: Array<{ content: string; createdAt: string }>
) {
  try {
    const prompt = `
根据孩子的问题分析兴趣和特点：
${questions.map((q, i) => `${i + 1}. ${q.content}`).join('\n')}

分析内容：兴趣领域、性格特点、学习风格、给家长的建议
`

    console.log('=== 开始分析孩子兴趣 ===')
    console.log('问题数量:', questions.length)

    const response = await request({
      url: AI_CONFIG.baseUrl + '/chat/completions',
      method: 'POST',
      header: {
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`
      },
      data: {
        model: AI_CONFIG.model,
        messages: [
          {
            role: 'system',
            content: '你是一位儿童教育专家，通过问题分析孩子的兴趣和特点。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      }
    })

    // 解析响应（OpenAI 兼容格式）
    const content = response.choices[0].message?.content || ''
    console.log('=== AI返回的分析内容 ===')
    console.log(content)

    const result = parseAnalysisResponse(content)
    console.log('=== 解析结果 ===')
    console.log('兴趣领域:', result.interestTopics)
    console.log('性格特点:', result.personalityTraits)
    console.log('学习风格:', result.learningStyle)
    console.log('引导建议:', result.suggestions)

    return result
  } catch (error) {
    console.error('分析孩子兴趣失败:', error)
    return {
      interestTopics: ['探索'],
      personalityTraits: ['好奇心强'],
      learningStyle: '喜欢提问',
      suggestions: ['多鼓励孩子提问', '和孩子一起探索答案']
    }
  }
}

/**
 * 根据孩子兴趣推荐内容
 */
export async function getRecommendations(
  interests: string[],
  childAge: number
): Promise<any[]> {
  try {
    const prompt = `
为${childAge}岁儿童推荐适合的优质内容，孩子的兴趣包括：${interests.join('、')}

请推荐以下类型的内容：
1. 1-2本儿童书籍
2. 1-2部动画片
3. 1部儿童电影

每个推荐包括：类型（书籍/动画片/影片）、标题、适合年龄、推荐理由、关联主题
`

    const response = await request({
      url: AI_CONFIG.baseUrl + '/chat/completions',
      method: 'POST',
      header: {
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`
      },
      data: {
        model: AI_CONFIG.model,
        messages: [
          {
            role: 'system',
            content: '你是一位儿童内容推荐专家，为孩子推荐健康优质的书籍、动画片和电影。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      }
    })

    // 解析响应（OpenAI 兼容格式）
    const content = response.choices[0].message?.content || ''
    console.log('=== 推荐内容 ===')
    console.log(content)
    return parseRecommendationResponse(content)
  } catch (error) {
    console.error('获取推荐失败:', error)
    return []
  }
}

// 解析分析响应
function parseAnalysisResponse(content: string) {
  console.log('=== 开始解析分析内容 ===')
  const result = {
    interestTopics: [] as string[],
    personalityTraits: [] as string[],
    learningStyle: '',
    suggestions: [] as string[]
  }

  // 尝试多种可能的格式匹配
  const interestPatterns = [
    /【兴趣领域】[：:]\s*([\s\S]*?)(?=\n【|兴趣|性格|学习|引导|$)/i,
    /兴趣[：:]\s*([\s\S]*?)(?=\n【|性格|学习|引导|$)/i,
    /感兴趣[的]*[领域]?\s*[：:]\s*([\s\S]*?)(?=\n[【兴趣性格学习引导]|$)/i
  ]

  const personalityPatterns = [
    /【性格特点】[：:]\s*([\s\S]*?)(?=\n【|学习|引导|$)/i,
    /性格[：:]\s*([\s\S]*?)(?=\n【|学习|引导|$)/i,
    /性格特点\s*[：:]\s*([\s\S]*?)(?=\n[【学习引导]|$)/i
  ]

  const stylePatterns = [
    /【学习风格】[：:]\s*([\s\S]*?)(?=\n【|引导|$)/i,
    /学习风格\s*[：:]\s*([\s\S]*?)(?=\n【|引导|$)/i
  ]

  const suggestionPatterns = [
    /【引导建议】[：:]\s*([\s\S]*?)(?=\n【|$)/i,
    /引导建议\s*[：:]\s*([\s\S]*?)(?=\n【|$)/i,
    /给家长[的]*建议\s*[：:]\s*([\s\S]*?)(?=\n【|$)/i
  ]

  // 解析兴趣领域
  for (const pattern of interestPatterns) {
    const match = content.match(pattern)
    if (match) {
      result.interestTopics = match[1]
        .split(/[、,，\n]/)
        .filter((t: string) => t.trim())
        .map((t: string) => t.trim())
      console.log('匹配到兴趣领域:', result.interestTopics)
      break
    }
  }

  // 解析性格特点
  for (const pattern of personalityPatterns) {
    const match = content.match(pattern)
    if (match) {
      result.personalityTraits = match[1]
        .split(/[、,，\n]/)
        .filter((t: string) => t.trim())
        .map((t: string) => t.trim())
      console.log('匹配到性格特点:', result.personalityTraits)
      break
    }
  }

  // 解析学习风格
  for (const pattern of stylePatterns) {
    const match = content.match(pattern)
    if (match) {
      result.learningStyle = match[1].trim()
      console.log('匹配到学习风格:', result.learningStyle)
      break
    }
  }

  // 解析引导建议
  for (const pattern of suggestionPatterns) {
    const match = content.match(pattern)
    if (match) {
      result.suggestions = match[1]
        .split(/\d+\.[\s]*/)
        .filter((s: string) => s.trim())
        .map((s: string) => s.trim())
      console.log('匹配到引导建议:', result.suggestions)
      break
    }
  }

  // 如果仍然解析失败，提供默认值
  if (result.interestTopics.length === 0) {
    console.log('未匹配到兴趣领域，使用默认值')
    result.interestTopics = ['科学探索', '自然观察', '好奇提问']
  }

  if (result.personalityTraits.length === 0) {
    console.log('未匹配到性格特点，使用默认值')
    result.personalityTraits = ['好奇心强', '喜欢探索']
  }

  if (!result.learningStyle) {
    console.log('未匹配到学习风格，使用默认值')
    result.learningStyle = '通过提问和探索学习'
  }

  if (result.suggestions.length === 0) {
    console.log('未匹配到引导建议，使用默认值')
    result.suggestions = [
      '多鼓励孩子提出问题',
      '和孩子一起寻找答案',
      '选择适合孩子年龄的书籍',
      '用简单易懂的语言解释',
      '保护孩子的好奇心'
    ]
  }

  console.log('=== 解析完成 ===')
  return result
}

// 解析推荐响应
function parseRecommendationResponse(content: string): any[] {
  console.log('=== 开始解析推荐内容 ===')
  console.log('原始内容:', content)

  const recommendations: any[] = []

  // 尝试识别标题和对应的内容
  const titleMatches = Array.from(content.matchAll(/[标题|书名|片名|名称][：:]\s*([^\n【]+)/gi))

  for (const titleMatch of titleMatches) {
    const title = titleMatch[1].trim()
    const titleStart = titleMatch.index

    // 查找该推荐内容所在的区域（下一个标题或文档结束）
    const nextTitleMatch = Array.from(content.matchAll(/[标题|书名|片名|名称][：:]/gi))
      .find(m => m.index > titleStart)

    const titleEnd = nextTitleMatch ? nextTitleMatch.index : content.length
    const section = content.slice(titleStart, titleEnd)

    // 提取类型
    let type = 'book'
    const typeMatch = section.match(/[类型][：:]\s*([^\n【]+)/i) ||
                     section.match(/(书籍|图书|书)[^标题]*/i) && ['书籍'] ||
                     section.match(/(动画|卡通)[^标题]*/i) && ['动画片'] ||
                     section.match(/(电影|影片)[^标题]*/i) && ['影片']

    if (typeMatch) {
      const typeText = Array.isArray(typeMatch) ? typeMatch[0] : typeMatch[1]
      if (typeText.includes('影片') || typeText.includes('电影')) {
        type = 'video'
      } else if (typeText.includes('动画') || typeText.includes('卡通')) {
        type = 'animation'
      } else if (typeText.includes('书')) {
        type = 'book'
      }
    }

    // 提取适合年龄
    const ageMatch = section.match(/[适合年龄|适用年龄|推荐年龄][：:]\s*([^\n【]+)/i)

    // 提取推荐理由
    const reasonMatch = section.match(/[推荐理由][：:]\s*([\s\S]*?)(?=\n[【\n]|推荐|$)/i)

    // 提取关联主题
    const topicMatch = section.match(/[关联主题][：:]\s*([^\n【]+)/i)

    if (title) {
      recommendations.push({
        id: Date.now().toString() + '_' + recommendations.length,
        type,
        title,
        ageRange: ageMatch ? ageMatch[1].trim() : '适合该年龄段',
        description: reasonMatch ? reasonMatch[1].trim() : '',
        tags: topicMatch
          ? topicMatch[1]
              .split(/[、,，]/)
              .filter((t: string) => t.trim())
              .map((t: string) => t.trim())
          : []
      })
    }
  }

  // 如果解析失败，返回一些默认推荐
  if (recommendations.length === 0) {
    console.log('解析失败，返回默认推荐')
    return [
      {
        id: '1',
        type: 'book',
        title: '神奇校车',
        ageRange: '适合3-8岁',
        description: '经典科普绘本，通过生动有趣的故事带孩子探索科学世界',
        tags: ['科普', '探索', '科学']
      },
      {
        id: '2',
        type: 'animation',
        title: '小猪佩奇',
        ageRange: '适合2-5岁',
        description: '温馨的家庭故事，培养孩子的生活习惯和社交能力',
        tags: ['生活', '社交', '学习']
      },
      {
        id: '3',
        type: 'video',
        title: '疯狂动物城',
        ageRange: '适合6岁以上',
        description: '精彩的动画电影，传递友谊、梦想和勇气',
        tags: ['成长', '友谊', '梦想']
      }
    ]
  }

  console.log('=== 解析完成 ===')
  console.log('推荐数量:', recommendations.length)
  recommendations.forEach((rec, i) => {
    console.log(`${i + 1}. [${rec.type}] ${rec.title}`)
  })

  return recommendations
}
