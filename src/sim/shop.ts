import type { GameState, Table, Stove } from './types.ts';
import { RECIPES_MAP } from './recipes.ts';

export interface ShopItemConfig {
  id: string;
  category: 'table' | 'stove' | 'staff' | 'recipe';
  name: string;
  desc: string;
  cost: number;
}

export const TABLE_CONFIGS: { level: number; cost: number; name: string }[] = [
  { level: 1, cost: 0, name: '原木单人桌 1 号' },
  { level: 2, cost: 50, name: '原木单人桌 2 号' }, // 3分钟内轻松攒够
  { level: 3, cost: 130, name: '花梨雕花桌 3 号' },
  { level: 4, cost: 280, name: '翡翠软垫桌 4 号' },
];

export const STOVE_CONFIGS: { level: number; cost: number; name: string }[] = [
  { level: 1, cost: 0, name: '青石简易炉 1 号' },
  { level: 2, cost: 60, name: '精炼铁质炉 2 号' },
  { level: 3, cost: 160, name: '黄铜烈火炉 3 号' },
];

export const STAFF_COSTS = {
  greeter: 40,
  handyman: 50,
};

export class ShopManager {
  /**
   * 购买下一张餐桌
   */
  public static buyNextTable(state: GameState): { success: boolean; message: string } {
    const nextLevel = state.tables.length + 1;
    const config = TABLE_CONFIGS.find((c) => c.level === nextLevel);

    if (!config) {
      return { success: false, message: '餐桌已达最大数量' };
    }

    if (state.scales < config.cost) {
      return { success: false, message: `鳞币不足，需要 ${config.cost} 鳞币` };
    }

    state.scales -= config.cost;
    const newTable: Table = {
      id: nextLevel,
      name: config.name,
      customerId: null,
      servedRecipeId: null,
    };
    state.tables.push(newTable);
    state.stars += 5; // 添置新家具增加评价星

    return { success: true, message: `成功添置【${config.name}】！` };
  }

  /**
   * 购买下一口炉灶
   */
  public static buyNextStove(state: GameState): { success: boolean; message: string } {
    const nextLevel = state.stoves.length + 1;
    const config = STOVE_CONFIGS.find((c) => c.level === nextLevel);

    if (!config) {
      return { success: false, message: '炉灶已达最大数量' };
    }

    if (state.scales < config.cost) {
      return { success: false, message: `鳞币不足，需要 ${config.cost} 鳞币` };
    }

    state.scales -= config.cost;
    const newStove: Stove = {
      id: nextLevel,
      name: config.name,
      currentOrder: null,
    };
    state.stoves.push(newStove);
    state.stars += 5;

    return { success: true, message: `成功添置【${config.name}】！` };
  }

  /**
   * 雇佣招客员
   */
  public static hireGreeter(state: GameState): { success: boolean; message: string } {
    if (state.staff.greeter.hired) {
      return { success: false, message: '招客员已在岗' };
    }

    const cost = STAFF_COSTS.greeter;
    if (state.scales < cost) {
      return { success: false, message: `鳞币不足，雇佣招客员需要 ${cost} 鳞币` };
    }

    state.scales -= cost;
    state.staff.greeter.hired = true;
    state.staff.greeter.timer = state.staff.greeter.cooldown;
    state.stars += 8;

    return { success: true, message: '成功雇佣招客员！客流将明显增加。' };
  }

  /**
   * 雇佣打杂工
   */
  public static hireHandyman(state: GameState): { success: boolean; message: string } {
    if (state.staff.handyman.hired) {
      return { success: false, message: '打杂工已在岗' };
    }

    const cost = STAFF_COSTS.handyman;
    if (state.scales < cost) {
      return { success: false, message: `鳞币不足，雇佣打杂工需要 ${cost} 鳞币` };
    }

    state.scales -= cost;
    state.staff.handyman.hired = true;
    state.staff.handyman.timer = state.staff.handyman.interval;
    state.stars += 8;

    return { success: true, message: '成功雇佣打杂工！每60秒将获得一笔保底鳞币。' };
  }

  /**
   * 研习新菜谱
   */
  public static learnRecipe(state: GameState, recipeId: string): { success: boolean; message: string } {
    const recipe = RECIPES_MAP[recipeId];
    if (!recipe) {
      return { success: false, message: '未知菜品' };
    }

    if (state.unlockedRecipeIds.includes(recipeId)) {
      return { success: false, message: '该菜谱已研习' };
    }

    if (state.scales < recipe.learnCost) {
      return { success: false, message: `鳞币不足，研习需要 ${recipe.learnCost} 鳞币` };
    }

    state.scales -= recipe.learnCost;
    state.unlockedRecipeIds.push(recipeId);
    state.stars += 10;

    return { success: true, message: `成功研习【${recipe.name}】！客人点单不再生气！` };
  }

  /**
   * 检查玩家是否能够买下一级餐桌
   */
  public static getNextTableCost(state: GameState): number | null {
    const nextLevel = state.tables.length + 1;
    const config = TABLE_CONFIGS.find((c) => c.level === nextLevel);
    return config ? config.cost : null;
  }

  /**
   * 检查玩家是否能够买下一级炉灶
   */
  public static getNextStoveCost(state: GameState): number | null {
    const nextLevel = state.stoves.length + 1;
    const config = STOVE_CONFIGS.find((c) => c.level === nextLevel);
    return config ? config.cost : null;
  }
}
