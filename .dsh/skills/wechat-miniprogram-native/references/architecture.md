# 目录、命名与配置归属

## 目录职责

```
miniprogram/
├─ app.ts            应用入口：只做全局初始化（globalData、storage 初始化）。禁止塞业务逻辑。
├─ app.json          全局配置：pages、window、renderer、lazyCodeLoading。改这里必须同步本技能。
├─ app.wxss          全局样式：只放 CSS 变量、page 基础布局、跨页复用的一两个工具类。禁止业务样式。
├─ pages/            页面，每页一个目录、一套四件套。
├─ components/       自定义组件，每个组件一个目录、一套四件套。
├─ services/         业务逻辑与纯函数（不碰 wx API 的算法放这里，便于将来单测）。
├─ utils/            通用工具，与业务无关（如 util.ts 的 formatTime）。
├─ assets/           图片等静态资源（出现时再建，优先用内联 SVG data-URI）。
└─ sitemap.json      搜索索引配置，个人自用项目保持默认 allow 即可。
```

- `services/` 已存在（`order-price.ts` 纯计算、`companies.ts` 公司表与当前选择、`storage.ts` 本地存储封装）；`assets/` 尚未存在，需要时再建。**新建任何顶层目录，都要先在本文件登记职责**。
- 不允许 JS 与 TS 混用（不存在 `pages/xxx.js`），不允许一个目录里塞两个页面。
- 组件只在被用到时创建，不做“以后可能用得上”的预置组件。
- 页面只在 `app.json` 的 `pages` 里登记过的才存在；删页面时四件套一起删，并同步 `app.json`。

## 命名规范

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| 目录 / 文件 | kebab-case，目录名 = 文件名 = 四件套前缀 | `pages/index/index.ts` |
| 组件标签 | kebab-case | `<navigation-bar>` |
| 组件 `properties` | camelCase | `homeButton` |
| 自定义事件 | kebab-case | `triggerEvent('value-change', ...)` |
| 工具函数 | camelCase 具名导出 | `export const formatTime = ...` |
| CSS 变量 | `--tf-` 前缀 | `--tf-fg-0` |
| storage key | `tf:` 前缀 | `tf:watchlist` |

## 新增页面的检查清单

- [ ] 四件套齐建，命名一致
- [ ] `app.json` 的 `pages` 已追加
- [ ] 页面 `.json` 已引入 `navigation-bar`
- [ ] 页面用 `Component()`，页面生命周期写在 `methods` 内
- [ ] `page` 高度与 `scroll-view` 骨架照抄既有页面
- [ ] 模拟器 + 真机各跑一次

## 新增组件的检查清单

- [ ] `.json` 有 `"component": true`
- [ ] `styleIsolation` 显式声明，默认 `isolated`
- [ ] `properties` 全部写明 `type` + `value`
- [ ] 父传子用 `properties`，子传父用 `triggerEvent`，反向取数据用 `selectComponent`（慎用）
- [ ] 不引第三方样式文件；需要图标就用内联 SVG data-URI（参考 `navigation-bar.wxss`）
- [ ] 组件内不直接 `wx.navigateTo` 决定业务走向，跳转交给页面

## 配置文件各管什么

| 文件 | 管什么 | 是否进版本库 |
| --- | --- | --- |
| `project.config.json` | `appid`、`miniprogramRoot`、编译设置（TS 插件、压缩、Skyline 开关）、npm 打包映射（`packNpmManually` + `packNpmRelationList`） | 是 |
| `project.private.config.json` | 本机偏好（`libVersion`、热重载、`urlCheck`），**同名键覆盖前者** | 是（个人项目） |
| `tsconfig.json` | TS 严格度与编译目标，不控制小程序运行时行为 | 是 |
| `package.json` | 开发期工具链 + 唯一的运行时依赖 `big.js` | 是 |
| `app.json` | 页面注册、窗口样式、渲染器、按需注入 | 是 |
| `miniprogram/miniprogram_npm/` | 依赖经「构建 npm」产出的运行时代码（当前只有 big.js），由工具生成，不可手改 | 是 |

规则：改 `app.json` 或 `project.config.json` 的结构性字段，必须回来更新本文件与 `SKILL.md` 的技术栈表。

## 边界

业务规则（某个页面怎么算、展示什么字段）**不属于本技能范围**。它放在对应 `pages/<name>/` 或 `services/` 里，由代码自身说明。本技能只保证：放对位置、用对写法、不引入不该引入的依赖。
