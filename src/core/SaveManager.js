import { CONFIG, SUITS } from "../config.js";
import { JOKERS } from "../data/jokers.js";
import { ENHANCEMENTS, RITUALS, BOOSTERS, BOSSES } from "../data/catalog.js";
import { MOVEMENTS } from "../data/movementModes.js";
export const defaultMeta = () => ({
  achievements: [],
  bestScore: 0,
  bestStage: 0,
  runs: 0,
});
export const defaultSettings = () => ({
  sound: true,
  volume: 0.35,
  music: false,
  speed: "normal",
  reducedDarkness: false,
});
export function validateState(s) {
  if (
    !s ||
    !Array.isArray(s.deck) ||
    s.deck.length !== 52 ||
    new Set(s.deck.map((b) => b.blueprintId)).size !== 52
  )
    throw Error("Некорректная колода сохранения");
  for (const b of s.deck)
    if (
      !Number.isInteger(b.currentRank) ||
      b.currentRank < 2 ||
      b.currentRank > 14 ||
      !SUITS.includes(b.currentSuit)
    )
      throw Error("Некорректная идентичность");
  if (
    ![
      "booster",
      "briefing",
      "playing",
      "reward",
      "shop",
      "chest",
      "event",
      "lost",
      "ended",
    ].includes(s.phase)
  )
    throw Error("Неизвестный экран");
  if (!Array.isArray(s.board) || ![0, 104].includes(s.board.length))
    throw Error("Некорректное поле");
  const counts = new Map(),
    ids = new Set();
  for (const t of s.board.filter(Boolean)) {
    if (ids.has(t.id)) throw Error("Дубликат плитки");
    ids.add(t.id);
    if (
      !SUITS.includes(t.suit) ||
      !Number.isInteger(t.rank) ||
      t.rank < 2 ||
      t.rank > 14
    )
      throw Error("Некорректная плитка");
    const key = `${t.rank}-${t.suit}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if ([...counts.values()].some((n) => n % 2))
    throw Error("Нечётное число плиток");
  if (
    !Array.isArray(s.hand) ||
    s.hand.length >= 5 ||
    !Array.isArray(s.reserve) ||
    s.reserve.length > CONFIG.reserveLimit
  )
    throw Error("Некорректная рука");
  for (const k of [
    "gold",
    "score",
    "stage",
    "handsLeft",
    "manualShuffles",
    "banishes",
    "rngState",
    "revision",
  ])
    if (!Number.isSafeInteger(s[k]) || s[k] < 0)
      throw Error(`Некорректное поле: ${k}`);
  if (
    !Array.isArray(s.jokers) ||
    !s.jokers.every((j) => JOKERS.some((d) => d.id === j.id)) ||
    new Set(s.jokers.map((j) => j.id)).size !== s.jokers.length
  )
    throw Error("Некорректные джокеры");
  if (
    !s.modifiers ||
    Object.values(s.modifiers).some(
      (a) =>
        !Array.isArray(a) ||
        a.some((id) => !ENHANCEMENTS.some((m) => m.id === id)),
    )
  )
    throw Error("Некорректные улучшения");
  for (const field of [
    "temporaryModifiers",
    "dormant",
    "cardGrowth",
    "handLevels",
    "stats",
    "stageStats",
    "temp",
    "nextTemp",
  ]) {
    if (!s[field] || typeof s[field] !== "object" || Array.isArray(s[field]))
      throw Error(`Повреждены данные: ${field}`);
  }
  for (const field of [
    "totalScore",
    "bestHand",
    "goldEarned",
    "upgrades",
    "echoScored",
  ]) {
    if (!Number.isFinite(s.stats[field]) || s.stats[field] < 0)
      throw Error("Повреждена статистика");
  }
  if (
    !Array.isArray(s.rituals) ||
    !s.rituals.every((r) => RITUALS.some((d) => d.id === r.id))
  )
    throw Error("Повреждены ритуалы");
  if (!Array.isArray(s.paidStages) || !Array.isArray(s.effectLog))
    throw Error("Повреждена история забега");
  if (s.booster && !BOOSTERS.some((b) => b.id === s.booster))
    throw Error("Неизвестное усиление");
  if (s.boss && !BOSSES.some((b) => b.id === s.boss))
    throw Error("Неизвестный босс");
  if (s.phase !== "booster" && !MOVEMENTS.some((m) => m.id === s.movement))
    throw Error("Неизвестное движение");
  if (s.phase === "shop" && !Array.isArray(s.shop?.offers))
    throw Error("Повреждён магазин");
  if (s.phase === "chest" && !Array.isArray(s.chest?.options))
    throw Error("Повреждён сундук");
  if (s.phase === "reward" && !Number.isFinite(s.reward?.total))
    throw Error("Повреждена награда");
  if (s.phase === "event" && typeof s.event?.id !== "string")
    throw Error("Повреждено событие");
  for (const c of [...s.hand, ...s.reserve])
    if (
      !Number.isInteger(c.rank) ||
      c.rank < 2 ||
      c.rank > 14 ||
      !SUITS.includes(c.suit) ||
      !Array.isArray(c.modifiers)
    )
      throw Error("Повреждена карта в руке");
  return true;
}
export class SaveManager {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.key = "jokers-labyrinth.v1";
    this.error = null;
  }
  load() {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.version !== CONFIG.saveVersion)
        throw Error("Версия сохранения не поддерживается");
      if (data.run) validateState(data.run);
      if (!Array.isArray(data.meta?.achievements))
        throw Error("Повреждены достижения");
      const defaults = defaultSettings();
      data.settings = { ...defaults, ...data.settings };
      data.settings.volume = Number.isFinite(data.settings.volume)
        ? Math.max(0, Math.min(1, data.settings.volume))
        : defaults.volume;
      if (!["normal", "fast", "minimal"].includes(data.settings.speed))
        data.settings.speed = "normal";
      return data;
    } catch (e) {
      this.error = e.message;
      return null;
    }
  }
  save(run, meta, settings) {
    try {
      if (run) validateState(run);
      this.storage.setItem(
        this.key,
        JSON.stringify({ version: CONFIG.saveVersion, run, meta, settings }),
      );
      this.error = null;
      return true;
    } catch (e) {
      this.error = e.message;
      return false;
    }
  }
  export(run, meta, settings) {
    return JSON.stringify(
      { version: CONFIG.saveVersion, run, meta, settings },
      null,
      2,
    );
  }
}
