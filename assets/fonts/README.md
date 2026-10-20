# Barlow：数字与英文的字体

数字和拉丁字母用 Barlow，汉字保持系统字体。实现是一条 `font-family`：

```
"Barlow", sans-serif
```

Barlow 里没有汉字，所以每个汉字都会往后回退到系统默认无衬线字体，只有数字和英文真正用上 Barlow。

## 为什么是 base64 + WXSS @font-face

**状态：真机已验证可用。** 试过的三条路：

| 做法 | 结果 |
| --- | --- |
| `wx.loadFontFace` + https 直链 ttf | 加载要域名白名单；jsDelivr 这类公共 CDN 无法做域名归属校验，加不进白名单，自建域名还要备案 |
| `wx.loadFontFace` + base64 | 在开发者工具里字形没变（未再单独上真机验证） |
| WXSS `@font-face` + base64 + **字面量字体栈** | **真机生效** |

Skyline 文档明确把 Font-face 列为支持（**只认 ttf**），而 `var()` 在 Skyline 上有一串已知缺陷
（"css var shorthand 不生效"、"page 节点 font-size 使用 var() crash"、"keyframes 无法使用 var"）。
所以现在：**字体栈一律写字面量，不经过 CSS 变量**；字体以 base64 内嵌，零网络依赖。

注意：**开发者工具里 `input` 不会跟随自定义字体，真机上会正常显示**（input 是原生组件，官方
tip 说"字体是系统字体"）。判断字体有没有生效要看真机，或者量「宽 ÷ 字高」（Barlow 与系统字体差 10% 以上）。

## 目录内容

| 文件 | 说明 |
| --- | --- |
| `Barlow-Regular.ttf` / `Barlow-Medium.ttf` / `Barlow-SemiBold.ttf` | Google Fonts 上 Barlow 的 ttf 原件（104KB / 104KB / 108KB） |
| `OFL.txt` | SIL Open Font License 1.1，Barlow 的授权 |
| `build.py` | 子集化 + 把三档 `@font-face` 写进 `miniprogram/app.wxss` |

ttf 原件和脚本都在 `miniprogram/` 之外，不会打进小程序包；包里只有 `app.wxss` 中内嵌的 base64。

## 三档字重的分工

| 字重 | 字符集 | 用在哪 |
| --- | --- | --- |
| 400 Regular | 完整（ASCII + 标点） | 正文、说明、未加重的数字、公司名 |
| 500 Medium | **只有数字和价格符号**（4KB） | 阶梯表整张（表头 / 幅度 / 价格）、公司页的价格 |
| 600 SemiBold | 完整（ASCII + 标点） | 首页的大价格输入、读数、标签数值、导航栏标题 |

Medium 只服务阶梯价，所以子集里只放了 `0-9 . , - + %`，比全量省了 20KB。

## 重新生成

需要装了 fontTools 的 Python：

```bash
python assets/fonts/build.py
```

脚本做三件事：

1. 按字符集子集化：正文两档是 ASCII 可打印 + 少量常驻标点（`· × ° ¥`、破折号、引号、省略号、‰、€、™），Medium 只有数字与价格符号。不带 Latin-1 重音字母 —— 真遇到 `é` 这种字符只会让那一个字符回退系统字体；
2. 去掉 ttf hinting（手机上不用），保留 `kern` / `liga`；
3. 把 400 / 500 / 600 三档 `@font-face` 写进 `app.wxss` 的 `fonts:begin` 与 `fonts:end` 之间。

- 子集 ttf：Regular / SemiBold 各约 19–20KB，Medium 约 4KB；base64 后合计约 59KB，`app.wxss` 约 59KB（原始全量三档是 316KB）。
- 同一族三档字重，业务代码直接写 `font-weight: 500 / 600`，不用记第二个字体族名。

## 样式该怎么写

- 普通文本：`page` 上的字体栈会继承，什么都不用写；
- 原生 `input` / `button`：**不继承**字体，必须在自己身上显式写 `font-family: "Barlow", sans-serif`（`input` 在开发者工具里看不出效果，真机正常，属正常现象）；
- 样式隔离的自定义组件（`tag`、`stepper`、`navigation-bar`）：在根节点写一次；
- **不要**把字体栈塞进 CSS 变量再用 `var()` 取 —— Skyline 下可能整条失效。

## 如果哪天又不生效

先排除假阴性别急着改代码：

1. **开发者工具里的 `input` 永远不跟随自定义字体**（原生组件），真机才准；
2. 换机型/基础库后如果正文也变了，检查是不是有人把字体栈改回了 `var(--xxx)`；
3. 确认 `app.wxss` 里 `fonts:begin` / `fonts:end` 之间的两段 base64 还在（重跑 `build.py` 会覆盖，误删就重跑）；
4. 以上都正常仍不生效，再按顺序试：`src` 换成包内路径 `url("/fonts/Barlow.ttf")` → 换成 `wx.loadFontFace` + 字面量字体栈（此时要两个 family 承载两档字重）。
