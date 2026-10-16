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
  wheelIndexToRatio,
} from '../../services/order-price'
import { read, write } from '../../services/storage'

/** 幅度以哪个价格为基准：今日开盘价 / 昨日收盘价 / 自己的成本价 */
type Basis = 'open' | 'prevClose' | 'cost'

/** 基准价在页面上的名字：弹框问「改用谁」用它（句子要完整）。
 *  幅度列表头只写数值「1%=0.33」，不带名字 —— 基准是哪个由参数卡上的「基准」标签表示 */
const BASIS_NAMES: Record<Basis, string> = {
  open: '今日开盘价',
  prevClose: '昨日收盘价',
  cost: '成本价',
}

/** 上次输入的今日开盘价 / 昨日收盘价 / 持仓成本 / 上次的幅度 / 默认幅度 / 幅度基准 */
const PRICE_KEY = 'last-open-price'
const PREV_CLOSE_KEY = 'last-prev-close-price'
const COST_KEY = 'last-cost-price'
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

// 注意：这里必须用 type 而不是 interface。
// Component 的泛型约束是 Record<string, ...>，interface 没有隐式索引签名，会编译失败。
type Data = {
  /** 输入框里的原始文本（今日开盘价） */
  openPrice: string
  /** 输入框里的原始文本（昨日收盘价）。它既可能是幅度的基准，也可能只是参照 */
  prevClosePrice: string
  /** 输入框里的原始文本（自己的持仓成本价）。跟行情价一样能当幅度基准 */
  costPrice: string
  /** 幅度以哪个价格为基准：今日开盘价 / 昨日收盘价 */
  basis: Basis
  /** 今开相对昨收的涨跌幅，写在参数卡底部 */
  openVsPrevClose: VsOther
  /** 今开相对持仓成本的涨跌幅，写在参数卡底部 */
  openVsCost: VsOther
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
  onHide(): void
  onUnload(): void
  onInput(e: WechatMiniprogram.Input): void
  onPrevCloseInput(e: WechatMiniprogram.Input): void
  onCostInput(e: WechatMiniprogram.Input): void
  /** 长按昨日收盘价那一格：问一下是否改用它为基准 */
  onAskBasisPrevClose(): void
  /** 长按今日开盘价那一格：同上 */
  onAskBasisOpen(): void
  /** 长按成本那一格：同上（止盈止损挂单就是按成本算的） */
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
  /** 把当前合法输入落盘 */
  persist(): void
}

Component<Data, {}, Methods, {}, true>({
  data: {
    openPrice: '',
    prevClosePrice: '',
    costPrice: '',
    basis: 'open',
    openVsPrevClose: calcVsOther(null, null),
    openVsCost: calcVsOther(null, null),
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
      const savedPrice = read<string>(PRICE_KEY, '')
      const savedPrevClose = read<string>(PREV_CLOSE_KEY, '')
      const savedCost = read<string>(COST_KEY, '')
      const savedDefault = read<number>(DEFAULT_KEY, RATIO_DEFAULT)
      const defaultRatio = isValidRatio(savedDefault) ? savedDefault : RATIO_DEFAULT
      const savedRatio = read<number>(RATIO_KEY, defaultRatio)
      const savedBasis = read<Basis>(BASIS_KEY, 'open')
      this.setData({
        openPrice: savedPrice,
        prevClosePrice: savedPrevClose,
        costPrice: savedCost,
        basis: isValidBasis(savedBasis) ? savedBasis : 'open',
        ratioValue: isValidRatio(savedRatio) ? savedRatio : defaultRatio,
      })
      this.refresh()
    },
    onHide() {
      this.persist()
    },
    onUnload() {
      this.persist()
    },
    onInput(e) {
      this.setData({ openPrice: e.detail.value })
      this.refresh()
    },
    onPrevCloseInput(e) {
      this.setData({ prevClosePrice: e.detail.value })
      this.refresh()
    },
    onCostInput(e) {
      this.setData({ costPrice: e.detail.value })
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
      const openVsCost = calcVsOther(open, cost)
      const basisPercentAmount = basisPrice === null ? '' : calcOnePercentAmount(basisPrice)
      this.setData({
        fixed: calcFixedPairs(basisPrice),
        current: calcPricePair(basisPrice, this.data.ratioValue),
        openVsPrevClose,
        openVsCost,
        basisPercentAmount,
        showHint: !openVsPrevClose.text && !openVsCost.text && !basisPercentAmount,
        error: invalidInput ? '请输入有效的价格，例如 10.05' : '',
      })
    },
    persist() {
      if (parsePrice(this.data.openPrice) !== null) {
        write(PRICE_KEY, this.data.openPrice)
      }
      if (parsePrice(this.data.prevClosePrice) !== null) {
        write(PREV_CLOSE_KEY, this.data.prevClosePrice)
      }
      if (parsePrice(this.data.costPrice) !== null) {
        write(COST_KEY, this.data.costPrice)
      }
      write(RATIO_KEY, this.data.ratioValue)
      write(BASIS_KEY, this.data.basis)
    },
  },
})
