import dotenv from 'dotenv'

// 加载环境变量
dotenv.config()

// 从 process.env 获取环境变量（Taro defineConstants 需要 JSON 格式）
const GLM_API_KEY = JSON.stringify(process.env.GLM_API_KEY || '')
const GLM_LLM_API_KEY = JSON.stringify(process.env.GLM_LLM_API_KEY || process.env.GLM_API_KEY || '')
const DOUBAO_APP_ID = JSON.stringify(process.env.DOUBAO_APP_ID || '')
const DOUBAO_ACCESS_KEY = JSON.stringify(process.env.DOUBAO_ACCESS_KEY || '')
const DOUBAO_SECRET_KEY = JSON.stringify(process.env.DOUBAO_SECRET_KEY || '')
const DOUBAO_API_ENDPOINT = JSON.stringify(process.env.DOUBAO_API_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3')
const DOUBAO_LLM_API_KEY = JSON.stringify(process.env.DOUBAO_LLM_API_KEY || '')
const DOUBAO_LLM_MODEL = JSON.stringify(process.env.DOUBAO_LLM_MODEL || 'ep-20250403001607-h8hxw')
const DOUBAO_REALTIME_APP_ID = JSON.stringify(process.env.DOUBAO_REALTIME_APP_ID || '')
const DOUBAO_REALTIME_ACCESS_KEY = JSON.stringify(process.env.DOUBAO_REALTIME_ACCESS_KEY || '')
const DOUBAO_REALTIME_RESOURCE_ID = JSON.stringify(process.env.DOUBAO_REALTIME_RESOURCE_ID || 'volc.speech.dialog')
const DOUBAO_REALTIME_APP_KEY = JSON.stringify(process.env.DOUBAO_REALTIME_APP_KEY || '')

console.log('=== 环境变量加载情况 ===')
console.log('GLM_LLM_API_KEY:', GLM_LLM_API_KEY ? '已配置' : '未配置')
console.log('DOUBAO_APP_ID:', DOUBAO_APP_ID)
console.log('DOUBAO_ACCESS_KEY:', DOUBAO_ACCESS_KEY ? '已配置' : '未配置')

const config = {
  projectName: 'kids-qa-app',
  date: '2026-2-24',
  designWidth: 750,
  deviceRatio: {
    640: 2.34 / 2,
    750: 1,
    375: 2,
    828: 1.81 / 2
  },
  sourceRoot: 'src',
  outputRoot: 'dist',
  plugins: [],
  defineConstants: {
    // 定义全局常量（避免使用 process.env）
    '__GLM_API_KEY__': GLM_API_KEY,
    '__GLM_LLM_API_KEY__': GLM_LLM_API_KEY,
    '__DOUBAO_APP_ID__': DOUBAO_APP_ID,
    '__DOUBAO_ACCESS_KEY__': DOUBAO_ACCESS_KEY,
    '__DOUBAO_SECRET_KEY__': DOUBAO_SECRET_KEY,
    '__DOUBAO_API_ENDPOINT__': DOUBAO_API_ENDPOINT,
    '__DOUBAO_LLM_API_KEY__': DOUBAO_LLM_API_KEY,
    '__DOUBAO_LLM_MODEL__': DOUBAO_LLM_MODEL,
    '__DOUBAO_REALTIME_APP_ID__': DOUBAO_REALTIME_APP_ID,
    '__DOUBAO_REALTIME_ACCESS_KEY__': DOUBAO_REALTIME_ACCESS_KEY,
    '__DOUBAO_REALTIME_RESOURCE_ID__': DOUBAO_REALTIME_RESOURCE_ID,
    '__DOUBAO_REALTIME_APP_KEY__': DOUBAO_REALTIME_APP_KEY
  },
  copy: {
    patterns: [],
    options: {}
  },
  framework: 'react',
  compiler: {
    type: 'webpack5',
    prebundle: {
      enable: false
    }
  },
  cache: {
    enable: false
  },
  mini: {
    postcss: {
      pxtransform: {
        enable: true,
        config: {}
      }
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      esnextModules: ['taro-ui']
    }
  }
}

export default config
