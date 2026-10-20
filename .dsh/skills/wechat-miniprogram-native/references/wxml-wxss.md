# WXML 与 WXSS

## WXML 基础约定

### 条件渲染

```xml
<block wx:if="{{loading}}">加载中</block>
<block wx:elif="{{list.length}}"><view wx:for="{{list}}" wx:key="id">{{item.name}}</view></block>
<block wx:else><empty-state /></block>
```

- 多个节点同时受一个条件控制时，用 `<block>` 包住，别用无意义的 `<view>` 改布局。
- 频繁切换显隐（如抽屉、浮层）用 `hidden` 而非 `wx:if`，避免反复销毁重建。
- **结构恒定，不做「空态 / 有数据」两套布局**：没有数据时让主体结构照旧、值留空（数据里给空字符串），这样布局与行高不会跳动，只是 `{{}}` 是空的。`wx:if` 只用来挂独立的异常提示行，不要用它把整个主体换掉。

### 列表渲染

```xml
<block wx:for="{{logs}}" wx:key="timeStamp" wx:for-item="log" wx:for-index="i">
  <view class="log-item">{{i + 1}}. {{log.date}}</view>
</block>
```

- `wx:key` 必须是**数据中稳定且唯一**的字段（id / 时间戳），禁止用 `index`；`wx:key="*this"` 仅适用于元素本身唯一的字符串数组。
- 需要可读性时用 `wx:for-item` / `wx:for-index` 重命名，不要嵌套两层同名 `item`。
- 列表项内含复杂组件时，把单项抽成独立组件，减少整表 `setData` 体积。

### 事件

```xml
<view bindtap="onTap" data-id="{{item.id}}" data-kind="row">…</view>
<view catchtap="onInnerTap">…</view>       <!-- 阻止冒泡 -->
<input bind:input="onInput" value="{{text}}" />
```

- `bind:` / `catch:` 前缀写法与小写 `bindtap` 等价，新代码统一用 `bind:input` 形式。
- 传参只走 `data-*`，取值 `e.currentTarget.dataset.id`（注意 dataset 会把 `data-my-id` 规范化为 `myId`）。
- `e.target` 是实际触发节点，`e.currentTarget` 是绑定事件的节点；列表里取 `data-*` 一律用 `currentTarget`。
- 事件处理函数禁止写箭头函数在 WXML 里传参，也不要在 WXML 里做运算或函数调用（性能与可读性都差）；派生数据放 `observers`。
- 需要刷新 `properties` 同名数据时用 `mut-bind:`（少见，属高级用法）。

### 模板与插槽

- `template` + `is` 只做纯展示片段复用；带状态、带逻辑的复用一律做成**自定义组件**。
- `import` 引入 template 定义，`include` 直接嵌入除 `<template/>` 外的整段代码。
- 具名插槽需要组件 `.json` 或 `options` 里开 `multipleSlots: true`，用法见 `components/navigation-bar/navigation-bar.wxml`。
- 组件双向绑定优先显式 `properties` + `triggerEvent`，不要依赖 `model:` 魔法。

## WXSS 约定

### 尺寸

- 设计稿按 **750px 宽**出，标注值直接写 `rpx`。`1rpx = 屏宽 / 750 px`。
- 1px 边框、发丝线用 `px`（或 `.5px` + `border`），避免小屏被 rpx 抹掉。
- 字体大小可用 `rpx`，但需要与系统字号缩放并存的正文建议 `px` + 适度 `rpx` 混排，保持一致即可。

### 选择器与作用域

- 只用 class 选择器；`#id`、标签选择器、后代深嵌套都避免。
- 不支持通配符 `*`；属性选择器、复杂伪类在 Skyline 下差异更大，别用。
- `page { ... }` 只在页面级 wxss 生效，用来定整页骨架。
- 组件样式默认 `isolated`：组件 wxss 不影响外部、外部 class 也不进组件。需要外部控制外观时依次考虑：`properties` 传值 → `externalClasses` → `styleIsolation: apply-shared`（最后手段）。
- 全局 `app.wxss` 只放 CSS 变量、`page` 骨架和极少数通用类；业务样式一律就近放在页面/组件 wxss。

### 主题变量

```css
/* app.wxss */
page {
  --tf-fg-0: rgba(0, 0, 0, 0.9);
  --tf-fg-1: rgba(0, 0, 0, 0.6);
  --tf-bg-0: #ffffff;
  --tf-danger: #fa5151;
}
```

