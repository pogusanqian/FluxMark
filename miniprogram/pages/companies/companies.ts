// companies.ts
// 公司管理页：录入多家公司（名称 + 昨收 / 成本 / 今开 / 今收 / 最高 / 最低）。
// 一家公司一张卡（components/company-card）；这一页只做三件事：
// 把数据喂给卡片、接住卡片抛回来的改动、决定哪张卡是左滑打开的。
import {
  Company,
  companyLabel,
  createCompany,
  loadCompanies,
  loadSelectedCompanyId,
  PRICE_FIELD_LABELS,
  PriceField,
  PRICE_FIELDS,
  saveCompanies,
  saveSelectedCompanyId,
} from '../../services/companies'
import { parsePrice } from '../../services/order-price'

type Data = {
  companies: Company[]
  /** 每家公司的校验提示，下标与 companies 对齐；没有问题就是空串 */
  rowErrors: string[]
  /** 这家公司有没有填过价：没填过就不显示「清空」 */
  hasPrices: boolean[]
  /** 当前被左滑打开的那家公司 id；空串表示都合着 */
  openId: string
  /** 新增公司后滚到它（scroll-into-view 要的是节点 id） */
  scrollIntoView: string
}

/** 卡片抛回来的 detail：一张卡只报「改了什么」，不报「是第几张」 */
type NameInputDetail = { value: string }
type PriceInputDetail = { field: string; value: string }
type PriceBlurDetail = { field: string }
type SwipeDetail = { direction: 'left' | 'right' }

type TouchState = {
  /** 最近一次滑动完成的时间：滑动刚结束时的那一下 tap 不当作「点空白收起」 */
  swipedAt: number
}

type Methods = {
  onLoad(): void
  onNameInput(e: WechatMiniprogram.CustomEvent<NameInputDetail>): void
  onPriceInput(e: WechatMiniprogram.CustomEvent<PriceInputDetail>): void
  /** 失焦才校验：输入中途（比如只打了个 "3."）不弹红字 */
  onPriceBlur(e: WechatMiniprogram.CustomEvent<PriceBlurDetail>): void
  onAdd(): void
  /** 卡片被左滑 / 右滑：页面统一裁决，保证同时只开一张 */
  onSwipe(e: WechatMiniprogram.CustomEvent<SwipeDetail>): void
  /** 点了左滑露出的「删除」 */
  onDeleteTap(e: WechatMiniprogram.CustomEvent): void
  removeCompany(index: number): void
  /** 点了卡片上的「清空」：确认后只清六个价格 */
  onClearTap(e: WechatMiniprogram.CustomEvent): void
  clearPrices(index: number): void
  /** 点页面任意处：收起打开的那一行 */
  onPageTap(): void
  persist(): void
}

function isPriceField(value: string): value is PriceField {
  return (PRICE_FIELDS as readonly string[]).includes(value)
}

/** 六个价格里有没有任意一个填了内容（决定「清空」要不要露出来） */
function hasAnyPrice(company: Company): boolean {
  return PRICE_FIELDS.some((field) => company[field].trim() !== '')
}

/** 一家公司里的第一条价格错误；全部合法（或为空）时返回空串 */
function findCompanyError(company: Company): string {
  for (const field of PRICE_FIELDS) {
    const raw = company[field]
    if (!raw.trim()) continue
    if (parsePrice(raw) === null) {
      return `${PRICE_FIELD_LABELS[field]}格式不对，例如 12.05`
    }
  }
  return ''
}

