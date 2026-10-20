// companies.ts
// 公司管理页：录入多家公司（名称 + 昨收 / 成本 / 今开 / 今收 / 最高 / 最低）。
// 一家公司一条：价格两列一行；左滑露出删除，改动即时落盘，没有保存按钮。
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

/** 横向滑动超过这个距离（px）才认成左滑，太小当成点击 */
const SWIPE_THRESHOLD = 30

type Data = {
  companies: Company[]
  /** 每家公司的校验提示，下标与 companies 对齐；没有问题就是空串 */
  rowErrors: string[]
  /** 当前被左滑打开的那家公司 id；空串表示都合着 */
  openId: string
  /** 新增公司后滚到它（scroll-into-view 要的是节点 id） */
  scrollIntoView: string
}

type TouchState = {
  touchStartX: number
  touchStartY: number
  /** 最近一次左滑完成的时间：滑动刚结束时的那一下 tap 不当作「点空白收起」 */
  swipedAt: number
}

type Methods = {
  onLoad(): void
  onNameInput(e: WechatMiniprogram.Input): void
  onPriceInput(e: WechatMiniprogram.Input): void
  /** 失焦才校验：输入中途（比如只打了个 "3."）不弹红字 */
  onPriceBlur(e: WechatMiniprogram.InputBlur): void
  onAdd(): void
  /** 点了左滑露出的「删除」 */
  onDeleteTap(e: WechatMiniprogram.TouchEvent): void
  removeCompany(index: number): void
  /** 点页面任意处：收起打开的那一行 */
  onPageTap(): void
  onTouchStart(e: WechatMiniprogram.TouchEvent): void
  onTouchEnd(e: WechatMiniprogram.TouchEvent): void
  persist(): void
}

function isPriceField(value: string): value is PriceField {
  return (PRICE_FIELDS as readonly string[]).includes(value)
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
    openId: '',
    scrollIntoView: '',
  },
  methods: {
    onLoad() {
      this.touchStartX = 0
      this.touchStartY = 0
      this.swipedAt = 0
      const companies = loadCompanies()
      this.setData({
        companies,
        rowErrors: companies.map(findCompanyError),
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
      const field = e.currentTarget.dataset.field as string
      if (!Number.isInteger(index) || index < 0 || index >= this.data.companies.length) return
      if (!isPriceField(field)) return
      this.setData({
        [`companies[${index}].${field}`]: e.detail.value,
        // 正在改这一格：先把旧提示撤掉，失焦再判
        [`rowErrors[${index}]`]: '',
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
      // 第一家公司顺手设为当前公司：从公司页返回计算页就能直接用
      if (companies.length === 1) saveSelectedCompanyId(company.id)
      this.setData({
        companies,
        rowErrors,
        openId: '',
        scrollIntoView: `company-${company.id}`,
      })
      this.persist()
    },
    onDeleteTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      const company = this.data.companies[index]
      if (!company) return
      wx.showModal({
        title: `删除「${companyLabel(company)}」？`,
        content: '这家公司的价格会一起删掉，不能恢复。',
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
      this.setData({ companies, rowErrors, openId: '', scrollIntoView: '' })
      this.persist()
      // 删掉的正好是计算页选中的公司：换到剩下的第一家，一家不剩就清空选择
      if (loadSelectedCompanyId() === removed.id) {
        saveSelectedCompanyId(companies.length > 0 ? companies[0].id : '')
      }
    },
    onPageTap() {
      // 滑完手指抬起时可能补一个 tap，别让它把刚打开的行又收回去
      if (Date.now() - this.swipedAt < 300) return
      if (this.data.openId) this.setData({ openId: '' })
    },
    onTouchStart(e) {
      const touch = e.touches[0]
      if (!touch) return
      this.touchStartX = touch.clientX
      this.touchStartY = touch.clientY
    },
    onTouchEnd(e) {
      const touch = e.changedTouches[0]
      if (!touch) return
      const dx = touch.clientX - this.touchStartX
      const dy = touch.clientY - this.touchStartY
      // 竖向是滚列表，不抢；横向也要够长才认
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return
      this.swipedAt = Date.now()
      const id = String(e.currentTarget.dataset.id)
      if (dx < 0) {
        if (this.data.openId !== id) this.setData({ openId: id })
      } else if (this.data.openId === id) {
        this.setData({ openId: '' })
      }
    },
    persist() {
      saveCompanies(this.data.companies)
    },
  },
})
