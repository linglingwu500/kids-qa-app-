import dotenv from 'dotenv'

// 加载环境变量
dotenv.config()

// 从 process.env 获取环境变量
const GLM_API_KEY = JSON.stringify(process.env.GLM_API_KEY || '')
const DOUBAO_APP_ID = JSON.stringify(process.env.DOUBAO_APP_ID || '')
const DOUBAO_ACCESS_KEY = JSON.stringify(process.env.DOUBAO_ACCESS_KEY || '')
const DOUBAO_API_ENDPOINT = JSON.stringify(process.env.DOUBAO_API_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3')
const DOUBAO_REALTIME_APP_ID = JSON.stringify(process.env.DOUBAO_REALTIME_APP_ID || '')
const DOUBAO_REALTIME_ACCESS_KEY = JSON.stringify(process.env.DOUBAO_REALTIME_ACCESS_KEY || '')
const DOUBAO_REALTIME_RESOURCE_ID = JSON.stringify(process.env.DOUBAO_REALTIME_RESOURCE_ID || 'volc.speech.dialog')
const DOUBAO_REALTIME_APP_KEY = JSON.stringify(process.env.DOUBAO_REALTIME_APP_KEY || 'PlgvMymc7f3tQnJ6')

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
    'process.env.GLM_API_KEY': GLM_API_KEY,
    'process.env.DOUBAO_APP_ID': DOUBAO_APP_ID,
    'process.env.DOUBAO_ACCESS_KEY': DOUBAO_ACCESS_KEY,
    'process.env.DOUBAO_API_ENDPOINT': DOUBAO_API_ENDPOINT,
    'process.env.DOUBAO_REALTIME_APP_ID': DOUBAO_REALTIME_APP_ID,
    'process.env.DOUBAO_REALTIME_ACCESS_KEY': DOUBAO_REALTIME_ACCESS_KEY,
    'process.env.DOUBAO_REALTIME_RESOURCE_ID': DOUBAO_REALTIME_RESOURCE_ID,
    'process.env.DOUBAO_REALTIME_APP_KEY': DOUBAO_REALTIME_APP_KEY
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
