// app.ts
App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 本项目无后端，启动时不需要任何异步初始化。
    // 将来若引入存储结构迁移，放在这里，并保证幂等。
  },
})
