// stepper.ts
// 步进器：加减按钮 + 可直接输入的数值框。
// 自身不持有「真值」，改动通过 change 事件抛给父级（受控组件）；text 只是输入过程中的草稿。

type Props = {
  /** 当前值（受控：外部改值时会同步到输入框） */
  value: {
    type: NumberConstructor
    value: number
    observer(newValue: number): void
  }
  /** 下限 */
  min: { type: NumberConstructor; value: number }
  /** 上限 */
  max: { type: NumberConstructor; value: number }
  /** 每次点按钮的步长 */
  step: { type: NumberConstructor; value: number }
}

type Data = {
  /** 输入框里的草稿文本 */
  text: string
}

type Methods = {
  onMinus(): void
  onPlus(): void
  onInput(e: WechatMiniprogram.Input): void
  /** 失焦时规范化草稿：越界夹紧、非法则还原 */
  onBlur(): void
  /** direction: -1 减，1 加 */
  shift(direction: number): void
  /** 按两位小数取整并夹到 [min, max] */
  clamp(raw: number): number
  /** 抛给父级；父级回传新 value 后由 value 的 observer 同步显示 */
  emit(value: number): void
}

/** 解析输入草稿：只接受数字（可带小数、可带负号），非法返回 null */
function parseDraft(text: string): number | null {
  const trimmed = text.trim()
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

/** 显示用：最多两位小数，去掉多余的 0（1.20 → "1.2"，2.00 → "2"） */
function trimNumber(value: number): string {
  return String(Math.round(value * 100) / 100)
}

Component<Data, Props, Methods>({
  properties: {
    value: {
      type: Number,
      value: 0,
      observer(newValue: number) {
        // 外部改值时同步显示；草稿已经代表同一个数就不动，避免打断正在输入的内容
        if (parseDraft(this.data.text) === newValue) return
        this.setData({ text: trimNumber(newValue) })
      },
    },
    min: { type: Number, value: 0 },
    max: { type: Number, value: 99 },
    step: { type: Number, value: 0.1 },
  },
  data: {
    text: '0',
  },
  lifetimes: {
    attached() {
      this.setData({ text: trimNumber(this.data.value) })
    },
  },
  methods: {
    onMinus() {
      this.shift(-1)
    },
    onPlus() {
      this.shift(1)
    },
    onInput(e) {
      const text = e.detail.value
      this.setData({ text })
      const parsed = parseDraft(text)
      if (parsed !== null) {
        this.emit(this.clamp(parsed))
      }
    },
    onBlur() {
      const parsed = parseDraft(this.data.text)
      if (parsed === null) {
        this.setData({ text: trimNumber(this.data.value) })
        return
      }
      const next = this.clamp(parsed)
      this.setData({ text: trimNumber(next) })
      this.emit(next)
    },
    shift(direction) {
      const next = this.clamp(this.data.value + direction * this.data.step)
      if (next !== this.data.value) {
        this.setData({ text: trimNumber(next) })
        this.emit(next)
      }
    },
    clamp(raw) {
      const rounded = Math.round(raw * 100) / 100
      return Math.min(Math.max(rounded, this.data.min), this.data.max)
    },
    emit(value) {
      if (value === this.data.value) return
      this.triggerEvent('change', { value })
    },
  },
})
