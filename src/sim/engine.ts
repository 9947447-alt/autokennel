import type {
  Customer,
  GameState,
  KitchenOrder,
  Table,
  Stove,
} from './types.ts';
import { ALL_RECIPES, RECIPES_MAP } from './recipes.ts';

export const SPECIES_LIST = [
  { species: '栗毛松鼠', avatar: '🌰' },
  { species: '胖鳍海獭', avatar: '🦦' },
  { species: '苔藓小兔', avatar: '🐇' },
  { species: '波波水母', avatar: '🪼' },
  { species: '星纹花栗', avatar: '🐿️' },
  { species: '绒耳小鹿', avatar: '🦌' },
  { species: '蓬蓬小熊', avatar: '🐻' },
];

export function createInitialState(): GameState {
  const initialTable: Table = {
    id: 1,
    name: '原木单人桌 1 号',
    customerId: null,
    servedRecipeId: null,
  };

  const initialStove: Stove = {
    id: 1,
    name: '青石简易炉 1 号',
    currentOrder: null,
  };

  return {
    scales: 0,
    stars: 5,
    tables: [initialTable],
    stoves: [initialStove],
    unlockedRecipeIds: ['seaweed_stick'], // 初始仅解锁海藻脆脆条
    staff: {
      greeter: {
        hired: false,
        cooldown: 8.0, // 8秒招揽一次
        timer: 8.0,
      },
      handyman: {
        hired: false,
        interval: 60.0, // 每60秒加一笔
        timer: 60.0,
        payout: 35, // 保底35鳞币
      },
    },
    customers: [],
    kitchenQueue: [],
    offlineVault: 0,
    stats: {
      completedServices: 0,
      unservedAngryCustomers: 0,
      totalEarned: 0,
      elapsedSeconds: 0,
    },
    lastTimestamp: Date.now(),
  };
}

export class GameSimulation {
  public state: GameState;
  private naturalArrivalTimer: number = 2.0; // 首次2秒后快速进店
  private customerSeq: number = 1;
  private orderSeq: number = 1;

  // 依赖注入随机函数，便于测试中设定种子或确定性测试
  public rng: () => number;

  constructor(initialState?: GameState, rng: () => number = Math.random) {
    this.state = initialState ? JSON.parse(JSON.stringify(initialState)) : createInitialState();
    this.rng = rng;
  }

  /**
   * 固定步长推进模拟（默认 0.1s 即 100ms）
   */
  public tick(dt: number = 0.1): void {
    this.state.stats.elapsedSeconds += dt;
    this.state.lastTimestamp = Date.now();

    // 1. 推进员工逻辑
    this.updateStaff(dt);

    // 2. 推进自然进客逻辑
    this.updateNaturalArrival(dt);

    // 3. 推进顾客状态机
    this.updateCustomers(dt);

    // 4. 推进炉灶厨房队列
    this.updateKitchen(dt);
  }

  /**
   * 员工推进
   */
  private updateStaff(dt: number): void {
    const { greeter, handyman } = this.state.staff;

    // 招客员：冷却结束向客流加 1 人
    if (greeter.hired) {
      greeter.timer -= dt;
      if (greeter.timer <= 0) {
        greeter.timer = greeter.cooldown;
        this.spawnCustomer('greeter');
      }
    }

    // 打杂工：每 60 秒加一笔保底鳞币
    if (handyman.hired) {
      handyman.timer -= dt;
      if (handyman.timer <= 0) {
        handyman.timer = handyman.interval;
        this.state.scales += handyman.payout;
        this.state.stats.totalEarned += handyman.payout;
      }
    }
  }

  /**
   * 自然客流生成
   */
  private updateNaturalArrival(dt: number): void {
    this.naturalArrivalTimer -= dt;
    if (this.naturalArrivalTimer <= 0) {
      // 自然进客周期 5.5 ~ 7.5 秒浮动
      this.naturalArrivalTimer = 5.5 + this.rng() * 2.0;
      this.spawnCustomer('natural');
    }
  }

