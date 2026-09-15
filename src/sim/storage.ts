import type { GameState } from './types.ts';
import { createInitialState } from './engine.ts';
import { OfflineManager, type OfflineCalcResult } from './offline.ts';

export const SAVE_STORAGE_KEY = 'autokennel_mvp0_savedata_v1';

export class StorageManager {
  /**
   * 保存游戏状态至本地存储
   */
  public static saveGame(state: GameState): boolean {
    if (typeof localStorage === 'undefined') {
      return false;
    }

    try {
      state.lastTimestamp = Date.now();
      const serialized = JSON.stringify(state);
      localStorage.setItem(SAVE_STORAGE_KEY, serialized);
      return true;
    } catch (err) {
      console.error('Failed to save game state:', err);
      return false;
    }
  }

  /**
   * 从本地存储加载游戏状态，并自动结算离线仓
   */
  public static loadGame(): { state: GameState; offlineResult: OfflineCalcResult | null } {
    if (typeof localStorage === 'undefined') {
      const state = createInitialState();
      return { state, offlineResult: null };
    }

    try {
      const raw = localStorage.getItem(SAVE_STORAGE_KEY);
      if (!raw) {
        const state = createInitialState();
        return { state, offlineResult: null };
      }

      const parsed = JSON.parse(raw) as GameState;

      // 健壮性校验
      if (
        typeof parsed.scales !== 'number' ||
        !Array.isArray(parsed.tables) ||
        !Array.isArray(parsed.stoves) ||
        !Array.isArray(parsed.unlockedRecipeIds)
      ) {
        console.warn('Corrupted save data, falling back to initial state.');
        return { state: createInitialState(), offlineResult: null };
      }

      // 顾客与厨房瞬时订单清理（重新上线时干净恢复大厅，避免挂起脏状态）
      parsed.customers = [];
      parsed.kitchenQueue = [];
      for (const table of parsed.tables) {
        table.customerId = null;
        table.servedRecipeId = null;
      }
      for (const stove of parsed.stoves) {
        stove.currentOrder = null;
      }

      // 计算离线收益并累入离线仓
      const offlineResult = OfflineManager.calculateOfflineYield(parsed, Date.now());

      return { state: parsed, offlineResult };
    } catch (err) {
      console.error('Failed to load save data:', err);
      return { state: createInitialState(), offlineResult: null };
    }
  }

  /**
   * 清除存档（重置）
   */
  public static clearSave(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SAVE_STORAGE_KEY);
    }
  }
}
