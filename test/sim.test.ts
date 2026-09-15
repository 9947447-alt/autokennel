import { describe, test } from 'node:test';
import assert from 'node:assert';
import { GameSimulation, createInitialState } from '../src/sim/engine.ts';
import { ShopManager } from '../src/sim/shop.ts';
import { OfflineManager, MAX_OFFLINE_SECONDS } from '../src/sim/offline.ts';
import { StorageManager, SAVE_STORAGE_KEY } from '../src/sim/storage.ts';

/** 恒 0.5：点餐 roll < 0.7，始终点已学菜（与招客员对照同一确定性 rng） */
const COMPLETABLE_RNG = () => 0.5;
/** 恒 0.99：点餐 roll >= 0.7，强制点未学菜，气走零入账 */
const ADVERSARIAL_RNG = () => 0.99;

function installMemoryLocalStorage(): void {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: mock,
  });
}

installMemoryLocalStorage();

test('无UI模拟测试：推进 600 tick（60秒）鳞币单调不减且服务完成数 > 0', () => {
  const sim = new GameSimulation(undefined, COMPLETABLE_RNG);

  let prevScales = sim.state.scales;

  // 推进 600 tick，每 tick 为 0.1s (共60秒)
  for (let i = 0; i < 600; i++) {
    sim.tick(0.1);

    // 断言：挂机过程中鳞币单调不减（无任何扣款事件）
    assert(
      sim.state.scales >= prevScales,
      `Tick ${i}: 鳞币减少 (当前 ${sim.state.scales} < 之前 ${prevScales})`
    );
    prevScales = sim.state.scales;
  }

  // 断言：无需任何点击，60秒内至少完成 1 笔完整服务（进门到收银）
  assert(
    sim.state.stats.completedServices > 0,
    `600 tick 内服务完成数应大于 0，实际完成: ${sim.state.stats.completedServices}`
  );

  // 断言：最终获得了鳞币收入
  assert(
    sim.state.scales > 0,
    `600 tick 后鳞币应大于 0，实际为: ${sim.state.scales}`
  );
});

test('对抗种子：恒 0.99 点未学菜气走且零入账', () => {
  const sim = new GameSimulation(undefined, ADVERSARIAL_RNG);

  for (let i = 0; i < 600; i++) {
    sim.tick(0.1);
  }

  assert.strictEqual(
    sim.state.stats.completedServices,
    0,
    '对抗种子不应完单'
  );
  assert.strictEqual(sim.state.scales, 0, '气走不得入账鳞币');
  assert(
    sim.state.stats.unservedAngryCustomers > 0,
    `对抗种子应产生气走，实际: ${sim.state.stats.unservedAngryCustomers}`
  );
});

test('点餐规则测试：点到未学菜谱客人离开且不给钱', () => {
  const sim = new GameSimulation();

  // 初始状态下仅解锁 seaweed_stick（海藻脆脆条）
  assert.deepStrictEqual(sim.state.unlockedRecipeIds, ['seaweed_stick']);

  const initialScales = sim.state.scales;

  // 强制生成一个顾客并使其入座
  const customer = sim.spawnCustomer();
  sim.tick(0.1); // 进门找桌位并坐下

  assert.strictEqual(customer.state, 'SEATED');
  assert.strictEqual(customer.tableId, 1);

  // 强制该客人点未学习的菜品《幻彩荧光贝》
  sim.handleCustomerOrder(customer, 'prism_clam');

  // 断言：客人状态直接变为愤怒离开
  assert.strictEqual(customer.state, 'LEAVING_ANGRY');
  assert.strictEqual(customer.bubbleType, 'angry');

  // 断言：餐桌被立即释放，客人不占座
  assert.strictEqual(customer.tableId, null);
  const table = sim.state.tables.find((t) => t.id === 1);
  assert.strictEqual(table?.customerId, null);

  // 断言：鳞币没有增加，不给钱
  assert.strictEqual(
    sim.state.scales,
    initialScales,
    '客人点未学会的菜离开，不应支付任何鳞币'
  );

  // 断言：统计未服务愤怒顾客数累加
  assert.strictEqual(sim.state.stats.unservedAngryCustomers, 1);
});