  /**
   * 生成新顾客加入进店队列
   */
  public spawnCustomer(source: 'natural' | 'greeter' = 'natural'): Customer {
    const speciesInfo = SPECIES_LIST[Math.floor(this.rng() * SPECIES_LIST.length)];
    const customer: Customer = {
      id: `cust_${this.customerSeq++}`,
      species: speciesInfo.species,
      avatar: speciesInfo.avatar,
      state: 'WALKING_IN',
      tableId: null,
      targetRecipeId: null,
      stateTimer: 2.5, // 进门寻座等待时间
      bubbleText: source === 'greeter' ? '被招客员吸引来啦~' : '闻到香味进来了~',
      bubbleType: 'normal',
    };

    this.state.customers.push(customer);
    return customer;
  }

  /**
   * 推进所有顾客
   */
  private updateCustomers(dt: number): void {
    const toRemove: string[] = [];

    for (const customer of this.state.customers) {
      switch (customer.state) {
        case 'WALKING_IN': {
          // 寻找空闲餐桌
          const emptyTable = this.state.tables.find((t) => t.customerId === null);
          if (emptyTable) {
            emptyTable.customerId = customer.id;
            customer.tableId = emptyTable.id;
            customer.state = 'SEATED';
            customer.stateTimer = 1.0; // 选菜思考 1.0 秒
            customer.bubbleText = '正在看菜单...';
            customer.bubbleType = 'normal';
          } else {
            // 没有空桌，等待或离开
            customer.stateTimer -= dt;
            if (customer.stateTimer <= 0) {
              customer.state = 'LEAVING_SATISFIED';
              customer.stateTimer = 1.0;
              customer.bubbleText = '没有空位了，下次再来~';
              customer.bubbleType = 'normal';
            }
          }
          break;
        }

        case 'SEATED': {
          customer.stateTimer -= dt;
          if (customer.stateTimer <= 0) {
            // 顾客决定点哪道菜
            this.handleCustomerOrder(customer);
          }
          break;
        }

        case 'ORDERING': {
          // ORDERING 状态瞬间决策转为 WAITING_FOOD 或 LEAVING_ANGRY
          break;
        }

        case 'WAITING_FOOD': {
          // 等待上餐中，状态由厨房出餐驱动
          break;
        }

        case 'EATING': {
          customer.stateTimer -= dt;
          if (customer.stateTimer <= 0) {
            // 就餐完毕，结账离开
            this.handleCustomerCheckout(customer);
          }
          break;
        }

        case 'LEAVING_SATISFIED':
        case 'LEAVING_ANGRY': {
          customer.stateTimer -= dt;
          if (customer.stateTimer <= 0) {
            toRemove.push(customer.id);
          }
          break;
        }
      }
    }

    if (toRemove.length > 0) {
      this.state.customers = this.state.customers.filter((c) => !toRemove.includes(c.id));
    }
  }

