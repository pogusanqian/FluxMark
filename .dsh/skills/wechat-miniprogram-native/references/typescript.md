# TypeScript 写法与类型维护

## 编译配置的约束（来自 `tsconfig.json`）

`strict` 全家桶全开，其中最容易咬人的几条：

| 选项 | 实际后果 | 标准解法 |
| --- | --- | --- |
| `strictNullChecks` | `wx.getStorageSync()` 返回 `any`，转成具体类型前必须先判空 | 封装读取函数，返回默认值而不是 `undefined` |
| `noImplicitAny` | 事件对象不写类型会报错 | 用 `WechatMiniprogram.TouchEvent` / `CustomEvent` / `Input` 等内置类型 |
| `noUnusedLocals` / `noUnusedParameters` | 未使用的 import、变量、参数直接编译失败 | 真不用的参数用 `_` 前缀（如 `_e`），或删掉 |
| `strictPropertyInitialization` | 类字段必须初始化 | 小程序里基本用 `Component()` 字面量，不写类，避开此坑 |
| `noImplicitReturns` | 有分支必须都有返回值 | 提前 `return` 要显式写 `return` |
| `noImplicitThis` | `this` 类型依赖 `Component()` 泛型推断 | 见下节泛型写法 |

`module: CommonJS` + `esModuleInterop` 是编译产物要求，别改。

## `Component()` 的泛型写法

不传泛型也能跑，但 `this.setData` 与 `this.data` 会退化成 `any`，等于放弃了类型保护。要求：

```ts
// Data / Props / Methods 一律用 type，不要用 interface：
// 泛型约束是 Record<string, ...>，而 interface 没有隐式索引签名，用 interface 会直接编译失败。
type Data = {
  loading: boolean
  list: Item[]
}
type Props = {
  title: { type: StringConstructor; value: string }
}
type Methods = {
  load(): Promise<void>
}

Component<Data, Props, Methods>({
  properties: {
    title: { type: String, value: '' },
  },
  data: {
    loading: false,
    list: [],
  },
  lifetimes: {
    attached() { void this.load() },
  },
  methods: {
    async load() {
      this.setData({ loading: true })
      // …
      this.setData({ loading: false })
    },
  },
})
```

- 第三个泛型参数写自定义方法，方法内的 `this` 才有完整类型。
- 泛型位置：`Component<TData, TProperty, TMethod, TCustomInstanceProperty, TIsPage>`。
- **页面**（用 `Component()` 构造）要把第 5 个泛型写成 `true`，`methods` 里的 `onLoad`/`onShow`/`onHide`/`onUnload` 才会被当作页面生命周期检查 —— `Component<Data, {}, Methods, {}, true>({ ... })`；组件不需要，用默认值即可。
- 事件对象显式标注，不要 `any`：

```ts
onInput(e: WechatMiniprogram.Input) { this.setData({ text: e.detail.value }) }
onTap(e: WechatMiniprogram.TouchEvent) { const id = e.currentTarget.dataset.id as string }
```

## 全局类型扩展

`typings/index.d.ts` 是本项目**自己维护**的全局声明入口：

```ts
/// <reference path="./types/index.d.ts" />

interface IAppOption {
  globalData: {
    // 只放「读多写少、全局唯一」的全局状态；业务数据走 services/storage.ts
  }
}
```

- 要往 `globalData` 加字段，就在这里加，别在业务代码里 `as any` 绕过去。
- 新增业务共享类型（如 `interface StockQuote`）优先放在使用它的 `services/*.ts` 里并 `export`；只有真正跨页共享的才提到 `typings/`。
- 需要给缺失的 `wx.*` API 补类型时，加到 `typings/index.d.ts`，并注明依据的基础库版本与官方文档链接。

## typings 的结构与升级

- `tsconfig.json` 里 `typeRoots: ["./typings"]`，因此 `typings/types/index.d.ts` 被当作一个名为 `types` 的包自动加载 —— 这个双层结构是**有意为之**，不要拍平成 `typings/index.d.ts` 单文件。
- 当前 `typings/types/wx/lib.wx.*.d.ts` 是 `miniprogram-api-typings@2.8.3` 的副本，而基础库已在 3.17.4，新 API（`wx.getWindowInfo`、`wx.getAppBaseInfo`、部分 Skyline 相关接口等）类型缺失。
- 升级步骤（仅开发期依赖，不入包）：
  1. `npm install --save-dev miniprogram-api-typings@latest`（本项目用 npm，会同时更新 `package-lock.json`）
  2. 把 `node_modules/miniprogram-api-typings/types/` 的内容同步覆盖到 `typings/types/`
  3. 保留 `typings/index.d.ts`（`IAppOption` 是项目自己的）
  4. 跑 `npx tsc --noEmit` 全量类型检查，修复因严格化暴露的问题
