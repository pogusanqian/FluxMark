// index.ts
import {
  calcFixedPairs,
  calcOnePercentAmount,
  calcPricePair,
  calcVsOther,
  DEFAULT_WHEEL_OPTIONS,
  parsePrice,
  PricePair,
  RATIO_DEFAULT,
  RATIO_MAX,
  RATIO_MIN,
  RATIO_STEP,
  ratioToWheelIndex,
  VsOther,
  VsOtherTone,
  wheelIndexToRatio,
} from '../../services/order-price'
import {
  Company,
  companyLabel,
  createCompany,
  loadCompanies,
  loadSelectedCompanyId,
  saveCompanies,
  saveSelectedCompanyId,
} from '../../services/companies'
import { read, write } from '../../services/storage'

/** 幅度以哪个价格为基准：今日开盘价 / 昨日收盘价 / 持仓成本价 */
type Basis = 'open' | 'prevClose' | 'cost'

/** 基准价在页面上的名字：弹框问「改用谁」用它（句子要完整）。
 *  幅度列表头只写数值「1%=0.33」，不带名字 —— 基准是哪个由参数卡上的「基准」标签表示 */
const BASIS_NAMES: Record<Basis, string> = {
  open: '今日开盘价',
  prevClose: '昨日收盘价',
  cost: '持仓成本价',
}

/** 上次的幅度 / 默认幅度 / 幅度基准 */
const RATIO_KEY = 'last-ratio-value'
const DEFAULT_KEY = 'default-ratio'
const BASIS_KEY = 'ratio-basis'

/** 幅度是否落在允许范围内（存储里可能是旧值或被改坏的值） */
function isValidRatio(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= RATIO_MIN && value <= RATIO_MAX
  )
}

/** 存储里的基准可能是旧值或被改坏的值 */
function isValidBasis(value: unknown): value is Basis {
  return value === 'open' || value === 'prevClose' || value === 'cost'
}

/** 今收 / 最高 / 最低：只回填格式合法的原文（非法值当没填），三个小格都可编辑 */
function rangeValue(raw: string): string {
  return parsePrice(raw) === null ? '' : raw.trim()
}

/**
 * 今日 最高 / 今收 / 最低 里有没有任何一格填过。
 * 三格都空时整行不出现：这三个价在公司管理页录入，计算页只在有数的时候把它们摆出来，
 * 不让一行「--」占着卡片的版面。
 * 用原文判空（不是 parsePrice）：只在切换公司 / 回到页面时算一次，
 * 输入过程中不会因为打了个 "3." 就把正在编辑的那一行收掉。
 */
function hasRangeValues(company: Company): boolean {
  return [company.high, company.close, company.low].some((raw) => raw.trim() !== '')
}

/**
 * 三个小格（最高 / 今收 / 最低）各自跟「当前基准价」比：
 * 高于基准 = 红(up)、低于基准 = 绿(down)、持平 = 灰(flat)；有一个价比不了就不染色（空串）。
 * 基准是长按选出来的那个价 —— 基准是今开就比今开，是昨收就比昨收。
 */
function toneVsBasis(raw: string, basisPrice: number | null): VsOtherTone | '' {
  const vs = calcVsOther(parsePrice(raw), basisPrice)
  return vs.text ? vs.tone : ''
}