Component<Data, {}, Methods, TouchState, true>({
  data: {
    companies: [],
    rowErrors: [],
    hasPrices: [],
    openId: '',
    scrollIntoView: '',
  },
  methods: {
    onLoad() {
      this.swipedAt = 0
      const companies = loadCompanies()
      this.setData({
        companies,
        rowErrors: companies.map(findCompanyError),
        hasPrices: companies.map(hasAnyPrice),
      })
    },
    onNameInput(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (!Number.isInteger(index) || index < 0 || index >= this.data.companies.length) return
      this.setData({ [`companies[${index}].name`]: e.detail.value })
      this.persist()
    },
    onPriceInput(e) {
      const index = Number(e.currentTarget.dataset.index)
      const field = e.detail.field
      if (!Number.isInteger(index) || index < 0 || index >= this.data.companies.length) return
      if (!isPriceField(field)) return
      const value = e.detail.value
      const next: Company = { ...this.data.companies[index], [field]: value }
      this.setData({
        [`companies[${index}].${field}`]: value,
        // 正在改这一格：先把旧提示撤掉，失焦再判
        [`rowErrors[${index}]`]: '',
        // 清空了最后一个价之后，「清空」按钮就该收起来
        [`hasPrices[${index}]`]: hasAnyPrice(next),
      })
      this.persist()
    },
    onPriceBlur(e) {
      const index = Number(e.currentTarget.dataset.index)
      const company = this.data.companies[index]
      if (!company) return
      const error = findCompanyError(company)
      if (error !== this.data.rowErrors[index]) {
        this.setData({ [`rowErrors[${index}]`]: error })
      }
    },
    onAdd() {
      const company = createCompany()
      const companies = [...this.data.companies, company]
      const rowErrors = [...this.data.rowErrors, '']
      const hasPrices = [...this.data.hasPrices, false]
      // 第一家公司顺手设为当前公司：从公司页返回计算页就能直接用
      if (companies.length === 1) saveSelectedCompanyId(company.id)
      this.setData({
        companies,
        rowErrors,
        hasPrices,
        openId: '',
        scrollIntoView: `company-${company.id}`,
      })
      this.persist()
    },
    onSwipe(e) {
      const index = Number(e.currentTarget.dataset.index)
      const company = this.data.companies[index]
      if (!company) return
      // 滑完手指抬起时可能补一个 tap，记下时间让 onPageTap 别把刚打开的行又收回去
      this.swipedAt = Date.now()
      if (e.detail.direction === 'left') {
        if (this.data.openId !== company.id) this.setData({ openId: company.id })
      } else if (this.data.openId === company.id) {
        this.setData({ openId: '' })
      }
    },
    onDeleteTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      const company = this.data.companies[index]
      if (!company) return
      wx.showModal({
        title: `删除「${companyLabel(company)}」？`,
        confirmText: '删除',
        confirmColor: '#fa5151',
        success: (res) => {
          if (res.confirm) this.removeCompany(index)
        },
      })
    },
    removeCompany(index) {
      const removed = this.data.companies[index]
      if (!removed) return
      const companies = this.data.companies.filter((_, i) => i !== index)
      const rowErrors = this.data.rowErrors.filter((_, i) => i !== index)
      const hasPrices = this.data.hasPrices.filter((_, i) => i !== index)
      this.setData({ companies, rowErrors, hasPrices, openId: '', scrollIntoView: '' })
      this.persist()
      // 删掉的正好是计算页选中的公司：换到剩下的第一家，一家不剩就清空选择
      if (loadSelectedCompanyId() === removed.id) {
        saveSelectedCompanyId(companies.length > 0 ? companies[0].id : '')
      }
    },
    onClearTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      const company = this.data.companies[index]
      if (!company) return
      wx.showModal({
        title: `清空「${companyLabel(company)}」的价格？`,
        confirmText: '清空',
        confirmColor: '#fa5151',
        success: (res) => {
          if (res.confirm) this.clearPrices(index)
        },
      })
    },
    clearPrices(index) {
      const company = this.data.companies[index]
      if (!company) return
      /*
       * 只改这一张卡的六格，不整表替换：整表 setData 会让每张卡的每个 input 都过一遍
       * diff，再等原生输入框回写文字，点多几张卡就会明显发顿。
       * 落盘放到 setData 的回调里 —— 先把界面刷出来，再做同步存储写，别让存储 IO 挡在
       * 重绘前面。
       */
      const updates: Record<string, string | boolean> = {
        [`rowErrors[${index}]`]: '',
        [`hasPrices[${index}]`]: false,
      }
      for (const field of PRICE_FIELDS) {
        updates[`companies[${index}].${field}`] = ''
      }
      this.setData(updates, () => this.persist())
    },
    onPageTap() {
      // 滑完手指抬起时可能补一个 tap，别让它把刚打开的行又收回去
      if (Date.now() - this.swipedAt < 300) return
      if (this.data.openId) this.setData({ openId: '' })
    },
    persist() {
      saveCompanies(this.data.companies)
    },
  },
})