  /**
   * 顾客点餐逻辑
   * 核心要求：“未学的菜被点到时客人离开，不给钱”
   */
  public handleCustomerOrder(customer: Customer, forcedRecipeId?: string): void {
    let chosenRecipeId: string;

    if (forcedRecipeId) {
      chosenRecipeId = forcedRecipeId;
    } else {
      // 如果只有基础菜，首单大概率点基础菜，以确保新手开局平滑；同时有概率点到其他未解锁菜
      const allRecipes = ALL_RECIPES;
      const roll = this.rng();

      // 70% 概率倾向选择当前已解锁菜品，30% 概率随机点到未学菜品
      const unlocked = allRecipes.filter((r) => this.state.unlockedRecipeIds.includes(r.id));
      const locked = allRecipes.filter((r) => !this.state.unlockedRecipeIds.includes(r.id));

      if (locked.length === 0 || roll < 0.7) {
        chosenRecipeId = unlocked[Math.floor(this.rng() * unlocked.length)].id;
      } else {
        chosenRecipeId = locked[Math.floor(this.rng() * locked.length)].id;
      }
    }

    customer.targetRecipeId = chosenRecipeId;
    const recipe = RECIPES_MAP[chosenRecipeId];

    // 判断是否已研习
    const isLearned = this.state.unlockedRecipeIds.includes(chosenRecipeId);

    if (!isLearned) {
      // 验收标准：“未学的菜被点到时客人离开，不给钱”
      customer.state = 'LEAVING_ANGRY';
      customer.stateTimer = 2.0;
      customer.bubbleText = `想吃【${recipe?.name || '未知菜品'}】，老板竟然还没学会？！气走！`;
      customer.bubbleType = 'angry';

      // 立即释放桌位，不留分文
      if (customer.tableId !== null) {
        const table = this.state.tables.find((t) => t.id === customer.tableId);
        if (table) {
          table.customerId = null;
          table.servedRecipeId = null;
        }
        customer.tableId = null;
      }

      this.state.stats.unservedAngryCustomers++;
      return;
    }

    // 已研习：正常点单成功，加入厨房烹饪队列
    customer.state = 'WAITING_FOOD';
    customer.bubbleText = `点了一份【${recipe.name}】${recipe.icon}！`;
    customer.bubbleType = 'normal';

    const order: KitchenOrder = {
      id: `ord_${this.orderSeq++}`,
      tableId: customer.tableId!,
      customerId: customer.id,
      recipeId: recipe.id,
      totalCookTime: recipe.cookTime,
      remainingCookTime: recipe.cookTime,
    };

    this.state.kitchenQueue.push(order);
  }

  /**
   * 厨房灶台推进
   */
  private updateKitchen(dt: number): void {
    for (const stove of this.state.stoves) {
      // 炉灶空闲且队列有待烹饪菜品
      if (stove.currentOrder === null && this.state.kitchenQueue.length > 0) {
        stove.currentOrder = this.state.kitchenQueue.shift()!;
      }

      // 炉灶正在烹饪
      if (stove.currentOrder !== null) {
        stove.currentOrder.remainingCookTime -= dt;
        if (stove.currentOrder.remainingCookTime <= 0) {
          // 烹饪完成，出餐送往餐桌
          this.deliverDish(stove.currentOrder);
          stove.currentOrder = null;
        }
      }
    }
  }

  /**
   * 上菜至顾客餐桌
   */
  private deliverDish(order: KitchenOrder): void {
    const table = this.state.tables.find((t) => t.id === order.tableId);
    if (!table) return;

    table.servedRecipeId = order.recipeId;

    const customer = this.state.customers.find((c) => c.id === order.customerId);
    if (customer && customer.state === 'WAITING_FOOD') {
      customer.state = 'EATING';
      customer.stateTimer = 2.5; // 就餐耗时 2.5 秒
      const recipe = RECIPES_MAP[order.recipeId];
      customer.bubbleText = `品尝【${recipe.name}】中，香喷喷！😋`;
      customer.bubbleType = 'happy';
    }
  }

  /**
   * 顾客结账付钱
   */
  private handleCustomerCheckout(customer: Customer): void {
    if (!customer.targetRecipeId) return;

    const recipe = RECIPES_MAP[customer.targetRecipeId];
    const earnings = recipe ? recipe.price : 10;

    // 结账加钱
    this.state.scales += earnings;
    this.state.stars += 1;
    this.state.stats.completedServices++;
    this.state.stats.totalEarned += earnings;

    // 释放餐桌
    if (customer.tableId !== null) {
      const table = this.state.tables.find((t) => t.id === customer.tableId);
      if (table) {
        table.customerId = null;
        table.servedRecipeId = null;
      }
      customer.tableId = null;
    }

    customer.state = 'LEAVING_SATISFIED';
    customer.stateTimer = 1.5;
    customer.bubbleText = `太好吃了！付账 +${earnings} 鳞币 🪙，给好评！`;
    customer.bubbleType = 'happy';
  }
}
