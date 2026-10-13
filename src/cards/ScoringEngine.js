import {
  cardValue,
  RANK_BONUSES,
  PATTERN_BONUSES,
  HAND_NAMES,
  rankLabel,
  SYMBOLS,
} from "../config.js";
import { evaluatePoker } from "./PokerEvaluator.js";
import { rulesFor } from "../roguelite/EffectEngine.js";
export function scoreHand(game, cards) {
  const s = game.state,
    evaluation = evaluatePoker(cards),
    entries = [],
    seen = new Set();
  let serial = 0;
  const add = (source, kind, value, phase, sourceId) => {
    const id = `${sourceId || source}:${kind}`;
    if (seen.has(id)) return;
    seen.add(id);
    entries.push({ source, kind, value, phase, sourceId: id, order: serial++ });
  };
  const ctx = { cards, evaluation, add };
  game.bus.emit("onHandCompleted", ctx);
  add(
    HAND_NAMES[evaluation.rankCategory],
    "chips",
    RANK_BONUSES[evaluation.rankCategory] +
      (s.handLevels[evaluation.rankCategory] || 0) * 35,
    1,
  );
  for (const p of evaluation.patterns)
    add(
      HAND_NAMES[p],
      "chips",
      PATTERN_BONUSES[p] + (s.handLevels[p] || 0) * 35,
      2,
    );
  for (const c of cards)
    add(
      `${rankLabel(c.rank)}${SYMBOLS[c.suit]}`,
      "chips",
      cardValue(c.rank),
      3,
      `base:${c.instanceId}`,
    );
  for (const c of cards)
    add(
      `Маршрут: ${c.turnsUsed} пов. ${c.usedOuterBorder ? "· снаружи" : ""}`,
      "chips",
      5 + (c.turnsUsed || 0) * 5,
      4,
      `path:${c.instanceId}`,
    );
  for (const c of cards)
    for (const mod of c.modifiers || []) game.effects.enhancement(mod, c, ctx);
  for (const c of cards) game.bus.emit("onCardScored", { ...ctx, card: c });
  game.bus.emit("beforeScore", ctx);
  const rules = rulesFor(s);
  if (rules.chips) add("Стартовое усиление", "chips", rules.chips, 5);
  if (rules.xMult !== 1) add("Стартовое усиление", "xMult", rules.xMult, 9);
  if (s.boss === "suit" && !s.temp.cleansed) {
    const n = cards.filter((c) => c.suit === s.cursedSuit).length;
    if (n) add("Проклятая масть", "xMult", Math.pow(0.88, n), 10);
  }
  let chips = 0,
    mult = 1,
    xMult = 1;
  const timeline = entries
    .sort((a, b) => a.phase - b.phase || a.order - b.order)
    .map((line) => {
      if (line.kind === "chips") chips += line.value;
      if (line.kind === "mult") mult += line.value;
      if (line.kind === "xMult") xMult *= line.value;
      return {
        ...line,
        chips: Math.max(0, chips),
        mult: Math.max(0.1, mult),
        xMult,
      };
    });
  chips = Math.max(0, chips);
  mult = Math.max(0.1, mult);
  const finalScore = Math.floor(chips * mult * xMult);
  game.bus.emit("afterScore", { ...ctx, finalScore });
  return { evaluation, cards, timeline, chips, mult, xMult, finalScore };
}
