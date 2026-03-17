# 🔐 API Key 配置指南

## 重要安全提示

⚠️ **请不要将真实的 API Key 提交到 Git 仓库！**

本项目使用环境变量管理敏感信息，所有 API Key 都存储在 `.env` 文件中（已加入 `.gitignore`）。

## 配置步骤

### 1. 复制环境变量模板

```bash
cp .env.example .env
```

### 2. 获取 API Keys

#### 智谱 AI (GLM)

1. 访问 [智谱AI开放平台](https://open.bigmodel.cn/)
2. 注册并登录账号
3. 进入控制台 → API Keys
4. 创建新的 API Key
5. 将 Key 填入 `.env` 文件的 `GLM_API_KEY` 和 `GLM_LLM_API_KEY`

#### 豆包 (火山引擎)

1. 访问 [火山引擎控制台](https://console.volcengine.com/)
2. 注册并登录账号
3. 进入控制台 → API密钥管理
4. 创建 App ID 和 Access Key
5. 将密钥填入 `.env` 文件对应的配置项

### 3. 配置项说明

```bash
# GLM AI 配置（用于语音识别和AI对话）
GLM_API_KEY=your_glm_api_key_here
GLM_LLM_API_KEY=your_glm_api_key_here

# 豆包配置
DOUBAO_APP_ID=your_doubao_app_id_here
DOUBAO_ACCESS_KEY=your_doubao_access_key_here
DOUBAO_SECRET_KEY=your_doubao_secret_key_here

# 豆包实时语音配置
DOUBAO_REALTIME_APP_ID=your_doubao_app_id_here
DOUBAO_REALTIME_ACCESS_KEY=your_doubao_access_key_here
DOUBAO_REALTIME_APP_KEY=your_doubao_app_key_here
```

### 4. 验证配置

启动开发服务器后，如果看到类似以下警告，说明 API Key 未正确配置：

```
⚠️ GLM API Key 未配置，请在 .env 文件中设置 GLM_LLM_API_KEY
```

## 安全最佳实践

1. **永远不要**将 `.env` 文件提交到 Git
2. **定期更换** API Keys
3. **使用不同的** API Keys 用于开发和生产环境
4. **限制权限**：为 API Keys 设置最小必要权限
5. **监控使用**：定期检查 API 使用情况，发现异常及时更换 Key

## 如果 API Key 泄露了

如果不幸将真实的 API Key 提交到了 Git 仓库：

1. **立即撤销**该 API Key
2. **生成新的** API Key
3. **清理 Git 历史**（使用 `git filter-branch` 或 `BFG Repo-Cleaner`）
4. **强制推送**（⚠️ 谨慎操作）
5. **通知所有协作者**重新配置环境

## 故障排查

### 问题：API 调用失败，提示 "request:fail interrupted"

**解决方案**：在微信开发者工具中：
1. 点击右上角「详情」
2. 选择「本地设置」
3. 勾选「不校验合法域名」

### 问题：环境变量不生效

**解决方案**：
1. 确认 `.env` 文件在项目根目录
2. 重启开发服务器
3. 检查 `config/index.ts` 中是否正确配置了 `defineConstants`

## 联系支持

如果遇到其他问题，请查看项目文档或提交 Issue。
