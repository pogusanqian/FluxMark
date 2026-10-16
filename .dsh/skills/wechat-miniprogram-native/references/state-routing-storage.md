# 状态、路由与本地存储

## setData 纪律

`setData` 是逻辑层到渲染层的唯一通道，每次调用都有跨线程成本。规则：

1. **只传变化的部分**，用路径更新：`this.setData({ 'form.price': '10.5' })`，不要重复传整个 `form`。
2. **不传渲染用不到的数据**。纯逻辑用的中间变量放实例属性（`this.timer = ...`）或模块级变量，不要放 `data`。
3. **禁止直接改 `this.data`**。`this.data.xxx = 1` 不会触发渲染，且会让状态与视图不一致。
4. **合并高频更新**：连续多次变更先攒在局部对象里，一次 `setData` 提交；滚动、输入这类高频事件用节流（`utils/` 里放一个 `throttle`，别引 lodash）。
5. **单次 payload 尽量小**（经验值 < 256KB），长列表只更新变化项，必要时给列表项抽组件。

派生数据不要用 `setData` 在多个地方手工维护，用 `observers`：

```ts
Component({
  data: { price: '', cost: '', profit: '' },
  observers: {
    'price, cost': function (price: string, cost: string) {
      if (!price || !cost) return
      this.setData({ profit: String(Number(price) - Number(cost)) })
    },
  },
})
```

注意：`observers` 里再次 `setData` 被观察字段会死循环，只写派生字段。

## 生命周期

| 时机 | 组件 / 页面 | 该做什么 |
| --- | --- | --- |
| `lifetimes.attached` | 组件 | 初始化、首次取数、注册监听 |
| `lifetimes.detached` | 组件 | 反注册监听、清定时器 |
| `methods.onLoad` | 页面（`Component()` 构造） | 解析路由参数、首次取数 |
| `methods.onShow` | 页面 | 每次可见都要刷新的数据（如从存储重新读取） |
| `methods.onHide` | 页面 | 保存草稿到存储 |
| `methods.onUnload` | 页面 | 清定时器、取消未完成请求 |

- 用 `Component()` 写页面时，**页面生命周期必须写在 `methods` 内**；写在顶层不会执行。组件生命周期用 `lifetimes`，两者不要混。
- 需要等待渲染完成再测量节点时用 `wx.nextTick()`。
- 不要在 `attached` 里做耗时同步操作（大 JSON 解析、循环读存储），会阻塞首屏。

## 路由

| 需求 | 用 | 备注 |
| --- | --- | --- |
| 进入新页面并保留当前页 | `wx.navigateTo` | 页面栈最多 10 层，超了会失败 |
| 替换当前页 | `wx.redirectTo` | 登录中转、表单提交后跳结果页 |
| 切到 tabBar 页 | `wx.switchTab` | 只能跳 `app.json` 里 `tabBar.list` 的页面 |
| 清空栈回到某页 | `wx.reLaunch` | 退出登录、重置流程 |
| 返回 | `wx.navigateBack({ delta })` | 自定义导航栏的返回按钮走这里 |

- 传参：`url: '/pages/detail/detail?id=' + encodeURIComponent(id)`，对象参数先 `JSON.stringify` 再 `encodeURIComponent`，`onLoad` 里对称解码并做非法值兜底。
- 参数只传标识不传大对象；需要传复杂数据时写进 storage 或 `services/` 缓存，只把 key 传过去。
- 页面栈查询用 `getCurrentPages()`，只在确需知道来源页时使用，不要拿它当状态容器。
- `tabBar` 目前**没有**配置。只有出现两个以上平级且需要常驻入口的功能时才引入，引入属于结构性变更，要先改 `SKILL.md` 与 `architecture.md`。

## 跨页面 / 跨组件通信

按优先级选：

| 场景 | 方案 |
| --- | --- |
| 父 → 子传数据 | `properties` |
| 子 → 父通知 | `triggerEvent('event-name', detail)` |
| 父 → 子调方法 | `this.selectComponent('#id')`（**慎用**，会让父子强耦合） |
| 页面跳转后回传结果 | `wx.navigateTo` 的 `events` / `EventChannel` |
| 全局少量共享状态（如主题、设置） | `app.globalData` + `IAppOption` 声明类型 |
| 需持久化或数据量较大 | 本地存储，见下节 |

`globalData` 只放“读多写少、全局唯一”的小对象；不要往里堆业务数据，更不要用它代替存储。

## 本地存储（无后端时的数据层）

### 封装规范

存储读写一律通过 `services/storage.ts`（或同类封装）统一出口，**业务代码里禁止直接调 `wx.setStorageSync`**：

```ts
const KEY_PREFIX = 'tf:'
const SCHEMA_VERSION = 1

interface Envelope<T> {
  v: number
  data: T
}

export function read<T>(name: string, fallback: T): T {
  try {
    const raw = wx.getStorageSync(KEY_PREFIX + name) as Envelope<T> | ''
    if (!raw || typeof raw !== 'object') return fallback
    if (raw.v !== SCHEMA_VERSION) return migrate(raw, fallback)
    return raw.data ?? fallback
  } catch {
    return fallback
  }
}

export function write<T>(name: string, data: T): void {
  try {
    wx.setStorageSync(KEY_PREFIX + name, { v: SCHEMA_VERSION, data })
  } catch (e) {
    wx.showToast({ title: '保存失败', icon: 'none' })
  }
}
```

- key 统一 `tf:` 前缀，避免与其它逻辑冲突；key 名用小写连字符或 camelCase，保持一种。
- 写入的内容一律包一层 `{ v, data }`：数据结构变更时靠 `v` 做迁移，不要靠字段猜测。
- `read` 必须能在任何异常下返回 fallback：存储被清、JSON 损坏、版本不符都不能白屏。
- 同步（`*Sync`）用于启动时的小数据读取；大数据写入或循环写入用异步版本，避免阻塞渲染。

### 容量与清理

- 上限：单个 key 1MB，整体 10MB。写入前评估体积，超限场景改用文件系统或拆分 key。
- 需要提供“清空全部数据”入口时，遍历本项目前缀的 key 删除，不要 `wx.clearStorageSync()`（会清掉第三方/框架数据）。
- 用户数据建议支持导出/导入 JSON（走剪贴板或文件系统），方便换机与备份。

### 初始化顺序

- 存储结构与版本迁移放在 `app.onLaunch`，且必须是幂等的；页面 `onLoad` 只读不迁移，避免多页并发迁移。
- `onLaunch` 里不做网络请求（本项目无网络），不做耗时解析。

## 数据该放哪：决策树

```
只在本页渲染用            → 页面 data
只在本次会话内跨页共享     → app.globalData（记得扩 IAppOption）
需要下次启动还在          → 存储（经 services/storage.ts）
有计算逻辑 / 需要被复用    → services/ 纯函数，页面只负责取数与展示
既是持久数据又需计算       → services/ 读写 + 纯函数计算
```
