export const ACHIEVEMENTS = [
  [
    "flush",
    "Один цвет",
    "Впервые собрать флеш.",
    "Движения поля и ритуал «Запасной шанс»",
  ],
  ["four", "Четыре короны", "Собрать каре.", "Королевский кузнец и движения"],
  [
    "five",
    "За пределами возможного",
    "Собрать пять одинаковых.",
    "Эпический сундук в будущих наградах",
  ],
  [
    "stage3",
    "Первая глава",
    "Пройти 3 этапа в одном забеге.",
    "Джокеры, движения, боссы и старт",
  ],
  ["stage5", "В глубину", "Пройти 5 этапов.", "Стеклянная корона и боссы"],
  ["stage8", "Без конца", "Пройти 8 этапов.", "Вечный коллекционер и движения"],
  [
    "score10000",
    "Пять цифр",
    "Получить 10 000 очков за руку.",
    "Легендарные сундуки",
  ],
  [
    "gold100",
    "Золотой запас",
    "Заработать 100 золота за забег.",
    "Редкий сундук",
  ],
  ["night", "Свет во тьме", "Победить Ночного Джокера.", "Ночной охотник"],
  [
    "upgrades10",
    "Мастерская",
    "Купить 10 улучшений за забег.",
    "Эпический сундук",
  ],
  ["echo", "Отголосок", "Разыграть карту Эхо.", "Двойное сердце"],
  [
    "bossClean",
    "Без вмешательства",
    "Победить босса без ручного перемешивания.",
    "Редкий сундук",
  ],
].map(([id, name, description, reward]) => ({ id, name, description, reward }));
export const isUnlocked = (item, meta) =>
  !item.unlockedBy || meta.achievements.includes(item.unlockedBy);
export function checkAchievements(state, meta) {
  const won = ["reward", "shop", "chest", "event"].includes(state.phase),
    a = state.lastScore?.evaluation;
  const conditions = {
    flush: a?.flush,
    four: a?.rankCategory === "fourOfKind",
    five: a?.rankCategory === "fiveOfKind",
    stage3: won && state.stage >= 3,
    stage5: won && state.stage >= 5,
    stage8: won && state.stage >= 8,
    score10000: state.stats.bestHand >= 10000,
    gold100: state.stats.goldEarned >= 100,
    night: won && state.boss === "night",
    upgrades10: state.stats.upgrades >= 10,
    echo: state.stats.echoScored > 0,
    bossClean: won && !!state.boss && state.stageStats.manualShuffles === 0,
  };
  const added = [];
  for (const [id, ok] of Object.entries(conditions))
    if (ok && !meta.achievements.includes(id)) {
      meta.achievements.push(id);
      added.push(id);
    }
  meta.bestScore = Math.max(meta.bestScore, state.stats.totalScore);
  meta.bestStage = Math.max(
    meta.bestStage,
    won ? state.stage : state.stage - 1,
  );
  return added;
}
