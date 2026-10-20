// app.ts
import { migrateLegacyPrices } from './services/companies'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 本项目无后端，启动时只做存储结构迁移。
    // 旧版本把三个价直接存在 last-* 里，升级后收进公司表；迁移本身是幂等的。
    migrateLegacyPrices()
  },
})
