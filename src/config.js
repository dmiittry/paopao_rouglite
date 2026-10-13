export const CONFIG = Object.freeze({
  cols: 13,
  rows: 8,
  handSize: 5,
  hands: 4,
  banishes: 2,
  shuffles: 2,
  turns: 2,
  maxTurns: 4,
  jokerSlots: 3,
  ritualSlots: 2,
  reserveLimit: 3,
  reserveBonus: 15,
  startingGold: 8,
  saveVersion: 1,
});
export const SUITS = ["hearts", "spades", "clubs", "diamonds"];
export const SYMBOLS = {
  hearts: "♥",
  spades: "♠",
  clubs: "♣",
  diamonds: "♦",
};
export const SUIT_NAMES = {
  hearts: "Черви",
  spades: "Пики",
  clubs: "Трефы",
  diamonds: "Бубны",
};
export const rankLabel = (rank) =>
  ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[rank] || String(rank);
export const cardValue = (rank) => (rank === 14 ? 11 : Math.min(rank, 10));
export const identity = (c) =>
  `${c.rank ?? c.currentRank}-${c.suit ?? c.currentSuit}`;
export const STAGE_TARGETS = [350, 650, 1050, 1700, 2800, 4500, 7200, 11500];
export const STAGE_REWARDS = [6, 7, 11, 10, 11, 15, 14, 18];
export const RANK_BONUSES = {
  highCard: 0,
  pair: 50,
  twoPair: 100,
  threeOfKind: 160,
  fullHouse: 280,
  fourOfKind: 450,
  fiveOfKind: 850,
};
export const PATTERN_BONUSES = {
  straight: 180,
  flush: 170,
  straightFlushSynergy: 220,
  royalFlushSynergy: 180,
};
export const HAND_NAMES = {
  highCard: "Старшая карта",
  pair: "Пара",
  twoPair: "Две пары",
  threeOfKind: "Сет",
  fullHouse: "Фулл-хаус",
  fourOfKind: "Каре",
  fiveOfKind: "Суперкаре",
  straight: "Стрит",
  flush: "Флеш",
  straightFlushSynergy: "Стрит-флеш",
  royalFlushSynergy: "Роял-флеш",
};
export const RARITIES = {
  common: { name: "Обычный", weight: 60, price: 7 },
  uncommon: { name: "Необычный", weight: 25, price: 12 },
  rare: { name: "Редкий", weight: 10, price: 20 },
  epic: { name: "Эпический", weight: 4, price: 30 },
  legendary: { name: "Легендарный", weight: 1, price: 45 },
};
