import Taro from '@tarojs/taro'

// 通用请求工具
export function request(options: {
  url: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  header?: any
  timeout?: number
}): Promise<any> {
  return new Promise((resolve, reject) => {
    const { url, method, data, header = {}, timeout = 120000 } = options // 默认120秒超时

    console.log('=== 请求开始 ===')
    console.log('URL:', url)
    console.log('Method:', method)
    console.log('Timeout:', timeout + 'ms')

    Taro.request({
      url: url,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...header
      },
      timeout,
      success: (res: any) => {
        console.log('=== Request Success ===')
        console.log('StatusCode:', res.statusCode)
        console.log('Data:', res.data)

        // 智谱AI API 返回 200 表示成功
        if (res.statusCode === 200) {
          resolve(res.data)
        } else {
          reject(new Error(`请求失败: ${res.statusCode} - ${JSON.stringify(res.data)}`))
        }
      },
      fail: (err: any) => {
        console.error('=== Request Failed ===')
        console.error('Error:', err)
        reject(err)
      }
    })
  })
}
