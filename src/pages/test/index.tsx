import { View, Text } from '@tarojs/components'

const Test = () => {
  console.log('=== Test 页面 ===')

  return (
    <View style={{ padding: '40px' }}>
      <Text style={{ fontSize: '40px', color: '#333' }}>
        测试页面
      </Text>
      <Text style={{ fontSize: '28px', color: '#666', marginTop: '20px' }}>
        如果你看到这个页面，说明 React 组件正常工作
      </Text>
      <Text style={{ fontSize: '24px', color: '#999', marginTop: '20px' }}>
        {Date.now()}
      </Text>
    </View>
  )
}

export default Test
