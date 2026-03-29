import { Answer } from '../types'
import { request } from '../utils/request'
import { getGLMApiKey, DOUBAO_CONFIG } from '../config/env'

/**
 * 对话历史消息接口
 */
interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

// AI 服务配置 - 使用豆包 LLM
const AI_CONFIG = {
  baseUrl: DOUBAO_CONFIG.API_ENDPOINT,
  get apiKey(): string {
    // 优先使用专门的 LLM API Key（方舟平台），否则使用 Access Key
    const llmApiKey = DOUBAO_CONFIG.LLM_API_KEY
    if (llmApiKey) {
      console.log('使用方舟 LLM API Key')
      return llmApiKey
    }
    const accessKey = DOUBAO_CONFIG.ACCESS_KEY
    console.log('使用 Access Key 作为备用')
    return accessKey
  },
  get model(): string {
    // 使用配置的推理端点 ID
    const model = DOUBAO_CONFIG.LLM_MODEL || 'ep-20250403001607-h8hxw'
    console.log('使用推理端点:', model)
    return model
  }
}

console.log('=== AI 服务配置 ===')
console.log('使用服务:', '豆包 LLM')
console.log('API Endpoint:', AI_CONFIG.baseUrl)
console.log('Model:', AI_CONFIG.model)

/**
 * 调用 AI 生成适合儿童理解的回答
 * @param question 当前问题
 * @param history 对话历史（用于多轮对话上下文）
 * @param childAge 孩子年龄
 * @param childStage 认知发展阶段
 * @param childName 孩子名字
 */
