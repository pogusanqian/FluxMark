---
name: wechat-miniprogram-native
description: 本仓库是纯原生的微信小程序（TypeScript + Skyline 渲染、无 UI 组件库、无后端，运行时仅依赖 big.js 做十进制金额运算）。在新增或修改页面、组件、工具函数、全局配置、样式规范之前加载本技能，按其中的架构约定与原生写法行事。只覆盖项目基础架构与原生语法，不描述任何业务功能。
---

# 原生微信小程序：项目基础架构

## 适用范围

- **适用**：目录与命名、页面/组件四件套、`app.json` 与 `project.config.json`、WXML/WXSS/TS 写法、状态与路由、本地存储、原生 API 调用方式、调试与发布。
- **不适用**：任何业务规则（某个页面算什么、展示什么）。业务代码只住在 `pages/`、`components/`、`services/` 里，本技能不描述它。

## 技术栈（不可擅自替换）

| 项 | 取值 | 出处 |
| --- | --- | --- |
| 语言 | TypeScript，`strict` + `noUnusedLocals`/`noUnusedParameters`，`target: ES2020` | `tsconfig.json` |
| 类型检查 | `npm run typecheck`（= `tsc --noEmit`）；`skipLibCheck: true` 已开 | `package.json` / `tsconfig.json` |
| 编译 | 微信开发者工具 TS 编译插件（`useCompilerPlugins`），无 babel / uglify | `project.config.json` |
| 渲染器 | Skyline（`renderer: "skyline"`，`disableABTest`，`defaultDisplayBlock` + `defaultContentBox`） | `app.json` |
| 组件框架 | glass-easel | `app.json` |
| 导航栏 | 全局 `navigationStyle: "custom"`，每页自绘 | `app.json` |
| 按需注入 | `lazyCodeLoading: "requiredComponents"` | `app.json` |
| 基础库 | `project.private.config.json` 的 `libVersion`（当前 3.17.4） | private config |
| 依赖 | 运行时只允许 **`big.js`**（十进制金额运算）；`devDependencies` 只允许类型定义与 lint / format（当前：`miniprogram-api-typings`、`typescript`、`@types/big.js`） | `package.json` |
| npm 构建 | `miniprogramRoot` 是 `miniprogram/`，package.json 在项目根，所以必须 `packNpmManually: true` + `packNpmRelationList` 指向 `./miniprogram/`；依赖要经**工具 → 构建 npm** 产出 `miniprogram/miniprogram_npm/` 才能被运行时加载 | `project.config.json` |
| 后端 | 无。数据只在本地存储里 | — |
| 换行符 | 所有文本文件一律 **LF**（`\n`）、UTF-8 无 BOM；**DSH 生成或修改的文件同样不得写入 CRLF** | `.gitattributes`（`* text=auto eol=lf`） |

## 五条红线

1. 不引任何 UI 组件库（Vant / TDesign / WeUI 包全部排除）。要组件就自研，或照官方 weui 的结构手写 —— `components/navigation-bar/` 就是范例。
2. 不引 uni-app、Taro、Vue、React 或任何跨端框架。
3. 不加运行时 npm 依赖，**唯一例外是 `big.js`**（十进制金额运算，见 `references/typescript.md`）。`devDependencies` 仅限 `miniprogram-api-typings`、类型定义、ESLint、Prettier 之类，且不得进入小程序包。
4. 页面与组件统一用 `Component()` 构造器，**不用** `Page()`。
5. 不把 Skyline 换回 WebView；确实要换，必须先改本技能与 `app.json`。

## 动手前先读哪一篇

| 你要做的事 | 先读 |
| --- | --- |
| 加页面、加组件、动目录结构 | `references/architecture.md` |
| 写 WXML、调样式、用 rpx、踩 Skyline 的坑 | `references/wxml-wxss.md` |
| 类型报错、改 typings、用 TS 特性 | `references/typescript.md` |
| `setData`、页面跳转、存本地数据 | `references/state-routing-storage.md` |
| 调 `wx.*` API、授权、分享、发请求 | `references/native-apis.md` |
| 调试、预览、上传、性能与体积 | `references/quality-and-release.md` |

## 新增一个页面（六步）

1. 建 `miniprogram/pages/<name>/<name>.{ts,json,wxml,wxss}` 四件套，目录名与文件名一致。
2. `app.json` 的 `pages` 数组追加 `"pages/<name>/<name>"`（首页必须是数组第一项）。
3. 在 `<name>.json` 声明 `usingComponents`。因为全局是 custom 导航栏，**每个页面都要自己引入 `navigation-bar`**。
4. `<name>.ts` 用 `Component({...})`。页面生命周期（`onLoad`/`onShow`/`onHide`/`onUnload`）写在 `methods` 内；组件生命周期用 `lifetimes`。两者不要混用。
5. `<name>.wxss` 顶部固定写 `page { height: 100vh; display: flex; flex-direction: column; }`，正文用 `<scroll-view type="list" class="scrollarea">` + `.scrollarea { flex: 1; }`。
6. 模拟器跑一遍，真机再跑一遍，才算写完。

## 新增一个组件（四步）

1. 建 `miniprogram/components/<name>/` 四件套。
2. `<name>.json` 写 `{ "component": true, "usingComponents": {} }`，并显式选择 `styleIsolation`（默认 `isolated`；只有确需继承外部样式时才用 `apply-shared`，如 `navigation-bar`）。
3. `<name>.ts` 用 `Component({ properties, data, lifetimes, methods })`；`properties` 必须写明 `type` 与 `value`。
4. 对外通信只用 `triggerEvent('<事件名>', detail)`，事件名用小写或 kebab-case，别复用 `tap` 这类原生事件名。

## 当前状态与已知待办

- 模板残留已清理：`pages/logs/`、index 的用户信息示例、`app.ts` 的 `wx.login` 与 `logs` 写入全部删除。当前有两个页面：`pages/index/`（挂单价计算，顶部选公司）与 `pages/companies/`（公司表，左滑删除）。
- 公司数据在 `services/companies.ts`（公司表 + 当前选择 + 旧存储迁移），价格原文与解析分别交给 `services/companies.ts` 与 `services/order-price.ts`。
- `typings/` 是旧版 `miniprogram-api-typings`（2.8.3），基础库实际为 3.17.4，新 API 类型可能缺失，处理方式见 `references/typescript.md`。
- `project.config.json` 与 `project.private.config.json` 有重复/冲突字段（`compileHotReLoad`、`skylineRenderEnable`），以 private 为准。
- Skyline 下 canvas 2D 的可用范围尚未实测；未实测前不得把具体图表方案写进规范。