- 升级后如 IDE 类型缓存异常，重开项目或清开发者工具的缓存即可。

## 本地类型检查

开发期已装 `typescript`（devDependency，不进小程序包）：

```bash
npm run typecheck   # 等价于 tsc --noEmit
```

- **提交前必须跑一次**：开发者工具只在编译时报一部分问题，`tsc` 才能全量暴露严格模式下的错误。
- `tsconfig.json` 开了 `skipLibCheck: true`：`typings/types/wx/*.d.ts` 是旧版 vendored 类型，在新版编译器下有既存报错（与业务代码无关）；关掉 lib 检查，`tsc` 的输出才只剩我们自己代码的问题。
- 命令行 `tsc` 只做类型检查、**不产出小程序代码**；真正编译产物的是开发者工具的 TS 插件，两者互不干扰。

## 十进制金额运算（big.js）与「构建 npm」

- **运行时依赖只有 `big.js`**（`dependencies`，源码 25KB / 打包后约 6KB），用于一切**金额**运算。不要用浮点乘除算钱：`1.00 × 0.5%` 的真实值是 `1.005`，浮点算出来是 `1.0049999…`，取整就少一分钱。曾用整数精确算法对拍 102000 组：纯浮点实现错 **73** 组，big.js 实现错 **0** 组。
- 用法约定：**全程用 Big 算，最后一步才落字符串** ——
  `new Big(openPrice).times(factor).round(2, Big.roundHalfUp).toFixed(2)`。
  不要把 Big 结果先转回 `number` 再参与后续运算，那等于把误差放回来。
- **什么时候不用 Big**：通用 UI 组件的纯数值步进（如 `components/stepper`）不需要，它的值域是 0.01 的整数倍，`Math.round(x * 100) / 100` 足够。别把依赖渗进通用组件。
- **「构建 npm」是必须的一步**：`miniprogramRoot` 是 `miniprogram/` 而 `package.json` 在项目根，所以 `project.config.json` 必须保持
  `packNpmManually: true` + `packNpmRelationList: [{ packageJsonPath: "./package.json", miniprogramNpmDistDir: "./miniprogram/" }]`。
  新增或升级依赖后，要在开发者工具点 **工具 → 构建 npm**，产出 `miniprogram/miniprogram_npm/`，否则运行时直接报找不到模块。
- `miniprogram_npm/` 是运行时代码，**要进版本库**，这样别人 clone 下来不必先构建就能预览；但它由工具生成，不要手改。

## 模块与导出

- 只用 `import` / `export`，不写 `require`（老 `logs.ts` 里注释掉的 `require` 写法不要复活）。
- 用具名导出为主，避免默认导出（`esModuleInterop` 下默认导出容易在跨文件重构时出歧义）。
- 工具函数必须保持**纯函数**：不碰 `wx.*`，不读全局状态，方便将来直接单测。

## ESLint / Prettier（仅开发期）

- 定位：只约束源码风格与低级错误，**绝不进入小程序包**，也不改变运行时行为。
- 建议依赖：`eslint`、`@typescript-eslint/parser`、`@typescript-eslint/eslint-plugin`、`prettier`、`eslint-config-prettier`。
- 规则取向：
  - `@typescript-eslint/no-explicit-any`: warn（事件对象等确实需要处允许）
  - `no-unused-vars`: 交给 TS 的 `noUnusedLocals` 即可，避免重复报错
  - `prefer-const`、`eqeqeq`、`no-var`: error
  - 格式化交给 Prettier，ESLint 用 `eslint-config-prettier` 关掉冲突规则
- `.eslintignore` 必须包含：`typings/`、`node_modules/`、`miniprogram_npm/`。
- 没有 `node_modules` 时项目照常能跑（微信开发者工具自带 TS 编译），lint 属于可选增强，不要让它变成编译阻塞项。