export async function generateChildFriendlyAnswer(
  question: string,
  history: ConversationMessage[],
  childAge: number,
  childStage: number,
  childName: string
): Promise<Answer> {
  try {
    const prompt = buildChildFriendlyPrompt(question, childAge, childStage, childName)

    console.log('=== AI请求开始 ===')
    console.log('URL:', AI_CONFIG.baseUrl + '/chat/completions')
    console.log('Model:', AI_CONFIG.model)
    console.log('API Key:', AI_CONFIG.apiKey ? `已配置: ${AI_CONFIG.apiKey.substring(0, 10)}...` : '未配置')
    console.log('API Key 长度:', AI_CONFIG.apiKey?.length || 0)
    console.log('对话历史长度:', history.length)
    console.log('当前问题:', question)

    // 检查 API Key 是否配置
    if (!AI_CONFIG.apiKey) {
      throw new Error('豆包 API Key 未配置，请在 .env 文件中设置 DOUBAO_ACCESS_KEY')
    }

    // 构建 messages 数组，包含系统提示词、历史对话和当前问题
    // 注意：对话历史中不包含 system 消息，避免旧的配置影响新的回答
    const messages: Array<{ role: string; content: string }> = [
      {
        role: 'system',
        content: getStageSystemPrompt(childStage)
      },
      // 添加对话历史（只添加 user/assistant 消息，过滤掉 system 消息）
      ...history.filter(msg => msg.role !== 'system').slice(-12),
      {
        role: 'user',
        content: prompt
      }
    ]

    console.log('发送的消息数量:', messages.length)

    // 打印完整的 messages 内容（格式化输出）
    console.log('========== 发送给 AI 的完整输入 ==========')
    messages.forEach((msg, index) => {
      console.log(`消息 ${index + 1}:`)
      console.log(`  角色: ${msg.role}`)
      console.log(`  内容: ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}`)
    })
    console.log('========================================')

    const response = await request({
      url: AI_CONFIG.baseUrl + '/chat/completions',
      method: 'POST',
      header: {
        'Authorization': `Bearer ${AI_CONFIG.apiKey}`
      },
      data: {
        model: AI_CONFIG.model,
        messages,
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
6. 认知引导：根据孩子的认知水平，帮助TA理解世界，启发TA继续探索的好奇心

**多轮对话上下文理解（非常重要）：**
- 仔细阅读对话历史，理解孩子当前问题所指的具体对象
- 如果孩子的问题使用了代词（如"他们"、"它"、"这个"），必须从对话历史中找到对应的指代对象
- 孩子的问题通常是对你最后一句"继续探索"问题的回应，要延续那个话题
- 例如：如果你最后问"不会飞的小鸟，他们喜欢在哪里玩呢？"而孩子问"他们最喜欢到哪里玩？"，"他们"指的是"不会飞的小鸟"，不是所有小鸟
- 保持话题的连贯性，不要跳跃到无关的主题
- 利用上下文准确理解孩子的真实意图`
}

/**
 * 根据年龄段获取对应的描述
 */
function getStageAgeRange(stage: number): string {
  const stageConfig = {
    0: '3-5岁',
    1: '6-7岁',
    2: '8-9岁',
    3: '10-12岁'
  }
  return stageConfig[stage] || stageConfig[0]
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
  // 根据选择的年龄段获取描述
  const stageAgeRange = getStageAgeRange(childStage)

  return `
我叫${childName}，属于${stageAgeRange}年龄段。我的问题是：${question}

请用以下方式回答我：
1. 用简单、生动、有趣的语言，符合${stageAgeRange}孩子的理解水平
2. 用生活化的比喻和例子
3. 回答要温暖、鼓励，让我觉得我的问题很有价值

**上下文理解（关键）：**
- 我的问题很可能是在回应你刚才问的"继续探索"问题，请延续那个话题回答
- 如果我的问题中有代词（"他们"、"它"、"这个"），请从对话历史中找到准确的指代对象
- 保持话题连贯，不要突然改变主题

最后给我1个有趣的探索问题，这个问题必须与当前话题直接相关，是当前话题的延伸或深入，比如：
   - 如果问"天为什么是蓝色的？"，探索问题可以是"那晚上为什么是黑色的？"或"彩虹为什么有这么多颜色？"
   - 如果问"小鸟为什么会飞？"，探索问题可以是"所有的鸟都会飞吗？"或"飞机为什么能飞？"

请按以下格式回答：
【回答】：你的回答内容

【给小朋友的话】：简单的一句话总结

【继续探索】：1个与当前话题相关的探索问题
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

请按以下格式进行分析：

【兴趣领域】
概述：（用1-2句话总结孩子的整体兴趣特点）

核心兴趣：
- 列出3-5个孩子最感兴趣的主题

延伸兴趣：
- 列出2-3个与核心兴趣相关的延伸主题

特点：
- 列出2-3个孩子兴趣探索的特点

【性格特点】
- 列出3-5点孩子的性格特点，每点用一句话描述

请用温暖、专业的语气进行分析。
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
            content: '你是一位儿童教育专家，善于通过孩子的问题分析其兴趣领域和性格特点。'
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
    const rawAnalysis = response.choices[0].message?.content || ''
    console.log('=== AI返回的分析内容（原始）===')
    console.log('完整内容:', rawAnalysis)
    console.log('内容长度:', rawAnalysis.length)

    // 解析分析内容
    const parsed = parseAnalysisContent(rawAnalysis)

    console.log('=== 解析后的兴趣领域 ===')
    console.log('概述:', parsed.interestAnalysis.overview)
    console.log('核心兴趣:', parsed.interestAnalysis.coreInterests)
    console.log('延伸兴趣:', parsed.interestAnalysis.extendedInterests)
    console.log('特点:', parsed.interestAnalysis.characteristics)

    console.log('=== 解析后的性格特点 ===')
    console.log('性格特点:', parsed.personalityTraits)

    return {
      rawAnalysis,
      ...parsed,
      recommendations: []
    }
  } catch (error) {
    console.error('分析孩子兴趣失败:', error)
    return {
      rawAnalysis: '抱歉，分析暂时无法完成，请稍后再试。',
      interestAnalysis: {
        overview: '暂时无法获取',
        coreInterests: [],
        extendedInterests: [],
        characteristics: []
      },
      personalityTraits: [],
      recommendations: []
    }
  }
}

/**
 * 解析分析内容
 * 优先解析兴趣领域，然后解析性格特点
 */
function parseAnalysisContent(content: string) {
  console.log('========== 开始解析分析内容 ==========')
  console.log('原始内容:', content)

  // 结果对象
  const result = {
    interestAnalysis: {
      overview: '孩子对多个领域都表现出好奇心',
      coreInterests: [] as string[],
      extendedInterests: [] as string[],
      characteristics: [] as string[]
    },
    personalityTraits: [] as string[]
  }

  // ==================== 1. 解析兴趣领域部分 ====================
  // 匹配到性格特点或结尾
  const interestSectionMatch = content.match(/【兴趣领域】[\s\S]*?(?=(?:【性格特点】|给您的|希望这份|$))/)

  if (interestSectionMatch) {
    const interestSection = interestSectionMatch[0]
    console.log('✓ 提取到兴趣领域部分, 长度:', interestSection.length)

    // 1.1 解析概述 - 支持 ** 加粗标记
    const overviewMatch = interestSection.match(/\*{0,2}概述[:：]\s*\*{0,2}\s*([\s\S]+?)\n\s*\*{0,2}(?:核心兴趣|延伸兴趣|特点|【)/)
    if (overviewMatch) {
      result.interestAnalysis.overview = overviewMatch[1].trim().replace(/\n+/g, ' ')
      console.log('✓ 概述:', result.interestAnalysis.overview)
    } else {
      console.log('✗ 概述匹配失败')
    }

    // 1.2 解析核心兴趣
    const coreMatch = interestSection.match(/\*{0,2}核心兴趣[:：]\s*\*{0,2}\s*\n([\s\S]+?)\n\s*\*{0,2}(?:延伸兴趣|特点|【)/)
    if (coreMatch) {
      result.interestAnalysis.coreInterests = extractListItems(coreMatch[1])
      console.log('✓ 核心兴趣:', result.interestAnalysis.coreInterests)
    } else {
      console.log('✗ 核心兴趣匹配失败')
    }

    // 1.3 解析延伸兴趣
    const extendedMatch = interestSection.match(/\*{0,2}延伸兴趣[:：]\s*\*{0,2}\s*\n([\s\S]+?)\n\s*\*{0,2}(?:特点|【)/)
    if (extendedMatch) {
      result.interestAnalysis.extendedInterests = extractListItems(extendedMatch[1])
      console.log('✓ 延伸兴趣:', result.interestAnalysis.extendedInterests)
    } else {
      console.log('✗ 延伸兴趣匹配失败')
    }

    // 1.4 解析特点
    const characteristicsMatch = interestSection.match(/\*{0,2}特点[:：]\s*\*{0,2}\s*\n([\s\S]+?)(?:\n\s*\*{0,2}【|$)/)
    if (characteristicsMatch) {
      result.interestAnalysis.characteristics = extractListItems(characteristicsMatch[1])
      console.log('✓ 特点:', result.interestAnalysis.characteristics)
    } else {
      console.log('✗ 特点匹配失败')
    }
  } else {
    console.log('✗ 兴趣领域部分匹配失败')
  }

  // ==================== 2. 解析性格特点部分 ====================
  const personalitySectionMatch = content.match(/【性格特点】\s*([\s\S]*?)(?=\n\s*(?:给您的|希望这份)|$)/)

  if (personalitySectionMatch) {
    const personalityText = personalitySectionMatch[1].trim()
    result.personalityTraits = extractListItems(personalityText)
    console.log('✓ 性格特点:', result.personalityTraits)
  } else {
    console.log('✗ 性格特点匹配失败，尝试直接提取')
    // 备用方案：直接提取所有列表项
    const personalitySectionMatch2 = content.match(/【性格特点】[\s\S]*?$/)
    if (personalitySectionMatch2) {
      const personalityText = personalitySectionMatch2[0]
        .replace(/【性格特点】\s*/, '')
        .replace(/\n\s*(?:给您的温馨建议|希望这份)[\s\S]+$/, '') // 移除结尾建议
        .trim()
      result.personalityTraits = extractListItems(personalityText)
      console.log('✓ 性格特点(备用):', result.personalityTraits)
    }
  }

  console.log('========== 解析完成 ==========')

  return result
}

/**
 * 提取列表项 - 支持多种格式
 * 过滤无意义内容（如 --, ###, 空内容等）
 */
function extractListItems(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return []
  }

  console.log('  提取列表项, 输入前150字符:', text.substring(0, 150))

  // 按行分割
  const lines = text.split(/\n/).map(line => line.trim()).filter(line => line.length > 0)

  const items: string[] = []

  for (const line of lines) {
    // 移除列表标记和 Markdown 格式
    let cleaned = line
      .replace(/^\*{1,2}/, '')              // 移除开头的 ** 或 *
      .replace(/\*{1,2}$/, '')              // 移除结尾的 ** 或 *
      .replace(/^\d+[\.\、\s]+/, '')        // 1. 或 1、
      .replace(/^[-•·▪●]\s*/, '')            // - • · ▪ ●
      .trim()

    // 过滤条件：
    // 1. 内容长度 > 0
    // 2. 不是纯符号（如 ---, ###, ***）
    // 3. 不是标题行
    // 4. 不是建议部分的开头
    const isMeaningful = cleaned.length > 0 &&
                         !cleaned.match(/^[-=#*]{3,}$/) &&  // 不是 ---, ###, ***
                         !cleaned.match(/^(?:核心兴趣|延伸兴趣|特点|性格特点|兴趣领域|概述)/) &&
                         !cleaned.match(/^(?:给您的|希望|温馨建议)/)

    if (isMeaningful) {
      items.push(cleaned)
    }
  }

  console.log('  提取结果:', items)
  return items
}

/**
 * 根据孩子兴趣推荐内容
 */
export async function getRecommendations(
  questions: Array<{ content: string; createdAt: string }>,
  childAge: number
): Promise<any[]> {
  try {
    // 提取最近的5个问题作为参考
    const recentQuestions = questions.slice(-5).map(q => q.content)

    const prompt = `
孩子今年${childAge}岁，最近问了这些问题：
${recentQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

请根据孩子的提问内容，分析孩子的兴趣点，并推荐相关的内容。请按以下格式推荐：

【书籍推荐】
概述：（用1-2句话说明书籍推荐的整体方向）
推荐1：《书名》
- 推荐理由：详细的推荐说明
- 适合年龄：X-Y岁

推荐2：《书名》
- 推荐理由：详细的推荐说明
- 适合年龄：X-Y岁

【动画片推荐】
概述：（用1-2句话说明动画片推荐的整体方向）
推荐1：《片名》
- 推荐理由：详细的推荐说明
- 适合年龄：X-Y岁

推荐2：《片名》
- 推荐理由：详细的推荐说明
- 适合年龄：X-Y岁

【儿童电影推荐】
概述：（用1-2句话说明电影推荐的整体方向）
推荐1：《片名》
- 推荐理由：详细的推荐说明
- 适合年龄：X-Y岁

请用温暖、专业的语气，给出详细的推荐理由，帮助家长选择与孩子兴趣高度相关的优质内容。
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
            content: '你是一位儿童内容推荐专家，善于根据孩子的提问发现其兴趣点，并推荐高度相关的优质书籍、动画片和电影。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      }
    })

    // 解析响应（OpenAI 兼容格式）
    const rawAnalysis = response.choices[0].message?.content || ''
    console.log('=== AI返回的推荐内容 ===')
    console.log('原始内容长度:', rawAnalysis.length)
    console.log('原始内容:', rawAnalysis)

    // 解析推荐内容
    const parsed = parseRecommendations(rawAnalysis, childAge)

    return parsed
  } catch (error) {
    console.error('获取推荐失败:', error)
    return []
  }
}

/**
 * 解析推荐内容
 */
function parseRecommendations(content: string, childAge: number): any[] {
  const recommendations = []

  // 解析书籍推荐
  const bookSection = content.match(/【书籍推荐】([\s\S]*?)(?=【动画片推荐】|【儿童电影推荐】|$)/)
  if (bookSection) {
    const sectionContent = bookSection[1]

    // 提取概述
    const overviewMatch = sectionContent.match(/概述[:：]\s*([^\n]+)/)
    const bookOverview = overviewMatch ? overviewMatch[1].trim() : '根据孩子兴趣精选的优质书籍'

    const bookItems: any[] = []

    // 查找所有推荐项（以"推荐"开头或以《开头）
    const itemMatches = sectionContent.match(/(?:推荐\d*[:：])?\s*《(.+?)》[\s\S]*?推荐理由[:：]\s*([^\n]+)[\s\S]*?适合年龄[:：]\s*([^\n]+)/g)

    if (itemMatches) {
      itemMatches.forEach(item => {
        const titleMatch = item.match(/《(.+?)》/)
        const reasonMatch = item.match(/推荐理由[:：]\s*(.+)/)
        const ageMatch = item.match(/适合年龄[:：]\s*(.+)/)

        if (titleMatch && reasonMatch && ageMatch) {
          bookItems.push({
            title: titleMatch[1].trim(),
            description: reasonMatch[1].trim(),
            suitableAge: ageMatch[1].trim()
          })
        }
      })
    }

    recommendations.push({
      type: 'book',
      overview: bookOverview,
      items: bookItems.length > 0 ? bookItems : [{ title: '推荐内容生成中...', description: '稍后更新', suitableAge: `${childAge}岁` }]
    })
  }

  // 解析动画片推荐
  const animationSection = content.match(/【动画片推荐】([\s\S]*?)(?=【儿童电影推荐】|$)/)
  if (animationSection) {
    const sectionContent = animationSection[1]

    const overviewMatch = sectionContent.match(/概述[:：]\s*([^\n]+)/)
    const animationOverview = overviewMatch ? overviewMatch[1].trim() : '根据孩子兴趣精选的优质动画片'

    const animationItems: any[] = []
    const itemMatches = sectionContent.match(/(?:推荐\d*[:：])?\s*《(.+?)》[\s\S]*?推荐理由[:：]\s*([^\n]+)[\s\S]*?适合年龄[:：]\s*([^\n]+)/g)

    if (itemMatches) {
      itemMatches.forEach(item => {
        const titleMatch = item.match(/《(.+?)》/)
        const reasonMatch = item.match(/推荐理由[:：]\s*(.+)/)
        const ageMatch = item.match(/适合年龄[:：]\s*(.+)/)

        if (titleMatch && reasonMatch && ageMatch) {
          animationItems.push({
            title: titleMatch[1].trim(),
            description: reasonMatch[1].trim(),
            suitableAge: ageMatch[1].trim()
          })
        }
      })
    }

    recommendations.push({
      type: 'animation',
      overview: animationOverview,
      items: animationItems.length > 0 ? animationItems : [{ title: '推荐内容生成中...', description: '稍后更新', suitableAge: `${childAge}岁` }]
    })
  }

  // 解析电影推荐
  const movieSection = content.match(/【儿童电影推荐】([\s\S]*?)$/)
  if (movieSection) {
    const sectionContent = movieSection[1]

    const overviewMatch = sectionContent.match(/概述[:：]\s*([^\n]+)/)
    const movieOverview = overviewMatch ? overviewMatch[1].trim() : '根据孩子兴趣精选的优质儿童电影'

    const movieItems: any[] = []
    const itemMatches = sectionContent.match(/(?:推荐\d*[:：])?\s*《(.+?)》[\s\S]*?推荐理由[:：]\s*([^\n]+)[\s\S]*?适合年龄[:：]\s*([^\n]+)/g)

    if (itemMatches) {
      itemMatches.forEach(item => {
        const titleMatch = item.match(/《(.+?)》/)
        const reasonMatch = item.match(/推荐理由[:：]\s*(.+)/)
        const ageMatch = item.match(/适合年龄[:：]\s*(.+)/)

        if (titleMatch && reasonMatch && ageMatch) {
          movieItems.push({
            title: titleMatch[1].trim(),
            description: reasonMatch[1].trim(),
            suitableAge: ageMatch[1].trim()
          })
        }
      })
    }

    recommendations.push({
      type: 'movie',
      overview: movieOverview,
      items: movieItems.length > 0 ? movieItems : [{ title: '推荐内容生成中...', description: '稍后更新', suitableAge: `${childAge}岁` }]
    })
  }

  console.log('=== 解析推荐结果 ===')
  console.log('推荐数量:', recommendations.length)
  recommendations.forEach((rec, i) => {
    console.log(`推荐 ${i + 1}:`, rec.type, '项目数:', rec.items?.length)
  })

  return recommendations
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
