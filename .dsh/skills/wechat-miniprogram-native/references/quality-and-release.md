# 调试、性能与发布

## 开发者工具设置与配置文件对应

| 工具里的设置 | 落到的字段 | 本项目取值 |
| --- | --- | --- |
| TypeScript 编译插件 | `setting.useCompilerPlugins` | `["typescript"]` |
| 启用 Skyline 渲染 | `setting.skylineRenderEnable` + `app.json.renderer` | 均为开启 |
| 代码热重载 | `setting.compileHotReLoad` | private 里为 `true` |
| 不校验合法域名 | private `setting.urlCheck` | 当前 `true`（保持校验） |
| 压缩 WXML / WXSS | `setting.minifyWXML` / `minifyWXSS` | 开启 |
| 基础库版本 | private `libVersion` | 3.17.4 |

- 两个 config 文件重复的键（`compileHotReLoad`、`skylineRenderEnable`）容易造成“改了不生效”，规则是：**只改 `project.private.config.json`**，`project.config.json` 保持团队共享的默认值。
- `appid` 在 `project.config.json`，不要在 private 里重复定义。
- 工具的“详情 → 本地设置”里的开关会直接改写上述字段，改完记得同步本文件。

## 调试

- 模拟器用来快速迭代样式；**真机预览**才能发现安全区、字体、Skyline 渲染差异问题，涉及布局的改动必须真机验证一次。
- 真机调试（vConsole）排查白屏、报错。
- 性能面板（工具 → 调试器 → Performance / Trace）用来定位 `setData` 过大与首屏耗时。
- 遇到“样式不生效”：先确认选择器是否被 Skyline 限制，再确认组件 `styleIsolation`，最后才怀疑优先级。
- 遇到“API 不存在”：确认基础库版本 + 用 `wx.canIUse` 兜底，而不是直接降级基础库。
- 遇到“找不到模块 big.js”之类：依赖没构建。点 **工具 → 构建 npm**，产出 `miniprogram/miniprogram_npm/` 后再编译（详见 `typescript.md`）。改了依赖版本也要重新构建。

## 性能清单

- 保持 `lazyCodeLoading: "requiredComponents"`，页面未用到的组件不要写进 `usingComponents`。
- 首屏只渲染必要内容；长列表分批渲染（先渲染 N 条 + 触底加载），列表项抽成组件。
- 图片：优先内联 SVG/小图标；外链图片给足尺寸（避免大图缩小显示），需要时用 `lazy-load`。
- 减少 `setData` 频次与体积（见 `state-routing-storage.md`），高频交互用节流。
- 不引入运行时依赖，本身就是最大的性能与体积优化——目前唯一的例外是 `big.js`（约 6KB，换金额计算的正确性，值得）。
- 定时器、监听器及时释放，避免页面销毁后仍在跑。

## 体积限制

- 主包与单个分包各自不超过 2MB；总量上限以官方文档为准（历史上为 20MB，后续有放宽），<https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages.html>。
- 本项目是纯前端单功能小程序，正常情况下远低于上限，**不要过早分包**。触发信号：主包超 1.5MB、或某个功能模块包含大量独立资源。
- 分包属于架构级变更，引入前先改 `SKILL.md` 与 `architecture.md`。

## 发布流程

1. 自查：`npm run typecheck` 无错误；依赖改动后已 **构建 npm**；模拟器 + 真机均无报错；`console.log` 已清理。
2. 上传：开发者工具 → 上传 → 填版本号与描述（语义化：`1.0.0`）。
3. 体验版：后台设为体验版，自己扫码验证；这是自用项目最常用的形态。
4. 正式发布：提交审核 → 通过后发布。**自用项目优先停在体验版**，见下面合规提醒。

## 合规提醒

- 涉及证券/金融信息的页面（如股价、预测、投资建议），正式发布通常需要相应金融资质，个人开发者大概率过不了审核。自用请留在**开发版/体验版**，不要提交审核。
- 一旦引入任何用户隐私相关能力，必须同步配置隐私保护指引（见 `native-apis.md`）。

## 已知待办

- [x] 清理模板残留：`pages/logs/`、`pages/index/` 的 `getUserProfile`/`chooseAvatar` 示例、`app.ts` 的 `wx.login` 与 `logs` 写入（已删除，当前只有 `pages/index/`）。
- [x] `pages/index/` 容器样式随业务重写（挂单价计算页）。
- [ ] 更新 `miniprogram-api-typings` 到与基础库匹配的版本（见 `typescript.md`）。
- [ ] 补 ESLint / Prettier 开发期配置（见 `typescript.md`）。
- [ ] 实测 Skyline 下 canvas 2D 行为，确认后再把图表方案写进 `wxml-wxss.md`。
- [ ] 整理两个 config 文件的重复字段。
- [ ] 页面功能与布局在**真机**上验证一次（当前只做了类型检查与逻辑校验，没有跑过模拟器）。
- [ ] 若确定长期只自用，可在仓库里补一份 README 记录“仅体验版、不上架”的意图。
