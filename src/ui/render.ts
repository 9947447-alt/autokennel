import type { GameState } from '../sim/types.ts';
import { RECIPES_MAP, ALL_RECIPES } from '../sim/recipes.ts';
import { ShopManager, TABLE_CONFIGS, STOVE_CONFIGS, STAFF_COSTS } from '../sim/shop.ts';
import { OfflineManager, type OfflineCalcResult } from '../sim/offline.ts';

export type ShopTab = 'facility' | 'recipe' | 'staff';

export class UIRenderer {
  private container: HTMLElement;
  private currentTab: ShopTab = 'facility';
  private offlineModalVisible: boolean = false;
  private offlineData: OfflineCalcResult | null = null;
  private onStateChange: () => void;

  constructor(container: HTMLElement, onStateChange: () => void) {
    this.container = container;
    this.onStateChange = onStateChange;
  }

  public showOfflineModal(result: OfflineCalcResult): void {
    if (result.earnedScales > 0) {
      this.offlineModalVisible = true;
      this.offlineData = result;
    }
  }

  public render(state: GameState): void {
    const nextTableCost = ShopManager.getNextTableCost(state);
    const nextStoveCost = ShopManager.getNextStoveCost(state);

    this.container.innerHTML = `
      <!-- 顶部资源条 -->
      <header class="resource-bar">
        <div class="brand-section">
          <div class="brand-title">🐟 鳞鳞小馆</div>
          <div class="running-badge">
            <span class="running-dot"></span>
            自动运转中
          </div>
        </div>
        <div class="metrics-section">
          <div class="metric-pill scales" title="鳞币（主货币）">
            🪙 <span>${state.scales}</span> 鳞币
          </div>
          <div class="metric-pill stars" title="餐厅评价星">
            ⭐ <span>${state.stars}</span> 星
          </div>
          ${
            state.offlineVault > 0
              ? `<button id="btn-claim-vault-bar" class="metric-pill vault-btn" title="点击领取离线仓收入">
                  📦 离线仓: +${state.offlineVault} 🪙
                 </button>`
              : ''
          }
        </div>
      </header>

      <!-- 餐厅大厅 -->
      <main class="hall-container">
        <!-- 员工在岗展示栏 -->
        <section class="staff-row">
          <!-- 招客员 -->
          <div class="staff-card ${state.staff.greeter.hired ? '' : 'unhired'}">
            <div class="staff-icon-wrap">🪧</div>
            <div class="staff-details">
              <div class="staff-name">
                <span>招客员</span>
                <span>${state.staff.greeter.hired ? '在岗招客' : '未雇佣'}</span>
              </div>
              <div class="staff-sub">
                ${
                  state.staff.greeter.hired
                    ? `下次招客: ${state.staff.greeter.timer.toFixed(1)}s`
                    : '招揽路过客人，提升进店频率'
                }
              </div>
              ${
                state.staff.greeter.hired
                  ? `<div class="progress-bar-bg">
                      <div class="progress-bar-fill" style="width: ${Math.max(
                        0,
                        Math.min(
                          100,
                          ((state.staff.greeter.cooldown - state.staff.greeter.timer) /
                            state.staff.greeter.cooldown) *
                            100
                        )
                      )}%"></div>
                    </div>`
                  : ''
              }
            </div>
          </div>

          <!-- 打杂工 -->
          <div class="staff-card ${state.staff.handyman.hired ? '' : 'unhired'}">
            <div class="staff-icon-wrap">🧹</div>
            <div class="staff-details">
              <div class="staff-name">
                <span>打杂工</span>
                <span>${state.staff.handyman.hired ? '勤勉工作中' : '未雇佣'}</span>
              </div>
              <div class="staff-sub">
                ${
                  state.staff.handyman.hired
                    ? `保底收益: ${Math.ceil(state.staff.handyman.timer)}s (+35🪙)`
                    : '每 60 秒为餐厅自动入账保底鳞币'
                }
              </div>
              ${
                state.staff.handyman.hired
                  ? `<div class="progress-bar-bg">
                      <div class="progress-bar-fill" style="width: ${Math.max(
                        0,
                        Math.min(
                          100,
                          ((state.staff.handyman.interval - state.staff.handyman.timer) /
                            state.staff.handyman.interval) *
                            100
                        )
                      )}%"></div>
                    </div>`
                  : ''
              }
            </div>
          </div>
        </section>

        <!-- 餐厅主场坪：就餐大厅与厨房 -->
        <section class="main-floor">
          <!-- 就餐大厅 -->
          <div class="dining-section">
            <div class="section-header">
              <span>就餐区 (${state.tables.length} 张桌位)</span>
              <span>完单: ${state.stats.completedServices} | 气走: ${state.stats.unservedAngryCustomers}</span>
            </div>
            <div class="tables-grid">
              ${state.tables
                .map((table) => {
                  const customer = state.customers.find((c) => c.id === table.customerId);
                  const isOccupied = customer !== undefined;
                  const servedRecipe = table.servedRecipeId ? RECIPES_MAP[table.servedRecipeId] : null;

                  return `
                    <div class="table-slot ${isOccupied ? 'occupied' : ''}">
                      <span class="table-number">#0${table.id}</span>
                      ${
                        isOccupied && customer
                          ? `
                            ${
                              customer.bubbleText
                                ? `<div class="thought-bubble ${customer.bubbleType || ''}">
                                    ${customer.bubbleText}
                                   </div>`
                                : ''
                            }
                            <div class="customer-avatar">${customer.avatar}</div>
                            <div class="customer-species">${customer.species}</div>
                            ${
                              servedRecipe
                                ? `<div style="font-size: 0.72rem; color: #137333; margin-top:2px;">
                                    ${servedRecipe.icon} ${servedRecipe.name}
                                   </div>`
                                : ''
                            }
                          `
                          : `
                            <div class="empty-seat-placeholder">🪑</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">等待入座...</div>
                          `
                      }
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>

          <!-- 厨房烹饪区 -->
          <div class="kitchen-section">
            <div class="section-header">
              <span>厨房炉灶 (${state.stoves.length} 口)</span>
              <span>排单: ${state.kitchenQueue.length}</span>
            </div>
            <div class="stoves-list">
              ${state.stoves
                .map((stove) => {
                  const order = stove.currentOrder;
                  const isCooking = order !== null;
                  const recipe = order ? RECIPES_MAP[order.recipeId] : null;

                  return `
                    <div class="stove-card">
                      <div class="stove-icon">${isCooking ? '🔥' : '🍳'}</div>
                      <div class="stove-info">
                        <div class="stove-title">
                          <span>${stove.name}</span>
                          <span>${isCooking ? '烹饪中' : '空闲'}</span>
                        </div>
                        ${
                          isCooking && order && recipe
                            ? `
                              <div class="stove-dish-tag">${recipe.icon} ${recipe.name} (${order.remainingCookTime.toFixed(1)}s)</div>
                              <div class="progress-bar-bg">
                                <div class="progress-bar-fill" style="width: ${Math.max(
                                  0,
                                  Math.min(
                                    100,
                                    ((order.totalCookTime - order.remainingCookTime) /
                                      order.totalCookTime) *
                                      100
                                  )
                                )}%"></div>
                              </div>
                            `
                            : `<div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">炉温适宜，随时下锅</div>`
                        }
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          </div>
        </section>
      </main>

      <!-- 底部商店 -->
      <footer class="shop-container">
        <div class="shop-header">
          <div class="shop-title">🏪 掌柜后勤商店</div>
          <div class="shop-notice">💡 全自动经营：只在此处添置设施、研习菜品与雇员</div>
        </div>

        <nav class="shop-tabs">
          <button class="shop-tab-btn ${this.currentTab === 'facility' ? 'active' : ''}" data-tab="facility">
            设施添置
          </button>
          <button class="shop-tab-btn ${this.currentTab === 'recipe' ? 'active' : ''}" data-tab="recipe">
            菜谱研习
          </button>
          <button class="shop-tab-btn ${this.currentTab === 'staff' ? 'active' : ''}" data-tab="staff">
            员工招募
          </button>
        </nav>

        <div class="shop-grid">
          ${this.renderShopContent(state, nextTableCost, nextStoveCost)}
        </div>
      </footer>

      <!-- 离线仓结算模态框 -->
      ${
        this.offlineModalVisible && state.offlineVault > 0
          ? `
            <div class="modal-overlay">
              <div class="modal-content">
                <div class="modal-icon">🎁</div>
                <div class="modal-title">欢迎掌柜回归小馆！</div>
                <div class="modal-desc">
                  离线期间（约 ${
                    this.offlineData
                      ? Math.max(1, Math.round(this.offlineData.offlineSeconds / 60))
                      : 1
                  } 分钟）餐厅全自动化运转，离线仓已为您暂存收益（容量硬顶：等价 2 小时在线）：
                </div>
                <div class="modal-amount">+${state.offlineVault} 🪙 鳞币</div>
                <button id="btn-claim-vault-modal" class="modal-claim-btn">
                  一键收完放入钱袋
                </button>
              </div>
            </div>
          `
          : ''
      }
    `;

    this.bindEvents(state);
  }

  private renderShopContent(
    state: GameState,
    nextTableCost: number | null,
    nextStoveCost: number | null
  ): string {
    if (this.currentTab === 'facility') {
      return `
        <!-- 餐桌 -->
        <div class="shop-card">
          <div class="shop-card-info">
            <div class="shop-card-title">
              <span>🪑 餐桌添置</span>
              <span>${state.tables.length} / ${TABLE_CONFIGS.length}</span>
            </div>
            <div class="shop-card-desc">增加接客餐位，使更多客人能同时入座点餐用餐。</div>
          </div>
          ${
            nextTableCost !== null
              ? `<button id="btn-buy-table" class="shop-buy-btn" ${
                  state.scales < nextTableCost ? 'disabled' : ''
                }>
                  添置第 ${state.tables.length + 1} 张桌 (${nextTableCost} 🪙)
                </button>`
              : `<button class="shop-buy-btn bought" disabled>桌位已全满</button>`
          }
        </div>

        <!-- 炉灶 -->
        <div class="shop-card">
          <div class="shop-card-info">
            <div class="shop-card-title">
              <span>🍳 炉灶添置</span>
              <span>${state.stoves.length} / ${STOVE_CONFIGS.length}</span>
            </div>
            <div class="shop-card-desc">增加厨房灶台，提高同时出餐烹饪速度，消除等待瓶颈。</div>
          </div>
          ${
            nextStoveCost !== null
              ? `<button id="btn-buy-stove" class="shop-buy-btn" ${
                  state.scales < nextStoveCost ? 'disabled' : ''
                }>
                  添置第 ${state.stoves.length + 1} 口炉 (${nextStoveCost} 🪙)
                </button>`
              : `<button class="shop-buy-btn bought" disabled>炉灶已全满</button>`
          }
        </div>
      `;
    }

    if (this.currentTab === 'recipe') {
      return ALL_RECIPES.map((recipe) => {
        const isUnlocked = state.unlockedRecipeIds.includes(recipe.id);
        const canAfford = state.scales >= recipe.learnCost;

        return `
          <div class="shop-card">
            <div class="shop-card-info">
              <div class="shop-card-title">
                <span>${recipe.icon} ${recipe.name}</span>
                <span style="color: #b36b00;">+${recipe.price} 🪙</span>
              </div>
              <div class="shop-card-desc">${recipe.desc}（烹饪 ${recipe.cookTime}s）</div>
            </div>
            ${
              isUnlocked
                ? `<button class="shop-buy-btn bought" disabled>✓ 已掌握（客人正常点单）</button>`
                : `<button class="shop-buy-btn btn-learn-recipe" data-recipe-id="${recipe.id}" ${
                    !canAfford ? 'disabled' : ''
                  }>
                    研习新菜 (${recipe.learnCost} 🪙)
                  </button>`
            }
          </div>
        `;
      }).join('');
    }

    if (this.currentTab === 'staff') {
      const { greeter, handyman } = state.staff;
      const canAffordGreeter = state.scales >= STAFF_COSTS.greeter;
      const canAffordHandyman = state.scales >= STAFF_COSTS.handyman;

      return `
        <!-- 招客员 -->
        <div class="shop-card">
          <div class="shop-card-info">
            <div class="shop-card-title">
              <span>🪧 招客员</span>
              <span>${greeter.hired ? '已雇佣' : '未雇佣'}</span>
            </div>
            <div class="shop-card-desc">在门口热情招呼，每 8 秒冷却结束向客流额外加 1 名客人。</div>
          </div>
          ${
            greeter.hired
              ? `<button class="shop-buy-btn bought" disabled>✓ 已在岗常驻</button>`
              : `<button id="btn-hire-greeter" class="shop-buy-btn" ${
                  !canAffordGreeter ? 'disabled' : ''
                }>
                  雇佣招客员 (${STAFF_COSTS.greeter} 🪙)
                </button>`
          }
        </div>

        <!-- 打杂工 -->
        <div class="shop-card">
          <div class="shop-card-info">
            <div class="shop-card-title">
              <span>🧹 打杂工</span>
              <span>${handyman.hired ? '已雇佣' : '未雇佣'}</span>
            </div>
            <div class="shop-card-desc">勤快打理大厅，每 60 秒为餐厅自动稳定入账 35 鳞币保底。</div>
          </div>
          ${
            handyman.hired
              ? `<button class="shop-buy-btn bought" disabled>✓ 已在岗常驻</button>`
              : `<button id="btn-hire-handyman" class="shop-buy-btn" ${
                  !canAffordHandyman ? 'disabled' : ''
                }>
                  雇佣打杂工 (${STAFF_COSTS.handyman} 🪙)
                </button>`
          }
        </div>
      `;
    }

    return '';
  }

  private bindEvents(state: GameState): void {
    // 商店选项卡切换
    const tabButtons = this.container.querySelectorAll<HTMLButtonElement>('.shop-tab-btn');
    tabButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLElement).getAttribute('data-tab') as ShopTab;
        if (tab) {
          this.currentTab = tab;
          this.render(state);
        }
      });
    });

    // 购买餐桌
    const btnBuyTable = this.container.querySelector<HTMLButtonElement>('#btn-buy-table');
    if (btnBuyTable) {
      btnBuyTable.addEventListener('click', () => {
        const res = ShopManager.buyNextTable(state);
        if (res.success) {
          this.onStateChange();
          this.render(state);
        }
      });
    }

    // 购买炉灶
    const btnBuyStove = this.container.querySelector<HTMLButtonElement>('#btn-buy-stove');
    if (btnBuyStove) {
      btnBuyStove.addEventListener('click', () => {
        const res = ShopManager.buyNextStove(state);
        if (res.success) {
          this.onStateChange();
          this.render(state);
        }
      });
    }

    // 雇佣招客员
    const btnHireGreeter = this.container.querySelector<HTMLButtonElement>('#btn-hire-greeter');
    if (btnHireGreeter) {
      btnHireGreeter.addEventListener('click', () => {
        const res = ShopManager.hireGreeter(state);
        if (res.success) {
          this.onStateChange();
          this.render(state);
        }
      });
    }

    // 雇佣打杂工
    const btnHireHandyman = this.container.querySelector<HTMLButtonElement>('#btn-hire-handyman');
    if (btnHireHandyman) {
      btnHireHandyman.addEventListener('click', () => {
        const res = ShopManager.hireHandyman(state);
        if (res.success) {
          this.onStateChange();
          this.render(state);
        }
      });
    }

    // 研习菜谱
    const learnButtons = this.container.querySelectorAll<HTMLButtonElement>('.btn-learn-recipe');
    learnButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const recipeId = (e.currentTarget as HTMLElement).getAttribute('data-recipe-id');
        if (recipeId) {
          const res = ShopManager.learnRecipe(state, recipeId);
          if (res.success) {
            this.onStateChange();
            this.render(state);
          }
        }
      });
    });

    // 离线仓领取（顶部栏按钮或模态框按钮）
    const claimVault = (): void => {
      OfflineManager.claimOfflineVault(state);
      this.offlineModalVisible = false;
      this.onStateChange();
      this.render(state);
    };

    const btnBarVault = this.container.querySelector<HTMLButtonElement>('#btn-claim-vault-bar');
    if (btnBarVault) {
      btnBarVault.addEventListener('click', claimVault);
    }

    const btnModalVault = this.container.querySelector<HTMLButtonElement>('#btn-claim-vault-modal');
    if (btnModalVault) {
      btnModalVault.addEventListener('click', claimVault);
    }
  }
}
