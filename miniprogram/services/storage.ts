/**
 * 本地存储统一出口。
 * 业务代码不要直接调用 wx.setStorageSync / wx.getStorageSync —— 统一走这里。
 * 写入内容一律包一层 { v, data }，将来改数据结构时靠 v 做迁移。
 */

const KEY_PREFIX = 'tf:'

/** 存储结构版本。数据结构不兼容变更时 +1，并在 read 里补迁移逻辑。 */
const SCHEMA_VERSION = 1

interface Envelope<T> {
  v: number
  data: T
}

/** 读取。无数据、版本不符、内容损坏等任何异常都返回 fallback，绝不抛出。 */
export function read<T>(name: string, fallback: T): T {
  try {
    const raw = wx.getStorageSync(KEY_PREFIX + name) as Envelope<T> | ''
    if (!raw || typeof raw !== 'object') return fallback
    if (raw.v !== SCHEMA_VERSION) return fallback
    return raw.data === undefined || raw.data === null ? fallback : raw.data
  } catch {
    return fallback
  }
}

/** 写入。失败时给用户可见反馈，不静默失败。 */
export function write<T>(name: string, data: T): void {
  try {
    const envelope: Envelope<T> = { v: SCHEMA_VERSION, data }
    wx.setStorageSync(KEY_PREFIX + name, envelope)
  } catch {
    wx.showToast({ title: '保存失败', icon: 'none' })
  }
}