// 注意：这里必须用 type 而不是 interface。
// Component 的泛型约束是 Record<string, ...>，interface 没有隐式索引签名，会编译失败。
type Data = {
  /** 输入框里的原始文本（今日开盘价） */
  openPrice: string
  /** 输入框里的原始文本（昨日收盘价）。它也可以当幅度基准 */
  prevClosePrice: string
  /** 输入框里的原始文本（持仓成本价）。它也可以当幅度基准 */
  costPrice: string
  /** 公司表（选择器与回写都要用） */
  companies: Company[]
  /** 选择器选项：就是全部公司名 */
  pickerOptions: string[]
  /** 选择器当前下标 */
  pickerIndex: number
  /** 当前选中的公司 id；空串表示一家公司都没有 */
  selectedId: string
  /** 当前公司名（显示在选择条上）；没有公司时为空 */
  companyName: string
  /** 今日 最高 / 今收 / 最低：卡顶那一行三个小格，直接改、改完回写公司；不参与挂单价计算 */
  rangeClose: string
  rangeHigh: string
  rangeLow: string
  /** 中间那行（最高 / 今收 / 最低）要不要出现：按公司有没有数据算，长按卡底读数行也能手动开关 */
  showRange: boolean
  /** 最高 / 今收 / 最低 各自与当前基准价比出来的着色：高于基准红、低于绿、持平灰；比不了时为空、不着色 */
  highTone: VsOtherTone | ''
  closeTone: VsOtherTone | ''
  lowTone: VsOtherTone | ''
  /** 今收比较今高：今收相对最高价差几个百分点，只展示 */
  closeVsHigh: VsOther
  /** 幅度以哪个价格为基准：今日开盘价 / 昨日收盘价 / 持仓成本价 */
  basis: Basis
  /** 今开相对昨收的涨跌幅，写在参数卡底部 */
  openVsPrevClose: VsOther
  /** 当前基准价 1% 对应的金额（幅度列的刻度，写在幅度列表头「1%=…」里） */
  basisPercentAmount: string
  /** 卡底没有读数时的说明（首次进来还没填价），跟比例行共用同一种行 */
  showHint: boolean
  /** 固定三档（0.5% / 1% / 1.5%）：一进页面就常显 */
  fixed: PricePair[]
  /** 步进器当前的幅度 */
  ratioValue: number
  /** 步进器参数，透传给组件 */
  ratioMin: number
  ratioMax: number
  ratioStep: number
  /** 步进器当前幅度对应的那对价格（下浮 / 上浮），含各自相对另一基准的小字 */
  current: PricePair
  /** 是否正在用滚轮改默认幅度 */
  editingDefault: boolean
  /** 滚轮档位标签（1% ~ 10% 整数） */
  wheelOptions: string[]
  /** 滚轮选中项，picker-view 的 value 是数组 */
  wheelValue: number[]
  error: string
}

type Methods = {
  onLoad(): void
  /** 从公司页回来（或首次显示）时同步公司表与当前选择 */
  onShow(): void
  onHide(): void
  onUnload(): void
  onInput(e: WechatMiniprogram.Input): void
  onPrevCloseInput(e: WechatMiniprogram.Input): void
  /** 成本那一格：和另外两个价一样能改、能当基准，改完回写公司 */
  onCostInput(e: WechatMiniprogram.Input): void
  /** 卡顶那一行三个小格：改完同样回写公司，并让着色与「今收比最高」跟着变 */
  onHighInput(e: WechatMiniprogram.Input): void
  onCloseInput(e: WechatMiniprogram.Input): void
  onLowInput(e: WechatMiniprogram.Input): void
  /** 长按卡底那一行：开/关中间那行「最高 / 今收 / 最低」（临时补录用，再长按一次收起） */
  onToggleRange(): void
  /** 选择器换公司 */
  onCompanyChange(e: WechatMiniprogram.PickerChange): void
  /** 去公司管理页 */
  onManage(): void
  /** 切到某家公司 */
  applyCompany(company: Company): void
  /** 读公司表与当前选择，并把两个价回填到输入框 */
  syncCompanies(): void
  /** 长按昨日收盘价那一格：问一下是否改用它为基准 */
  onAskBasisPrevClose(): void
  /** 长按今日开盘价那一格：同上 */
  onAskBasisOpen(): void
  /** 长按持仓成本那一格：同上 */
  onAskBasisCost(): void
  /** 弹原生弹框确认，确认后才改基准（避免点一下就误切） */
  confirmBasis(basis: Basis): void
  /** 改基准：落盘并立刻重算 */
  setBasis(basis: Basis): void
  onRatioChange(e: WechatMiniprogram.CustomEvent<{ value: number }>): void
  /** 长按最后一行：展开默认幅度滚轮 */
  onDefaultEdit(): void
  onWheelChange(e: WechatMiniprogram.PickerViewChange): void
  onDefaultCancel(): void
  /** 保存：既写成默认幅度，也立刻用上 */
  onDefaultSave(): void
  /** 按当前「基准价 + 另一基准 + 幅度」重算所有显示值 */
  refresh(): void
  /** 计算页改价后回写到所选公司（没有选中公司时什么都不做） */
  writeBack(field: 'prevClose' | 'open' | 'cost' | 'close' | 'high' | 'low', value: string): void
  /** 一家公司都没有时，第一次改价自动建一家「我的持仓」并选中它 */
  ensureCompany(): void
  /** 把当前选择与幅度、基准落盘 */
  persist(): void
}

