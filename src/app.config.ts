export default {
  pages: [
    'pages/index/index',
    'pages/parent/index',
    'pages/test/index'
  ],
  window: {
    navigationStyle: 'custom',
    backgroundColor: '#faf5ff'
  },
  permission: {
    'scope.record': {
      desc: '用于录音和语音识别'
    }
  }
}
