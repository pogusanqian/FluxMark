import Big from 'big.js'

/**
 * 挂单价计算：纯函数，不依赖任何 wx API，便于复用与将来做单测。
 *
 * 金额运算一律走 big.js（十进制），不自己用浮点乘除：
 * 价格 × 百分比最容易在「半分」临界值上出错 —— 1.00 × 0.5% 的真实值是 1.005，
 * 而 JS 浮点算出来是 1.0049999…，取整后就少一分钱。
 * （曾用整数精确算法对拍 102000 组，纯浮点实现有 73 组错 1 分。）
 *
 * 两种输出，都是「一个幅度 → 一对价格（下浮 / 上浮）」：
 * 1. 固定三档（0.5% / 1% / 1.5%）—— 一进页面就要看到，`calcFixedPairs`
 * 2. 步进器选定的任意幅度 —— `calcPricePair`
 *
 * 幅度以哪个价格为基准由页面决定（今日开盘价 / 昨日收盘价，页面上是那个开关），
 * 所以这里的参数叫 basisPrice：「基准价」，不是写死的开盘价。
 *
 * 另外单独提供一个「任意两个价格之间的涨跌幅」读数（`calcVsOther`），
 * 页面只用它显示参数卡底部的「今开较昨收」；挂单价本身不再附带第二个基准的小字。
 */

/** 首屏常显的固定档位（百分比） */
export const FIXED_RATIOS = [0.5, 1, 1.5] as const

/** 幅度允许的取值范围（百分比）、步长与默认值 */
export const RATIO_MIN = 0
export const RATIO_MAX = 99
export const RATIO_STEP = 0.1
export const RATIO_DEFAULT = 3

/** 改默认值用的滚轮：整数档位 1% ~ 10% */
export const DEFAULT_WHEEL_OPTIONS: string[] = buildDefaultWheelOptions()

function buildDefaultWheelOptions(): string[] {
  const options: string[] = []
  for (let percent = 1; percent <= 10; percent += 1) {
    options.push(`${percent}%`)
  }
  return options
}

/** 幅度 → 滚轮下标（越界夹紧；滚轮是整数档，小数会对到最近的整数档） */
export function ratioToWheelIndex(ratio: number): number {
  const index = Math.round(ratio) - 1
  return Math.min(Math.max(index, 0), DEFAULT_WHEEL_OPTIONS.length - 1)
}

/** 滚轮下标 → 幅度（整数） */
export function wheelIndexToRatio(index: number): number {
  const clamped = Math.min(Math.max(index, 0), DEFAULT_WHEEL_OPTIONS.length - 1)
  return clamped + 1
}

/** 价格方向（幅度恒为非负，这里指的是价格在开盘价之上还是之下） */
export type Direction = 'up' | 'down'

/** 相对另一个基准的涨跌方向：涨 / 跌 / 持平（含无数据），用于着色 */
export type VsOtherTone = Direction | 'flat'

/** 一个价格相对另一个参照价的位置 */
export interface VsOther {
  /** 涨跌幅文本，如 "+1.50%"、"-1.10%"、"0.00%"；参照价没有数据时为空字符串 */
  text: string
  /** 涨跌方向，供页面着色；无数据时为 'flat' */
  tone: VsOtherTone
}

/** 百分比读数保留 2 位小数，与行情软件口径一致 */
const PERCENT_DP = 2

/** 参照价没有数据时的占位：文本留空，行高与结构不跳动 */
function noVsOther(): VsOther {
  return { text: '', tone: 'flat' }
}

/** 百分比读数：先取整再定方向，保证红绿与显示的文本永远一致 */
function toVsOther(price: Big, otherPrice: number): VsOther {
  const percent = price.minus(otherPrice).div(otherPrice).times(HUNDRED)
  const rounded = percent.round(PERCENT_DP, Big.roundHalfUp)
  if (rounded.eq(0)) {
    return { text: `${rounded.abs().toFixed(PERCENT_DP)}%`, tone: 'flat' }
  }
  const tone: VsOtherTone = rounded.gt(0) ? 'up' : 'down'
  return { text: `${tone === 'up' ? '+' : ''}${rounded.toFixed(PERCENT_DP)}%`, tone }
}

