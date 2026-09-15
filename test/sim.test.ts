import test from 'node:test';
import assert from 'node:assert';
import { GameSimulation, createInitialState } from '../src/sim/engine.ts';
import { ShopManager } from '../src/sim/shop.ts';
import { OfflineManager, MAX_OFFLINE_SECONDS } from '../src/sim/offline.ts';
import type { GameState } from '../src/sim/types.ts';

test('无UI模拟测试：推进 600 tick（60秒）鳞币单调不减且服务完成数 > 0', () => {
  const sim = new GameSimulation();

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
  // 模拟未雇佣招客员情况（跑 1000 tick 即 100 秒）
  const simNoGreeter = new GameSimulation(undefined, () => 0.5); // 确定性伪随机
  let spawnedNoGreeter = 0;
  for (let i = 0; i < 1000; i++) {
    const beforeCount = simNoGreeter.state.customers.length;
    simNoGreeter.tick(0.1);
    if (simNoGreeter.state.customers.length > beforeCount) {
      spawnedNoGreeter++;
    }
  }

  // 模拟已雇佣招客员情况
  const simWithGreeter = new GameSimulation(undefined, () => 0.5);
  simWithGreeter.state.staff.greeter.hired = true;
  let spawnedWithGreeter = 0;
  for (let i = 0; i < 1000; i++) {
    const beforeCount = simWithGreeter.state.customers.length;
    simWithGreeter.tick(0.1);
    if (simWithGreeter.state.customers.length > beforeCount) {
      spawnedWithGreeter++;
    }
  }

  assert(
    spawnedWithGreeter > spawnedNoGreeter,
    `雇佣招客员单位时间进客 (${spawnedWithGreeter}) 应高于未雇佣 (${spawnedNoGreeter})`
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
  const sim = new GameSimulation();

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

test('数据持久化与一致性测试：存档与重载完全一致', () => {
  const sim = new GameSimulation();

  // 改变部分游戏状态
  sim.state.scales = 128;
  sim.state.stars = 42;
  sim.state.tables.push({ id: 2, name: '原木单人桌 2 号', customerId: null, servedRecipeId: null });
  sim.state.stoves.push({ id: 2, name: '精炼铁质炉 2 号', currentOrder: null });
  sim.state.unlockedRecipeIds.push('prism_clam');
  sim.state.staff.greeter.hired = true;
  sim.state.staff.handyman.hired = true;

  const serialized = JSON.stringify(sim.state);
  const restored = JSON.parse(serialized) as GameState;

  assert.strictEqual(restored.scales, 128);
  assert.strictEqual(restored.stars, 42);
  assert.strictEqual(restored.tables.length, 2);
  assert.strictEqual(restored.stoves.length, 2);
  assert.deepStrictEqual(restored.unlockedRecipeIds, ['seaweed_stick', 'prism_clam']);
  assert.strictEqual(restored.staff.greeter.hired, true);
  assert.strictEqual(restored.staff.handyman.hired, true);
});