所有自研组件用 `var(--tf-*)` 取色，禁止散落硬编码色值；局部需要覆写时在组件根节点重设变量。

### 安全区

```css
.navbar-safe { padding-top: env(safe-area-inset-top); }
.bottom-safe { padding-bottom: env(safe-area-inset-bottom); }
```

自定义导航栏页面顶部、贴底操作条都必须处理安全区，参考 `components/navigation-bar/`：它用 `wx.getMenuButtonBoundingClientRect()` 与系统信息动态算左右留白与高度。

## custom 导航栏页面骨架

全局 `navigationStyle: "custom"`，所以每个页面都长这样，直接照抄：

```xml
<!-- pages/<name>/<name>.wxml -->
<navigation-bar title="页面标题" back="{{true}}" color="black" background="#FFF"></navigation-bar>
<scroll-view class="scrollarea" scroll-y type="list">
  <view class="container"><!-- 正文 --></view>
</scroll-view>
```

```css
/* pages/<name>/<name>.wxss */
page { height: 100vh; display: flex; flex-direction: column; }
.scrollarea { flex: 1; overflow-y: hidden; }
```

首页（`pages/index/`）不要返回按钮，传 `back="{{false}}"`。

## Skyline 注意事项

`app.json` 已开启 `defaultDisplayBlock` 与 `defaultContentBox`，因此常规 flex / block 布局写法可用。仍需注意：

- `scroll-view` 一律写 `type="list"` 并配 `scroll-y`，滚动容器不要自己用 CSS 模拟。
- Skyline 的组件与样式支持范围比 WebView 窄，遇到“样式写了不生效”先怀疑渲染器差异，而不是先加 `!important`。
- 表单类控件的选型只能从官方支持表里挑：`slider`、`switch`、`checkbox`、`radio`、`picker`、`input` 是**完全支持**；`picker-view`（上下滚轮）是**基本支持**，但 `indicator-style` / `indicator-class` 这类 `-class`/`-style` 属性未支持 —— 选中项样式要写在 item 自己的 class 上，且 item 行高要与默认 indicator 高度对齐（`picker-view` 必须显式给高度）。`movable-view` / `movable-area`、`progress`、`editor`、`web-view` 属**暂不考虑**，不要拿它们做交互控件。
- 官方差异表：<https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/component.html>；WXSS 差异：<https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/wxss.html>。
- **未实测不得写进规范**：任何依赖 Skyline 具体行为的写法（canvas 2D、自定义路由、worklet 动画、`grid` 布局等），先在真机上跑一个最小 demo，确认后再补写进本节。

### 自定义字体（2026-10 真机验证通过）

数字 / 拉丁字母用 Barlow、汉字回退系统字体的做法，本项目已落地，字体文件与生成脚本见 `assets/fonts/README.md`。要点：

- **机制**：WXSS `@font-face` + **base64 内嵌的 ttf**。Skyline 的 `@font-face` 只认 ttf（woff / woff2 不解析），而本项目没有后端、公共 CDN 也进不了 downloadFile 白名单，所以只能内嵌。
- **字体栈必须写字面量**：`font-family: "Barlow", sans-serif`。把字体栈塞进 CSS 变量再用 `var(--x)` 取，在 Skyline 下可能整条失效（`var()` 在 Skyline 上有一串已知缺陷）。
- **同一族用多档字重**：多条 `@font-face` 同名、靠 `font-weight` 区分（当前 400 / 500 / 600），业务代码直接写 `font-weight: 500` 就能落到对应那一档，不需要第二个字体族名。只给局部用的一档可以只嵌它需要的字符（例如 Medium 只放数字，4KB 搞定），别为了一处加重多塞 20KB。
- **原生 `input` / `textarea` 不能设字体**（官方 tip：原生组件，字体是系统字体）。但**开发者工具里 input 永远不跟随自定义字体，真机上会正常显示** —— 所以判断字体有没有生效，必须看真机或量字形，别用模拟器截图下结论（本项目在这里连踩三轮）。
- **判断生效的硬指标**：同一串数字的「宽 ÷ 字高」比例。Barlow 与系统字体差 10% 以上（例如 `11.94` 是 2.74–2.82 vs 3.1–3.2），比"看着像"可靠。