Component<Data, {}, Methods, {}, true>({
  data: {
    openPrice: '',
    prevClosePrice: '',
    costPrice: '',
    companies: [],
    pickerOptions: [],
    pickerIndex: 0,
    selectedId: '',
    companyName: '',
    rangeClose: '',
    rangeHigh: '',
    rangeLow: '',
    showRange: false,
    highTone: '',
    closeTone: '',
    lowTone: '',
    closeVsHigh: calcVsOther(null, null),
    basis: 'open',
    openVsPrevClose: calcVsOther(null, null),
    basisPercentAmount: '',
    showHint: true,
    fixed: calcFixedPairs(null),
    ratioValue: RATIO_DEFAULT,
    ratioMin: RATIO_MIN,
    ratioMax: RATIO_MAX,
    ratioStep: RATIO_STEP,
    current: calcPricePair(null, RATIO_DEFAULT),
    editingDefault: false,
    wheelOptions: DEFAULT_WHEEL_OPTIONS,
    wheelValue: [ratioToWheelIndex(RATIO_DEFAULT)],
    error: '',
  },
  methods: {
    onLoad() {
      const savedDefault = read<number>(DEFAULT_KEY, RATIO_DEFAULT)
      const defaultRatio = isValidRatio(savedDefault) ? savedDefault : RATIO_DEFAULT
      const savedRatio = read<number>(RATIO_KEY, defaultRatio)
      const savedBasis = read<Basis>(BASIS_KEY, 'open')
      this.setData({
        basis: isValidBasis(savedBasis) ? savedBasis : 'open',
        ratioValue: isValidRatio(savedRatio) ? savedRatio : defaultRatio,
      })
    },
    onShow() {
      this.syncCompanies()
    },
    onHide() {
      this.persist()
    },
    onUnload() {
      this.persist()
    },
    onInput(e) {
      const value = e.detail.value
      this.setData({ openPrice: value })
      this.writeBack('open', value)
      this.refresh()
    },
    onPrevCloseInput(e) {
      const value = e.detail.value
      this.setData({ prevClosePrice: value })
      this.writeBack('prevClose', value)
      this.refresh()
    },
    onCostInput(e) {
      const value = e.detail.value
      this.setData({ costPrice: value })
      this.writeBack('cost', value)
      this.refresh()
    },
    onHighInput(e) {
      const value = e.detail.value
      this.setData({ rangeHigh: value })
      this.writeBack('high', value)
      this.refresh()
    },
    onCloseInput(e) {
      const value = e.detail.value
      this.setData({ rangeClose: value })
      this.writeBack('close', value)
      this.refresh()
    },
    onLowInput(e) {
      const value = e.detail.value
      this.setData({ rangeLow: value })
      this.writeBack('low', value)
      this.refresh()
    },
    onToggleRange() {
      // 只切显隐，不写数据：真填了才会回写公司、下次进来才自动出现。
      // 长按是故意的：这一行平时按数据自动显隐，不占卡底的位置
      this.setData({ showRange: !this.data.showRange })
    },
    onCompanyChange(e) {
      const value = Number(e.detail.value)
      if (!Number.isInteger(value) || value < 0) return
      const company = this.data.companies[value]
      if (!company) return
      this.applyCompany(company)
    },
    onManage() {
      wx.navigateTo({ url: '/pages/companies/companies' })
    },
    applyCompany(company) {
      this.setData({
        selectedId: company.id,
        companyName: companyLabel(company),
        pickerIndex: this.data.companies.indexOf(company),
        prevClosePrice: company.prevClose,
        openPrice: company.open,
        costPrice: company.cost,
        rangeClose: rangeValue(company.close),
        rangeHigh: rangeValue(company.high),
        rangeLow: rangeValue(company.low),
        showRange: hasRangeValues(company),
      })
      saveSelectedCompanyId(company.id)
      this.refresh()
    },
    syncCompanies() {
      const companies = loadCompanies()
      const stored = loadSelectedCompanyId()
      // 选中的公司还在就用它，否则落到第一家；一家都没有就清空，页面引导去添加公司
      const selected =
        companies.find((company) => company.id === stored) ??
        (companies.length > 0 ? companies[0] : null)
      const selectedId = selected ? selected.id : ''
      if (selectedId !== stored) saveSelectedCompanyId(selectedId)
      this.setData({
        companies,
        pickerOptions: companies.map(companyLabel),
        pickerIndex: selected ? companies.indexOf(selected) : 0,
        selectedId,
        companyName: selected ? companyLabel(selected) : '',
        prevClosePrice: selected ? selected.prevClose : '',
        openPrice: selected ? selected.open : '',
        costPrice: selected ? selected.cost : '',
        rangeClose: selected ? rangeValue(selected.close) : '',
        rangeHigh: selected ? rangeValue(selected.high) : '',
        rangeLow: selected ? rangeValue(selected.low) : '',
        showRange: selected ? hasRangeValues(selected) : false,
      })
      this.refresh()
    },
    onAskBasisPrevClose() {
      this.confirmBasis('prevClose')
    },
    onAskBasisOpen() {
      this.confirmBasis('open')
    },
    onAskBasisCost() {
      this.confirmBasis('cost')
    },
    confirmBasis(basis) {
      // 还没有公司的时候三个价是锁着的，改基准没有意义
      if (!this.data.selectedId) {
        wx.showToast({ title: '先添加公司', icon: 'none' })
        return
      }
      // 已经是基准就没必要问
      if (basis === this.data.basis) {
        wx.showToast({ title: '已经是基准', icon: 'none' })
        return
      }
      const name = BASIS_NAMES[basis]
      // 那个价还没填：切过去整张表会空掉，先拦住
      const raw = {
        open: this.data.openPrice,
        prevClose: this.data.prevClosePrice,
        cost: this.data.costPrice,
      }[basis]
      if (parsePrice(raw) === null) {
        wx.showToast({ title: `先填入${name}`, icon: 'none' })
        return
      }
      wx.showModal({
        title: `改用${name}为基准？`,
        content: '整张表的幅度会围绕这个价重算',
        confirmText: '切换',
        success: (res) => {
          if (res.confirm) this.setBasis(basis)
        },
      })
    },
    setBasis(basis) {
      if (basis === this.data.basis) return
      this.setData({ basis })
      write(BASIS_KEY, basis)
      this.refresh()
    },
    onRatioChange(e) {
      this.setData({ ratioValue: e.detail.value })
      this.refresh()
    },
    onDefaultEdit() {
      this.setData({
        editingDefault: true,
        wheelValue: [ratioToWheelIndex(this.data.ratioValue)],
      })
    },
    onWheelChange(e) {
      this.setData({ wheelValue: e.detail.value })
    },
    onDefaultCancel() {
      this.setData({ editingDefault: false })
    },
    onDefaultSave() {
      const ratio = wheelIndexToRatio(this.data.wheelValue[0])
      write(DEFAULT_KEY, ratio)
      write(RATIO_KEY, ratio)
      this.setData({ editingDefault: false, ratioValue: ratio })
      this.refresh()
    },
    refresh() {
      const open = parsePrice(this.data.openPrice)
      const prevClose = parsePrice(this.data.prevClosePrice)
      const cost = parsePrice(this.data.costPrice)
      // 三个价就是三种基准，取当前基准那一个；算法层完全不关心谁是谁
      const basisPrice = { open, prevClose, cost }[this.data.basis]
      const invalidInput =
        (this.data.openPrice !== '' && open === null) ||
        (this.data.prevClosePrice !== '' && prevClose === null) ||
        (this.data.costPrice !== '' && cost === null)
      const openVsPrevClose = calcVsOther(open, prevClose)
      const basisPercentAmount = basisPrice === null ? '' : calcOnePercentAmount(basisPrice)
      const showHint = !openVsPrevClose.text && !basisPercentAmount
      this.setData({
        fixed: calcFixedPairs(basisPrice),
        current: calcPricePair(basisPrice, this.data.ratioValue),
        openVsPrevClose,
        // 三个数跟着「当前基准」着色：基准换成昨收，颜色就改跟昨收比
        highTone: toneVsBasis(this.data.rangeHigh, basisPrice),
        closeTone: toneVsBasis(this.data.rangeClose, basisPrice),
        lowTone: toneVsBasis(this.data.rangeLow, basisPrice),
        closeVsHigh: calcVsOther(parsePrice(this.data.rangeClose), parsePrice(this.data.rangeHigh)),
        basisPercentAmount,
        showHint,
        error: invalidInput ? '请输入有效的价格，例如 10.05' : '',
      })
    },
    writeBack(field, value) {
      // 没有公司也能直接开算：第一次改价先自动建一家，再照常回写
      this.ensureCompany()
      const index = this.data.companies.findIndex((company) => company.id === this.data.selectedId)
      if (index < 0) return
      this.setData({ [`companies[${index}].${field}`]: value })
      saveCompanies(this.data.companies)
    },
    ensureCompany() {
      const selected = this.data.companies.find((company) => company.id === this.data.selectedId)
      if (selected) return
      const company: Company = { ...createCompany(), name: '我的持仓' }
      const companies = [...this.data.companies, company]
      saveCompanies(companies)
      saveSelectedCompanyId(company.id)
      this.setData({
        companies,
        pickerOptions: companies.map(companyLabel),
        pickerIndex: companies.length - 1,
        selectedId: company.id,
        companyName: companyLabel(company),
      })
    },
    persist() {
      write(RATIO_KEY, this.data.ratioValue)
      write(BASIS_KEY, this.data.basis)
      saveSelectedCompanyId(this.data.selectedId)
    },
  },
})