export interface PriceLevel {
  /** 档位标签，如 "+1%"、"-1.5%"（相对基准价） */
  label: string
  /** 方向：高于基准价 / 低于基准价 */
  direction: Direction
  /** 计算后的价格，固定 2 位小数；无数据时为空字符串 */
  text: string
}

export interface PricePair {
  /** 幅度（百分比数值，1.2 表示 1.2%） */
  ratio: number
  /** 幅度标签，如 "1.5%" */
  ratioLabel: string
  /** 下浮价（低于基准价） */
  fall: PriceLevel
  /** 上浮价（高于基准价） */
  rise: PriceLevel
}

/** 金额保留 2 位小数、四舍五入（半分进位） */
const MONEY_DP = 2

const ONE = new Big(1)
const HUNDRED = new Big(100)

/**
 * 用十进制算完，最后落到 2 位小数的字符串。
 * 全程不经过 JS 浮点，所以不存在 1.005 → 1.00 这类半分误差。
 */
function toMoney(value: Big): string {
  return roundMoney(value).toFixed(MONEY_DP)
}

/** 同样的口径，但返回 Big —— 「较昨收」要接着往下算 */
function roundMoney(value: Big): Big {
  return value.round(MONEY_DP, Big.roundHalfUp)
}

/**
 * 解析用户输入的价格。
 * 只接受正数，最多 3 位小数（场内基金最小变动为 0.001 元）；
 * 空串与非法输入都返回 null，由调用方决定提示文案。
 */
export function parsePrice(input: string): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (!/^\d+(\.\d{1,3})?$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

/** 基准价的 1% 是多少钱（保留 2 位小数，如 3.3 → 0.03），用作幅度列的刻度说明 */
export function calcOnePercentAmount(price: number): string {
  return toMoney(new Big(price).div(HUNDRED))
}

/** 幅度显示：去掉多余的小数位（1 → "1"，1.2 → "1.2"，1.25 → "1.25"） */
export function formatRatio(ratio: number): string {
  return String(Number(ratio.toFixed(2)))
}

/** 表格里的幅度标签：固定一位小数，让 0.5% / 1.0% / 1.5% 竖排对齐 */
export function formatRatioLabel(ratio: number): string {
  return `${ratio.toFixed(1)}%`
}

function buildLevel(basisPrice: number | null, ratio: number, direction: Direction): PriceLevel {
  const label = `${direction === 'up' ? '+' : '-'}${formatRatio(ratio)}%`
  if (basisPrice === null) {
    return { label, direction, text: '' }
  }
  const signedRatio = direction === 'up' ? ratio : -ratio
  const factor = ONE.plus(new Big(signedRatio).div(HUNDRED))
  return {
    label,
    direction,
    text: roundMoney(new Big(basisPrice).times(factor)).toFixed(MONEY_DP),
  }
}

/**
 * 一个幅度同时算出下浮价与上浮价。
 * basisPrice 为 null（没填 / 输入非法）时价格留空但标签照旧，页面结构不跳动。
 */
export function calcPricePair(basisPrice: number | null, ratio: number): PricePair {
  return {
    ratio,
    ratioLabel: formatRatioLabel(ratio),
    fall: buildLevel(basisPrice, ratio, 'down'),
    rise: buildLevel(basisPrice, ratio, 'up'),
  }
}

/** 固定档位：一次给出全部档位的下浮 / 上浮价，用于首屏常显 */
export function calcFixedPairs(basisPrice: number | null): PricePair[] {
  return FIXED_RATIOS.map((ratio) => calcPricePair(basisPrice, ratio))
}

/**
 * 任意两个价格之间的涨跌幅读数，页面只用它显示参数卡底部的「今开较昨收」。
 * price 或 reference 为 null（没填 / 输入非法）时返回空文本。
 */
export function calcVsOther(price: number | null, reference: number | null): VsOther {
  if (price === null || reference === null) return noVsOther()
  return toVsOther(new Big(price), reference)
}
