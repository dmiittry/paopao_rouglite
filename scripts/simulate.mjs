import { Game } from "../src/core/Game.js";
import { SaveManager } from "../src/core/SaveManager.js";
import { availablePairs } from "../src/board/PathFinder.js";
import { evaluatePoker } from "../src/cards/PokerEvaluator.js";
import { RANK_BONUSES, PATTERN_BONUSES, identity } from "../src/config.js";
import { JOKERS } from "../src/data/jokers.js";
export function choosePair(g) {
  const s = g.state,
    pairs = availablePairs(s.board, g.rules.turns);
  let best = null,
    value = -Infinity;
  for (const p of pairs) {
    const c = s.board[p.a],
      hand = [...s.reserve, ...s.hand, c].slice(0, 5),
      e = evaluatePoker(hand);
    const counts = hand.filter((h) => h.rank === c.rank).length,
      suits = hand.filter((h) => h.suit === c.suit).length;
    let n =
      RANK_BONUSES[e.rankCategory] +
      e.patterns.reduce((n, k) => n + PATTERN_BONUSES[k], 0) +
      counts * 21 +
      suits * 17 +
      c.rank +
      p.path.turnsUsed * 4;
    if ((s.modifiers[identity(c)] || []).includes("echo")) n += 90;
    const ranks = [...new Set(hand.map((h) => h.rank))].sort((a, b) => a - b);
    if (ranks.at(-1) - ranks[0] <= 4) n += ranks.length * 12;
    if (n > value) {
      value = n;
      best = p;
    }
  }
  return best;
}
export function simulate(seed, maxStage = 8) {
  const storage = { getItem: () => null, setItem() {} },
    g = new Game(new SaveManager(storage));
  g.transact("newRun", { seed });
  const id = g.state.boosterChoices.includes("green")
    ? "green"
    : g.state.boosterChoices[0];
  g.transact("chooseBooster", { id });
  let actions = 0;
  while (actions++ < 3000) {
    const s = g.state;
    let r;
    if (s.phase === "briefing")
      r = g.transact("beginStage", { contract: true });
    else if (s.phase === "playing") {
      const p = choosePair(g);
      if (!p) throw Error("Board softlock");
      r = g.transact("connect", { a: p.a, b: p.b });
    } else if (s.phase === "reward") {
      if (s.stage >= maxStage) break;
      r = g.transact("openShop");
    } else if (s.phase === "chest") r = g.transact("chooseChest", { index: 0 });
    else if (s.phase === "event") r = g.transact("chooseEvent", { index: 0 });
    else if (s.phase === "shop") {
      const priorities = [
        "baron",
        "flush",
        "narrow",
        "keeper",
        "architect",
        "border",
        "king",
        "knight",
        "pairs",
      ];
      const candidates = s.shop.offers
        .filter(
          (o) =>
            o.type === "joker" &&
            !o.sold &&
            !s.jokers.some((j) => j.id === o.id) &&
            g.price(o) <= s.gold,
        )
        .sort(
          (a, b) =>
            (priorities.indexOf(a.id) < 0 ? 99 : priorities.indexOf(a.id)) -
            (priorities.indexOf(b.id) < 0 ? 99 : priorities.indexOf(b.id)),
        );
      if (candidates.length && s.jokers.length < g.rules.jokerSlots)
        r = g.transact("buy", { uid: candidates[0].uid });
      else {
        const upgrade = s.shop.offers.find(
          (o) =>
            o.type === "enhancement" &&
            !o.sold &&
            g.price(o) <= s.gold &&
            o.options.some((k) => !(s.modifiers[k] || []).includes(o.id)),
        );
        if (upgrade) {
          const key = upgrade.options.find(
            (k) => !(s.modifiers[k] || []).length,
          );
          if (key) r = g.transact("buy", { uid: upgrade.uid, targets: [key] });
        }
        if (!r?.ok) r = g.transact("nextStage");
      }
    } else break;
    if (!r.ok) throw Error(r.error);
  }
  return {
    seed,
    stage: g.state.stage,
    phase: g.state.phase,
    score: g.state.stats.totalScore,
    bestHand: g.state.stats.bestHand,
    actions,
  };
}
if (process.argv[1]?.endsWith("simulate.mjs")) {
  const count = Number(process.argv[2] || 30),
    results = Array.from({ length: count }, (_, i) => simulate(`BALANCE-${i}`));
  console.log(
    JSON.stringify(
      {
        strategy:
          "Greedy rank/suit geometry heuristic; no lookahead, no manual abilities, not human win rates",
        runs: count,
        stage1WinRate:
          results.filter((r) => r.stage > 1 || r.phase === "reward").length /
          count,
        medianStage: results.map((r) => r.stage).sort((a, b) => a - b)[
          Math.floor(count / 2)
        ],
        stage8Wins: results.filter((r) => r.stage === 8 && r.phase === "reward")
          .length,
        results,
      },
      null,
      2,
    ),
  );
}
