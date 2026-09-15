import type { Recipe } from './types.ts';

export const ALL_RECIPES: Recipe[] = [
  {
    id: 'seaweed_stick',
    name: '海藻脆脆条',
    price: 12,
    cookTime: 3.0,
    learnCost: 0,
    desc: '深海嫩海藻烘焙出的清香脆口点心',
    icon: '🥖',
  },
  {
    id: 'prism_clam',
    name: '幻彩荧光贝',
    price: 28,
    cookTime: 5.0,
    learnCost: 40,
    desc: '微光闪烁的清蒸鲜贝，肉质嫩滑多汁',
    icon: '🐚',
  },
  {
    id: 'salted_caramel_roll',
    name: '焦糖海盐卷',
    price: 55,
    cookTime: 7.0,
    learnCost: 90,
    desc: '裹着粗海盐与焦糖糖浆的松软烤面包卷',
    icon: '🥐',
  },
  {
    id: 'stardust_stew',
    name: '沸腾星尘汤',
    price: 110,
    cookTime: 10.0,
    learnCost: 180,
    desc: '在陶锅中咕嘟沸腾、散发微星光辉的醇厚暖汤',
    icon: '🍲',
  },
];

export const RECIPES_MAP: Record<string, Recipe> = Object.fromEntries(
  ALL_RECIPES.map((r) => [r.id, r])
);