test('员工效果测试：雇佣招客员后单位时间进客数高于未雇佣', () => {
  const simNoGreeter = new GameSimulation(undefined, COMPLETABLE_RNG);
  for (let i = 0; i < 1000; i++) {
    simNoGreeter.tick(0.1);
  }

  const simWithGreeter = new GameSimulation(undefined, COMPLETABLE_RNG);
  simWithGreeter.state.staff.greeter.hired = true;
  for (let i = 0; i < 1000; i++) {
    simWithGreeter.tick(0.1);
  }

  assert(
    simWithGreeter.spawnedCustomers > simNoGreeter.spawnedCustomers,
    `雇佣招客员真实生成次数 (${simWithGreeter.spawnedCustomers}) 应高于未雇佣 (${simNoGreeter.spawnedCustomers})`
  );
});

test('打杂工测试：每 60 秒为餐厅入账一笔保底鳞币', () => {
  const sim = new GameSimulation();
  sim.state.staff.handyman.hired = true;
  sim.state.staff.handyman.timer = 60.0;

  // 推进 59 秒（590 tick）
  for (let i = 0; i < 590; i++) {
    sim.tick(0.1);
  }
  const scalesBefore60 = sim.state.scales;

  // 推进最后 1 秒（10 tick，达到60秒）
  for (let i = 0; i < 10; i++) {
    sim.tick(0.1);
  }

  // 断言：由于打杂工触发，鳞币增长包含了保底 35 鳞币
  assert(
    sim.state.scales >= scalesBefore60 + 35,
    `60秒时打杂工应发放35保底鳞币，实际从 ${scalesBefore60} 变为 ${sim.state.scales}`
  );
});

test('离线仓收益与 2 小时硬顶测试', () => {
  const state = createInitialState();
  const now = 1700000000000;

  // 1. 测试离线 3 分钟（180 秒）
  state.lastTimestamp = now - 180 * 1000;
  const result3m = OfflineManager.calculateOfflineYield(state, now);

  assert.strictEqual(result3m.cappedSeconds, 180);
  assert.strictEqual(result3m.wasCapped, false);
  assert(result3m.earnedScales > 0, '离线3分钟应产生大于0的收益');
  assert.strictEqual(state.offlineVault, result3m.earnedScales);

  // 领取离线仓测试
  const claimed = OfflineManager.claimOfflineVault(state);
  assert.strictEqual(claimed, result3m.earnedScales);
  assert.strictEqual(state.scales, claimed);
  assert.strictEqual(state.offlineVault, 0);

  // 2. 测试离线 5 小时（18000 秒，超过 2 小时硬顶）
  state.lastTimestamp = now - 18000 * 1000;
  const result5h = OfflineManager.calculateOfflineYield(state, now);

  assert.strictEqual(result5h.cappedSeconds, MAX_OFFLINE_SECONDS); // 严格封顶在 7200 秒
  assert.strictEqual(result5h.wasCapped, true);

  const rate = OfflineManager.calculateOnlineRatePerSecond(state);
  const expectedMax = Math.floor(rate * MAX_OFFLINE_SECONDS);
  assert(
    state.offlineVault <= expectedMax,
    `离线仓 (${state.offlineVault}) 不应超过 2 小时硬顶 (${expectedMax})`
  );
});

test('经济数值测试：挂机 3 分钟内应能买到第二张桌', () => {
  const sim = new GameSimulation(undefined, COMPLETABLE_RNG);

  // 推进 3 分钟（180 秒 = 1800 tick）
  for (let i = 0; i < 1800; i++) {
    sim.tick(0.1);
  }

  // 断言：3分钟内总收益或者当前鳞币足够买第2张桌（50鳞币）
  assert(
    sim.state.scales >= 50,
    `挂机 3 分钟后鳞币应 >= 50，实际为 ${sim.state.scales}`
  );

  // 验证购买第 2 张桌成功
  const buyRes = ShopManager.buyNextTable(sim.state);
  assert.strictEqual(buyRes.success, true);
  assert.strictEqual(sim.state.tables.length, 2);
});

