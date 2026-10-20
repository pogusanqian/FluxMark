/**
 * 公司（自选 / 持仓）数据的读写与「当前选中哪家公司」。
 *
 * 一家公司 = 名称 + 六个价格；价格一律存用户输入的原文（如 "3.40"），
 * 解析与合法性判断交给 services/order-price 的 parsePrice，这里不做业务校验。
 *
 * 业务代码只经这里读写公司表，不直接碰 wx.setStorageSync。
 */
import { read, write } from './storage'

export interface Company {
  /** 本地唯一 id（公司改名不影响选中关系） */
  id: string
  /** 公司名称，允许为空（界面上显示为「未命名公司」） */
  name: string
  /** 昨收 */
  prevClose: string
  /** 成本 */
  cost: string
  /** 今开 */
  open: string
  /** 今收 */
  close: string
  /** 今日最高 */
  high: string
  /** 今日最低 */
  low: string
}

/** 价格字段，顺序即公司页两列一行的顺序：昨收/成本、今开/今收、最高/最低 */
export const PRICE_FIELDS = ['prevClose', 'cost', 'open', 'close', 'high', 'low'] as const

export type PriceField = (typeof PRICE_FIELDS)[number]

/** 价格字段的中文名（公司页的校验提示用） */
export const PRICE_FIELD_LABELS: Record<PriceField, string> = {
  prevClose: '昨收',
  cost: '成本',
  open: '今开',
  close: '今收',
  high: '最高',
  low: '最低',
}

/**
 * 旧版本把三个价直接存在这三个键里（那时还没有公司表）。
 * 只给升级迁移用：迁进公司表后，新代码不再读写它们。
 */
const LEGACY_PRICE_KEYS = {
  prevClose: 'last-prev-close-price',
  open: 'last-open-price',
  cost: 'last-cost-price',
} as const

const COMPANIES_KEY = 'companies'
const SELECTED_KEY = 'selected-company-id'
/** 迁移只做一次：否则用户把公司全删掉再重启，旧的手动价格又会被迁回来 */
const MIGRATED_KEY = 'companies-migrated'

/** 同一个进程内保证 id 不重复（Date.now 之外再加一个自增序号） */
let idSequence = 0

function createCompanyId(): string {
  idSequence += 1
  return `c${Date.now().toString(36)}${idSequence.toString(36)}`
}

/** 新建一家空白公司 */
export function createCompany(): Company {
  return {
    id: createCompanyId(),
    name: '',
    prevClose: '',
    cost: '',
    open: '',
    close: '',
    high: '',
    low: '',
  }
}

/** 界面上显示的公司名；还没起名时给一个占位 */
export function companyLabel(company: Company): string {
  const name = company.name.trim()
  return name || '未命名公司'
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 存储里的东西可能是旧结构或被改坏的值：逐字段兜底，坏到没有 id 就整条丢掉 */
function sanitizeCompany(value: unknown): Company | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const id = toText(record.id).trim()
  if (!id) return null
  return {
    id,
    name: toText(record.name),
    prevClose: toText(record.prevClose),
    cost: toText(record.cost),
    open: toText(record.open),
    close: toText(record.close),
    high: toText(record.high),
    low: toText(record.low),
  }
}

/** 读取公司表。任何异常、坏数据都退化成空表，绝不抛出。 */
export function loadCompanies(): Company[] {
  const stored = read<unknown>(COMPANIES_KEY, [])
  if (!Array.isArray(stored)) return []
  const seen = new Set<string>()
  const companies: Company[] = []
  for (const item of stored) {
    const company = sanitizeCompany(item)
    if (!company || seen.has(company.id)) continue
    seen.add(company.id)
    companies.push(company)
  }
  return companies
}

/** 整表写回（条目少，直接覆盖，不做增量） */
export function saveCompanies(companies: Company[]): void {
  write(COMPANIES_KEY, companies)
}

/** 读当前选择：公司 id；空串表示还没选，或一家公司都没有 */
export function loadSelectedCompanyId(): string {
  return read<string>(SELECTED_KEY, '')
}

export function saveSelectedCompanyId(id: string): void {
  write(SELECTED_KEY, id)
}

/**
 * 旧版本没有公司表，三个价直接存在 last-* 里。
 * 升级后第一次启动把它们收进一家「我的持仓」，原来的数不会凭空消失。
 * 幂等：迁移过的机器直接跳过（否则用户把公司全删掉后，旧价格又会被迁回来）。
 */
export function migrateLegacyPrices(): void {
  if (read<boolean>(MIGRATED_KEY, false)) return
  if (loadCompanies().length === 0) {
    const prevClose = read<string>(LEGACY_PRICE_KEYS.prevClose, '')
    const open = read<string>(LEGACY_PRICE_KEYS.open, '')
    const cost = read<string>(LEGACY_PRICE_KEYS.cost, '')
    if (prevClose || open || cost) {
      const company: Company = {
        id: createCompanyId(),
        name: '我的持仓',
        prevClose,
        cost,
        open,
        close: '',
        high: '',
        low: '',
      }
      saveCompanies([company])
      saveSelectedCompanyId(company.id)
    }
  }
  // 迁移过（或确认没有可迁的数据）就打标记，以后不再走这段
  write(MIGRATED_KEY, true)
}
