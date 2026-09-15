export type CustomerState =
  | 'WALKING_IN'
  | 'SEATED'
  | 'ORDERING'
  | 'WAITING_FOOD'
  | 'EATING'
  | 'LEAVING_SATISFIED'
  | 'LEAVING_ANGRY';

export interface Customer {
  id: string;
  species: string;
  avatar: string;
  state: CustomerState;
  tableId: number | null;
  targetRecipeId: string | null;
  stateTimer: number; // in seconds
  bubbleText?: string;
  bubbleType?: 'normal' | 'happy' | 'angry';
}

export interface Recipe {
  id: string;
  name: string;
  price: number; // 鳞币收入
  cookTime: number; // 烹饪秒数
  learnCost: number; // 研习所需鳞币
  desc: string;
  icon: string;
}

export interface Table {
  id: number;
  name: string;
  customerId: string | null;
  servedRecipeId: string | null;
}

export interface KitchenOrder {
  id: string;
  tableId: number;
  customerId: string;
  recipeId: string;
  totalCookTime: number;
  remainingCookTime: number;
}

export interface Stove {
  id: number;
  name: string;
  currentOrder: KitchenOrder | null;
}

export interface GreeterStaff {
  hired: boolean;
  cooldown: number; // 冷却周期（秒）
  timer: number; // 当前倒计时
}

export interface HandymanStaff {
  hired: boolean;
  interval: number; // 触发周期（秒，固定60秒）
  timer: number; // 当前倒计时
  payout: number; // 保底鳞币
}

export interface StaffState {
  greeter: GreeterStaff;
  handyman: HandymanStaff;
}

export interface GameStats {
  completedServices: number;
  unservedAngryCustomers: number;
  totalEarned: number;
  elapsedSeconds: number;
}

export interface GameState {
  scales: number; // 鳞币
  stars: number; // 星
  tables: Table[];
  stoves: Stove[];
  unlockedRecipeIds: string[];
  staff: StaffState;
  customers: Customer[];
  kitchenQueue: KitchenOrder[];
  offlineVault: number; // 离线仓暂存鳞币
  stats: GameStats;
  lastTimestamp: number; // 毫秒时间戳
}
