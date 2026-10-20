// company-card.ts
// 一家公司一张卡：名称一行 + 六个价格（两列三行），左滑露出删除，名称右边挂「清空」。
// 受控组件：十个值都按「一个字段一个属性」传进来，改动只用 triggerEvent 抛给页面。
// 不接整对象而拆成字段，是为了让页面用 companies[3].close 这种路径更新时，
// 变化的那个属性精确落到对应的输入框上（整对象属性在路径更新下不一定重新下发）。
import { PRICE_FIELDS } from '../../services/companies'

/**
 * 横向滑动超过这个距离（px）才认成滑动，太小当成点击。
 * 用 px 不用 rpx：和 WXSS 里 80px 的删除宽度是同一套手势几何，换屏宽也不会错位。
 */
const SWIPE_THRESHOLD = 30

type Props = {
  /** 公司名（可以为空，界面上显示占位符） */
  name: { type: StringConstructor; value: string }
  /** 昨收 */
  prev: { type: StringConstructor; value: string }
  /** 成本 */
  cost: { type: StringConstructor; value: string }
  /** 今开 */
  open: { type: StringConstructor; value: string }
  /** 今收 */
  close: { type: StringConstructor; value: string }
  /** 今日最高 */
  high: { type: StringConstructor; value: string }
  /** 今日最低 */
  low: { type: StringConstructor; value: string }
  /** 校验提示，空串不显示 */
  error: { type: StringConstructor; value: string }
  /** 有没有填过价：一格都没填过就不显示「清空」 */
  showClear: { type: BooleanConstructor; value: boolean }
  /** 左滑是否打开：由页面统一裁决（同时只开一张），卡片只负责卡片位移 */
  revealed: { type: BooleanConstructor; value: boolean }
}

type TouchState = {
  touchStartX: number
  touchStartY: number
}

type Methods = {
  onNameInput(e: WechatMiniprogram.Input): void
  onPriceInput(e: WechatMiniprogram.Input): void
  onPriceBlur(e: WechatMiniprogram.InputBlur): void
  /** 点了「清空」 */
  onClear(): void
  /** 点了左滑露出的「删除」 */
  onDelete(): void
  onTouchStart(e: WechatMiniprogram.TouchEvent): void
  onTouchEnd(e: WechatMiniprogram.TouchEvent): void
}

Component<{}, Props, Methods, TouchState>({
  properties: {
    name: { type: String, value: '' },
    prev: { type: String, value: '' },
    cost: { type: String, value: '' },
    open: { type: String, value: '' },
    close: { type: String, value: '' },
    high: { type: String, value: '' },
    low: { type: String, value: '' },
    error: { type: String, value: '' },
    showClear: { type: Boolean, value: false },
    revealed: { type: Boolean, value: false },
  },
  lifetimes: {
    attached() {
      this.touchStartX = 0
      this.touchStartY = 0
    },
  },
  methods: {
    onNameInput(e) {
      this.triggerEvent('nameinput', { value: e.detail.value })
    },
    onPriceInput(e) {
      const field = e.currentTarget.dataset.field as string
      if (!(PRICE_FIELDS as readonly string[]).includes(field)) return
      this.triggerEvent('priceinput', { field, value: e.detail.value })
    },
    onPriceBlur(e) {
      const field = e.currentTarget.dataset.field as string
      if (!(PRICE_FIELDS as readonly string[]).includes(field)) return
      this.triggerEvent('priceblur', { field })
    },
    onClear() {
      this.triggerEvent('clear')
    },
    onDelete() {
      this.triggerEvent('delete')
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
      this.triggerEvent('swipe', { direction: dx < 0 ? 'left' : 'right' })
    },
  },
})
