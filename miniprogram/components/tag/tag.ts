// tag.ts
// 纯展示组件：把 label 和 value 摆成一枚淡底标签，配色由 type 决定，不持有状态、不发事件。
Component({
  properties: {
    /** 说明文字，如「1%=」；留空则整标签只有数值 */
    label: {
      type: String,
      value: '',
    },
    /** 数值文字，如「0.33」；留空则只显示说明（调用方通常用 wx:if 直接不渲染） */
    value: {
      type: String,
      value: '',
    },
    /** 配色：default 灰 / primary 蓝 / success 绿 / warning 橙 / danger 红 */
    type: {
      type: String,
      value: 'default',
    },
  },
})