describe('StorageManager', { concurrency: false }, () => {
  test('saveGame/loadGame 锁桌数菜谱员工鳞币并清空瞬时态', () => {
    StorageManager.clearSave();

    const sim = new GameSimulation(undefined, COMPLETABLE_RNG);
    sim.state.scales = 128;
    sim.state.stars = 42;
    sim.state.tables.push({
      id: 2,
      name: '原木单人桌 2 号',
      customerId: null,
      servedRecipeId: null,
    });
    sim.state.stoves.push({ id: 2, name: '精炼铁质炉 2 号', currentOrder: null });
    sim.state.unlockedRecipeIds.push('prism_clam');
    sim.state.staff.greeter.hired = true;
    sim.state.staff.handyman.hired = true;

    const seated = sim.spawnCustomer();
    sim.tick(0.1);
    sim.handleCustomerOrder(seated);
    assert.ok(sim.state.customers.length > 0, '存档前应有在场客人');
    assert.ok(
      sim.state.kitchenQueue.length > 0,
      '存档前应有厨房队列订单'
    );
    assert.ok(
      sim.state.tables.some((t) => t.customerId !== null),
      '存档前应有占桌客人'
    );

    assert.strictEqual(StorageManager.saveGame(sim.state), true);
    assert.ok(localStorage.getItem(SAVE_STORAGE_KEY), 'saveGame 必须写入 localStorage');

    const loaded = StorageManager.loadGame();
    const restored = loaded.state;

    assert.strictEqual(restored.scales, 128);
    assert.strictEqual(restored.tables.length, 2);
    assert.deepStrictEqual(restored.unlockedRecipeIds, ['seaweed_stick', 'prism_clam']);
    assert.strictEqual(restored.staff.greeter.hired, true);
    assert.strictEqual(restored.staff.handyman.hired, true);

    assert.deepStrictEqual(restored.customers, []);
    assert.deepStrictEqual(restored.kitchenQueue, []);
    for (const table of restored.tables) {
      assert.strictEqual(table.customerId, null);
      assert.strictEqual(table.servedRecipeId, null);
    }
    for (const stove of restored.stoves) {
      assert.strictEqual(stove.currentOrder, null);
    }
  });

  test('同一 lastTimestamp 连 load 不双倍仓且不破顶', () => {
    StorageManager.clearSave();

    const state = createInitialState();
    state.scales = 128;
    state.unlockedRecipeIds.push('prism_clam');
    state.staff.greeter.hired = true;
    state.staff.handyman.hired = true;
    state.tables.push({
      id: 2,
      name: '原木单人桌 2 号',
      customerId: 'cust_dirty',
      servedRecipeId: 'seaweed_stick',
    });
    state.stoves.push({
      id: 2,
      name: '精炼铁质炉 2 号',
      currentOrder: {
        id: 'ord_dirty',
        tableId: 2,
        customerId: 'cust_dirty',
        recipeId: 'prism_clam',
        totalCookTime: 5,
        remainingCookTime: 2,
      },
    });
    state.customers.push({
      id: 'cust_dirty',
      species: '栗毛松鼠',
      avatar: '🌰',
      state: 'WAITING_FOOD',
      tableId: 2,
      targetRecipeId: 'prism_clam',
      stateTimer: 1,
    });
    state.kitchenQueue.push({
      id: 'ord_queued',
      tableId: 1,
      customerId: 'cust_queued',
      recipeId: 'seaweed_stick',
      totalCookTime: 3,
      remainingCookTime: 1,
    });

    const t0 = 1_700_000_000_000;
    let now = t0;
    const originalNow = Date.now;
    Date.now = () => now;

    try {
      assert.strictEqual(StorageManager.saveGame(state), true);

      now = t0 + 5 * 60 * 60 * 1000;

      const first = StorageManager.loadGame();
      const rate = OfflineManager.calculateOnlineRatePerSecond(first.state);
      const cap = rate * MAX_OFFLINE_SECONDS;

      assert.strictEqual(first.offlineResult?.wasCapped, true);
      assert.ok(first.state.offlineVault > 0, '5 小时离线应写入离线仓');
      assert(
        first.state.offlineVault <= cap,
        `离线仓 (${first.state.offlineVault}) 应 <= rate * 7200 (${cap})`
      );
      assert.deepStrictEqual(first.state.customers, []);
      assert.deepStrictEqual(first.state.kitchenQueue, []);
      for (const table of first.state.tables) {
        assert.strictEqual(table.customerId, null);
        assert.strictEqual(table.servedRecipeId, null);
      }
      for (const stove of first.state.stoves) {
        assert.strictEqual(stove.currentOrder, null);
      }

      const vaultAfterFirst = first.state.offlineVault;
      const second = StorageManager.loadGame();
      assert.strictEqual(
        second.state.offlineVault,
        vaultAfterFirst,
        '同一 lastTimestamp 连 load 不得双倍离线仓'
      );
      assert(second.state.offlineVault <= cap);

      assert.strictEqual(StorageManager.saveGame(first.state), true);
      const third = StorageManager.loadGame();
      assert.strictEqual(
        third.state.offlineVault,
        vaultAfterFirst,
        'load 后立刻再 save/load 不得再叠加离线仓'
      );
      assert(third.state.offlineVault <= cap);
    } finally {
      Date.now = originalNow;
    }
  });
});
