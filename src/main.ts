import { GameSimulation } from './sim/engine.ts';
import { StorageManager } from './sim/storage.ts';
import { UIRenderer } from './ui/render.ts';

function bootstrap(): void {
  const appElement = document.getElementById('app');
  if (!appElement) {
    throw new Error('Root #app element not found');
  }

  // 1. 从本地存储恢复存档并计算离线仓收益
  const { state: initialLoadedState, offlineResult } = StorageManager.loadGame();
  const sim = new GameSimulation(initialLoadedState);

  // 2. 初始化 UI 渲染器
  const ui = new UIRenderer(appElement, () => {
    StorageManager.saveGame(sim.state);
  });

  // 如果有离线仓收益，展示欢迎领取弹窗
  if (offlineResult && offlineResult.earnedScales > 0) {
    ui.showOfflineModal(offlineResult);
  }

  // 3. 初始首屏渲染
  ui.render(sim.state);

  // 4. 启动 100ms 固定步长自动主循环
  const TICK_DT = 0.1; // 100ms = 0.1秒
  setInterval(() => {
    sim.tick(TICK_DT);
    ui.render(sim.state);
  }, 100);

  // 5. 定期（每 2 秒）与页面离开时自动存档
  setInterval(() => {
    StorageManager.saveGame(sim.state);
  }, 2000);

  window.addEventListener('beforeunload', () => {
    StorageManager.saveGame(sim.state);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      StorageManager.saveGame(sim.state);
    }
  });
}

// 页面加载就绪后启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
