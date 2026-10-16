/// <reference path="./types/index.d.ts" />

interface IAppOption {
  /**
   * 全局共享状态。只放「读多写少、全局唯一」的小对象；
   * 业务数据优先走 services/storage.ts，不要往这里堆。
   */
  globalData: {
    /** 预留：暂无全局状态 */
  }
}
