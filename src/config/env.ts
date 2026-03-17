/**
 * 环境变量配置
 * 
 * 这些值在编译时由 Taro 的 defineConstants 替换
 */

// 辅助函数：去除 JSON.stringify 添加的引号
const cleanEnv = (value: string): string => {
  if (!value || value === '""') return ''
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === 'string' ? parsed : value
    } catch (e) {
      return value.slice(1, -1)
    }
  }
  return value
}

// 使用 defineConstants 定义的全局变量（Taro 会替换这些）
declare const __GLM_API_KEY__: string
declare const __GLM_LLM_API_KEY__: string
declare const __DOUBAO_APP_ID__: string
declare const __DOUBAO_ACCESS_KEY__: string
declare const __DOUBAO_SECRET_KEY__: string
declare const __DOUBAO_API_ENDPOINT__: string
declare const __DOUBAO_LLM_API_KEY__: string
declare const __DOUBAO_LLM_MODEL__: string
declare const __DOUBAO_REALTIME_APP_ID__: string
declare const __DOUBAO_REALTIME_ACCESS_KEY__: string
declare const __DOUBAO_REALTIME_RESOURCE_ID__: string
declare const __DOUBAO_REALTIME_APP_KEY__: string

// 导出清理后的值
export const GLM_CONFIG = {
  API_KEY: cleanEnv(typeof __GLM_API_KEY__ !== 'undefined' ? __GLM_API_KEY__ : ''),
  LLM_API_KEY: cleanEnv(typeof __GLM_LLM_API_KEY__ !== 'undefined' ? __GLM_LLM_API_KEY__ : '')
}

export const DOUBAO_CONFIG = {
  APP_ID: cleanEnv(typeof __DOUBAO_APP_ID__ !== 'undefined' ? __DOUBAO_APP_ID__ : ''),
  ACCESS_KEY: cleanEnv(typeof __DOUBAO_ACCESS_KEY__ !== 'undefined' ? __DOUBAO_ACCESS_KEY__ : ''),
  SECRET_KEY: cleanEnv(typeof __DOUBAO_SECRET_KEY__ !== 'undefined' ? __DOUBAO_SECRET_KEY__ : ''),
  API_ENDPOINT: cleanEnv(typeof __DOUBAO_API_ENDPOINT__ !== 'undefined' ? __DOUBAO_API_ENDPOINT__ : 'https://ark.cn-beijing.volces.com/api/v3'),
  LLM_API_KEY: cleanEnv(typeof __DOUBAO_LLM_API_KEY__ !== 'undefined' ? __DOUBAO_LLM_API_KEY__ : ''),
  LLM_MODEL: cleanEnv(typeof __DOUBAO_LLM_MODEL__ !== 'undefined' ? __DOUBAO_LLM_MODEL__ : ''),
  REALTIME_APP_ID: cleanEnv(typeof __DOUBAO_REALTIME_APP_ID__ !== 'undefined' ? __DOUBAO_REALTIME_APP_ID__ : ''),
  REALTIME_ACCESS_KEY: cleanEnv(typeof __DOUBAO_REALTIME_ACCESS_KEY__ !== 'undefined' ? __DOUBAO_REALTIME_ACCESS_KEY__ : ''),
  REALTIME_RESOURCE_ID: cleanEnv(typeof __DOUBAO_REALTIME_RESOURCE_ID__ !== 'undefined' ? __DOUBAO_REALTIME_RESOURCE_ID__ : 'volc.speech.dialog'),
  REALTIME_APP_KEY: cleanEnv(typeof __DOUBAO_REALTIME_APP_KEY__ !== 'undefined' ? __DOUBAO_REALTIME_APP_KEY__ : '')
}

// 导出便捷函数
export const getGLMApiKey = (): string => {
  const key = GLM_CONFIG.LLM_API_KEY || GLM_CONFIG.API_KEY
  if (!key || key === 'your_glm_api_key_here') {
    console.warn('⚠️ GLM API Key 未配置，请在 .env 文件中设置 GLM_LLM_API_KEY')
    return ''
  }
  return key
}
