# 原生 API 使用规范

## 通用原则

- 只用官方 `wx.*` API，不引第三方 SDK（本项目无后端，绝大多数服务端 API 都用不上）。
- 同一类交互必须走统一封装，不要在页面里散落 `wx.showToast`：
  - `utils/ui.ts`：`toast(msg, icon?)`、`confirm({ title, content })`、`showLoading(text?)` / `hideLoading()`
  - 好处是文案风格一致，将来换交互只改一处。
- 所有异步 API 都要处理 `fail` 分支，失败必须给用户可见反馈（toast 或页面内提示），不允许静默失败。
- API 兼容性用 `wx.canIUse('api.name')` 判断后再调，不要假定基础库版本：`canIUseGetUserProfile: wx.canIUse('getUserProfile')` 就是既有写法示例。
- 定时器、监听器一律在 `onUnload` / `lifetimes.detached` 清理，尤其是 `setInterval` 与 `wx.onXxx` 系列。

## 常用 API 与注意点

### 反馈类

```ts
wx.showToast({ title: '已保存', icon: 'success' })   // 1.5s 消失，title 超过 7 个汉字会被截断
wx.showModal({ title: '确认', content: '…' })        // 返回 Promise 化包装更顺手
wx.showLoading({ title: '处理中', mask: true })      // 必须成对 hideLoading
wx.vibrateShort({ type: 'light' })                  // 轻反馈，配合按钮点击
```

- `showToast` 与 `showLoading` 会互相顶掉，注意调用顺序。

### 系统信息（新版拆分 API）

`wx.getSystemInfoSync()` 已废弃，改用拆分后的三个接口：

| 需要什么 | 用 |
| --- | --- |
| 窗口宽高、安全区、像素比 | `wx.getWindowInfo()` |
| 平台、机型、系统版本 | `wx.getDeviceInfo()` |
| 基础库版本、宿主环境 | `wx.getAppBaseInfo()` |

- 自定义导航栏需要计算胶囊位置时，用 `wx.getMenuButtonBoundingClientRect()`（既有 `navigation-bar` 组件的实现可直接参考）。
- 布局优先用 CSS 的安全区变量 `env(safe-area-inset-*)`，只在需要数值计算时才读系统信息。

### 用户信息

`wx.getUserProfile` 已废弃，`pages/index/` 里的调用属于模板残留。正确姿势（需要用户头像昵称时）：

```xml
<button open-type="chooseAvatar" bind:chooseavatar="onChooseAvatar">
  <image src="{{avatarUrl}}" />
</button>
<input type="nickname" bind:change="onNicknameChange" placeholder="请输入昵称" />
```

- 头像拿到的是临时路径，需要长期保存就 `wx.getFileSystemManager().saveFile()` 或转存到自己的存储方案里。
- 本项目自用、无账号体系，原则上**不需要**任何用户信息，能不要就不要。

### 分享

- 页面 `methods` 里实现 `onShareAppMessage`（好友）与 `onShareTimeline`（朋友圈），返回 `{ title, path, imageUrl }`。
- 自用项目可以不实现，但一旦实现就要保证 `path` 指向真实存在的页面与合法参数。

### 剪贴板与文件

- `wx.setClipboardData` / `wx.getClipboardData`：导入导出 JSON、复制结果时使用，成功后给 toast 反馈。
- `wx.getFileSystemManager()` 只在数据量超过存储上限或需要导出文件时使用；小数据一律走存储。

## 网络请求（本项目当前不使用）

无后端，所以**默认不写任何请求代码**。若将来确需请求外部接口：

1. 统一封装在 `services/request.ts`：Promise 化、超时、统一错误码处理、统一 loading 策略，业务层不直接调 `wx.request`。
2. **域名白名单是硬约束**：`wx.request` 只能访问在小程序后台配置过的、自己名下且已备案的域名。第三方公开接口（行情、天气等）**加不进白名单**，正式版必然失败。
3. `project.private.config.json` 里的 `urlCheck: true` 是开发工具层面的校验开关；把它改成 `false` 只在开发者工具里有效，属于临时调试手段，**不得**作为方案写进代码或文档。
4. 如果一个功能只能靠关掉域名校验实现，那它就不该以“纯前端”方式做；要么放弃，要么改用云开发或自有服务端（属于架构级变更，先改 `SKILL.md`）。

## 隐私与权限

- 当前不涉及任何敏感权限（无定位、无相册、无录音），因此 `app.json` 里**不需要** `permission` 与 `requiredPrivateInfos`。
- 什么时候才需要补：一旦用到位置、相册、摄像头、剪贴板读取等，必须同步在小程序后台填写《用户隐私保护指引》，并在 `app.json` 声明对应字段，否则体验版/正式版会被拦截。
- 授权被拒后的正确流程：`wx.getSetting()` 查 `authSetting` → 已拒绝则引导 `wx.openSetting()`，不要反复弹系统授权框。

## 禁止事项

- 不引任何第三方 SDK、统计、埋点、UI 库。
- 不用 `wx.getSystemInfoSync` 等已废弃 API。
- 不在 `app.onLaunch` 里做请求或耗时操作。
- 不把 `console.log` 留在提交版本里（调试用的日志提交前删除）。
