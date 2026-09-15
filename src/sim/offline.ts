import type { GameState } from './types.ts';
import { RECIPES_MAP } from './recipes.ts';

export const MAX_OFFLINE_SECONDS = 7200; // 2小时硬顶（7200秒）

export interface OfflineCalcResult {
  offlineSeconds: number;
  cappedSeconds: number;
  earnedScales: number;
  wasCapped: boolean;
  handymanEarnings: number;
  diningEarnings: number;
}

export class OfflineManager {
  /**
   * 计算当前配置下的每秒期望鳞币收益率（等价在线收益率）
   */
  public static calculateOnlineRatePerSecond(state: GameState): number {
    const numTables = state.tables.length;
    const numStoves = state.stoves.length;

    // 1. 已学菜谱平均售价
    const unlockedRecipes = state.unlockedRecipeIds
      .map((id) => RECIPES_MAP[id])
      .filter(Boolean);

    const avgPrice =
      unlockedRecipes.length > 0
        ? unlockedRecipes.reduce((sum, r) => sum + r.price, 0) / unlockedRecipes.length
        : 12;

    const avgCookTime =
      unlockedRecipes.length > 0
        ? unlockedRecipes.reduce((sum, r) => sum + r.cookTime, 0) / unlockedRecipes.length
        : 3.5;

    // 2. 餐位与厨房通量瓶颈
    const cyclePerSeat = avgCookTime + 2.5 + 1.0; // 烹饪+就餐+选座思考
    const seatCapacityRate = numTables / cyclePerSeat; // 餐位每秒可容纳周转
    const kitchenCapacityRate = numStoves / avgCookTime; // 炉灶每秒出餐能力
    const hallMaxRate = Math.min(seatCapacityRate, kitchenCapacityRate);

    // 3. 客流到达率
    const naturalArrivalRate = 1.0 / 6.5; // 自然进客约6.5秒一人
    const greeterArrivalRate = state.staff.greeter.hired
      ? 1.0 / state.staff.greeter.cooldown
      : 0;
    const totalArrivalRate = naturalArrivalRate + greeterArrivalRate;

    // 4. 点餐成功率（点到已学菜的期望概率，已学菜品占全菜谱比重或倾向系数）
    const unlockedRatio = state.unlockedRecipeIds.length / 4;
    const orderSuccessRate = Math.min(1.0, 0.7 + 0.3 * unlockedRatio);

    // 5. 餐饮综合每秒收益率
    const diningThroughput = Math.min(totalArrivalRate, hallMaxRate);
    const diningRate = diningThroughput * orderSuccessRate * avgPrice;

    // 6. 打杂工每秒保底贡献
    const handymanRate = state.staff.handyman.hired
      ? state.staff.handyman.payout / state.staff.handyman.interval
      : 0;

    return Math.max(0.1, diningRate + handymanRate);
  }

  /**
   * 根据离线时间戳计算离线收益并累入离线仓
   */
  public static calculateOfflineYield(
    state: GameState,
    currentTime: number = Date.now()
  ): OfflineCalcResult {
    const elapsedSeconds = Math.max(0, Math.floor((currentTime - state.lastTimestamp) / 1000));

    // 硬顶限制：最多等价 2 小时（7200 秒）
    const cappedSeconds = Math.min(elapsedSeconds, MAX_OFFLINE_SECONDS);
    const wasCapped = elapsedSeconds > MAX_OFFLINE_SECONDS;

    // 离线时间极短（如常规刷新 < 3 秒）则忽略弹窗
    if (cappedSeconds < 3) {
      return {
        offlineSeconds: elapsedSeconds,
        cappedSeconds: 0,
        earnedScales: 0,
        wasCapped,
        handymanEarnings: 0,
        diningEarnings: 0,
      };
    }

    const ratePerSecond = this.calculateOnlineRatePerSecond(state);
    const earnedScales = Math.floor(ratePerSecond * cappedSeconds);

    // 离线仓最大容量（2小时硬顶容量）
    const maxVaultCapacity = Math.floor(ratePerSecond * MAX_OFFLINE_SECONDS);

    // 累入离线仓，且总未领仓储亦不得突破2小时硬顶
    state.offlineVault = Math.min(maxVaultCapacity, state.offlineVault + earnedScales);

    // 更新时间戳
    state.lastTimestamp = currentTime;

    return {
      offlineSeconds: elapsedSeconds,
      cappedSeconds,
      earnedScales,
      wasCapped,
      handymanEarnings: state.staff.handyman.hired
        ? Math.floor((state.staff.handyman.payout / state.staff.handyman.interval) * cappedSeconds)
        : 0,
      diningEarnings: Math.max(0, earnedScales),
    };
  }

  /**
   * 领取离线仓暂存收益
   */
  public static claimOfflineVault(state: GameState): number {
    const amount = state.offlineVault;
    if (amount > 0) {
      state.scales += amount;
      state.stats.totalEarned += amount;
      state.offlineVault = 0;
    }
    return amount;
  }
}
