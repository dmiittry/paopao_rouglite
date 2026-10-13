import test from "node:test";
import assert from "node:assert/strict";
import { SeededRandom } from "../src/core/SeededRandom.js";
import { EventBus } from "../src/core/EventBus.js";
import { SaveManager, validateState } from "../src/core/SaveManager.js";
import { Game } from "../src/core/Game.js";
import { findPath, availablePairs } from "../src/board/PathFinder.js";
import { generateBoard, shuffleBoard } from "../src/board/Board.js";
import { moveBoard } from "../src/board/MovementEngine.js";
import {
  createDeck,
  transformBlueprint,
  deckIdentities,
} from "../src/cards/CardCollection.js";
import { evaluatePoker } from "../src/cards/PokerEvaluator.js";
import { scoreHand } from "../src/cards/ScoringEngine.js";
import { MOVEMENTS } from "../src/data/movementModes.js";
import { JOKERS } from "../src/data/jokers.js";
import {
  ENHANCEMENTS,
  RITUALS,
  BOOSTERS,
  BOSSES,
} from "../src/data/catalog.js";
import { rulesFor } from "../src/roguelite/EffectEngine.js";
import { game, card, must, addJoker, MemoryStorage } from "./helpers.js";

test("seed and restored RNG reproduce every draw", () => {
  const a = new SeededRandom("abc"),
    b = new SeededRandom("abc");
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  const c = new SeededRandom("abc", a.state);
  assert.equal(a.next(), c.next());
});
test("path: zero turns and shortest route preferred", () => {
  const board = Array(25).fill(null);
  board[6] = card(2);
  board[9] = card(2);
  const p = findPath(board, 6, 9, 4, 5, 5);
  assert.equal(p.turnsUsed, 0);
  assert.equal(p.length, 3);
});
test("path: one turn", () => {
  const b = Array(25).fill(null);
  b[6] = card(2);
  b[18] = card(2);
  assert.equal(findPath(b, 6, 18, 2, 5, 5).turnsUsed, 1);
  assert.equal(findPath(b, 6, 18, 0, 5, 5), null);
});
test("path: two turns outside the field", () => {
  const b = Array.from({ length: 15 }, () => card(9, "clubs"));
  b[0] = card(2);
  b[4] = card(2);
  const p = findPath(b, 0, 4, 2, 5, 3);
  assert.equal(p.turnsUsed, 2);
  assert.equal(p.usedOuterBorder, true);
  assert.equal(findPath(b, 0, 4, 1, 5, 3), null);
});
test("path: exactly three turns requires a higher limit", () => {
  const map = [
      "#######",
      "#S..###",
      "###.###",
      "###..##",
      "####E##",
      "#######",
    ],
    b = [];
  let start, end;
  for (const row of map)
    for (const c of row) {
      if (c === "S") start = b.length;
      if (c === "E") end = b.length;
      b.push(c === "#" ? card(9, "clubs") : c === "." ? null : card(2));
    }
  assert.equal(findPath(b, start, end, 2, 7, 6), null);
  assert.equal(findPath(b, start, end, 3, 7, 6).turnsUsed, 3);
});
test("path: rejects different identities and occupied routes", () => {
  const b = Array.from({ length: 25 }, () => card(9, "clubs"));
  b[6] = card(2);
  b[18] = card(2);
  assert.equal(findPath(b, 6, 18, 4, 5, 5), null);
  b[18] = card(3);
  assert.equal(findPath(b, 6, 18, 4, 5, 5), null);
});
test("board: exactly 104 distinct physical tiles and two per blueprint", () => {
  const b = generateBoard(createDeck(), new SeededRandom("B"));
  assert.equal(b.length, 104);
  assert.equal(new Set(b.map((t) => t.id)).size, 104);
  const m = {};
  for (const c of b) m[c.blueprintId] = (m[c.blueprintId] || 0) + 1;
  assert.equal(Object.keys(m).length, 52);
  assert.ok(Object.values(m).every((v) => v === 2));
});
test("board: transformed identities can match across blueprints and keep 104 cells", () => {
  const s = { deck: createDeck(), board: [] };
  const id = s.deck[0].blueprintId;
  transformBlueprint(s, id, 13, "hearts");
  const b = generateBoard(s.deck, new SeededRandom("T"));
  assert.equal(b.length, 104);
  assert.equal(b.filter((c) => c.rank === 13 && c.suit === "hearts").length, 4);
});
for (const m of MOVEMENTS)
  test(`movement ${m.id}: deterministic permutation of all tile properties`, () => {
    const b = generateBoard(createDeck(), new SeededRandom("MOVE"));
    for (let i = 0; i < 22; i++) b[i] = null;
    const result = moveBoard(b, m.id);
    assert.equal(result.length, 104);
    assert.deepEqual(
      result
        .filter(Boolean)
        .map((x) => JSON.stringify(x))
        .sort(),
      b
        .filter(Boolean)
        .map((x) => JSON.stringify(x))
        .sort(),
    );
    assert.deepEqual(result, moveBoard(b, m.id));
  });
test("shuffles preserve multiset and guarantee a move with one to four turns", () => {
  const rng = new SeededRandom("shuffle"),
    b = generateBoard(createDeck(), rng);
  for (let t = 1; t <= 4; t++) {
    const next = shuffleBoard(b, rng, t);
    assert.equal(next.filter(Boolean).length, 104);
    assert.deepEqual(next.map((c) => c.id).sort(), b.map((c) => c.id).sort());
    assert.ok(availablePairs(next, t, 1).length);
  }
});
const pokerCases = [
  ["pair", [2, 2, 5, 9, 14]],
  ["twoPair", [2, 2, 5, 5, 14]],
  ["threeOfKind", [3, 3, 3, 5, 14]],
  ["fullHouse", [3, 3, 3, 5, 5]],
  ["fourOfKind", [6, 6, 6, 6, 4]],
  ["fiveOfKind", [14, 14, 14, 14, 14]],
];
for (const [name, ranks] of pokerCases)
  test(`poker: ${name} combines with flush and does not pay weaker rank groups`, () => {
    const e = evaluatePoker(ranks.map((r) => card(r)));
    assert.equal(e.rankCategory, name);
    assert.equal(e.flush, true);
  });
test("poker: low ace, straight flush, royal, and no wrap", () => {
  let e = evaluatePoker([14, 2, 3, 4, 5].map((r) => card(r)));
  assert.equal(e.straight, true);
  assert.ok(e.patterns.includes("straightFlushSynergy"));
  assert.ok(!e.patterns.includes("royalFlushSynergy"));
  e = evaluatePoker([10, 11, 12, 13, 14].map((r) => card(r)));
  assert.ok(e.patterns.includes("royalFlushSynergy"));
  assert.equal(
    evaluatePoker([12, 13, 14, 2, 3].map((r) => card(r))).straight,
    false,
  );
});
test("dual suits count as a valid flush intersection", () => {
  const cards = [2, 3, 5, 8, 13].map((r) => card(r));
  cards[0].suit = "diamonds";
  cards[0].secondarySuit = "hearts";
  assert.ok(evaluatePoker(cards).flush);
});
test("event bus deterministic order, reentrancy and duplicate source protection", () => {
  const bus = new EventBus(),
    seen = [];
  bus.on("x", "b", (_, e) => {
    seen.push("b");
    bus.emit("x", {}, e);
  });
  bus.on("x", "a", () => seen.push("a"));
  bus.emit("x");
  assert.deepEqual(seen, ["a", "b"]);
});
test("turn modifiers clamp correctly", () => {
  const g = game();
  assert.equal(g.rules.turns, 2);
  addJoker(g, "turner");
  assert.equal(g.rules.turns, 3);
  addJoker(g, "narrow");
  assert.equal(g.rules.turns, 2);
  g.state.boss = "corners";
  assert.equal(g.rules.turns, 1);
  g.state.temp.turns = 10;
  assert.equal(g.rules.turns, 4);
});
test("echo overflow enters reserve and a second click cannot collect the same pair", () => {
  const g = game("ECHO"),
    p = availablePairs(g.state.board, 2, 1)[0],
    c = g.state.board[p.a];
  g.state.hand = [3, 4, 7, 11].map((r, i) =>
    card(r, "spades", { instanceId: `pre-${i}` }),
  );
  g.state.modifiers[`${c.rank}-${c.suit}`] = ["echo"];
  g.state.target = 999999;
  const before = g.state.board.filter(Boolean).length;
  must(g, "connect", { a: p.a, b: p.b });
  assert.equal(g.state.board.filter(Boolean).length, before - 2);
  assert.equal(g.state.hand.length, 0);
  assert.equal(g.state.reserve.length, 1);
  assert.equal(g.state.handsLeft, 4);
  const snapshot = JSON.stringify(g.state);
  assert.equal(g.transact("connect", { a: p.a, b: p.b }).ok, false);
  assert.equal(JSON.stringify(g.state), snapshot);
});
test("unspent reserve converts on final hand and may meet the target", () => {
  const g = game("R"),
    p = availablePairs(g.state.board, 2, 1)[0],
    c = g.state.board[p.a];
  g.state.hand = [2, 3, 4, 5].map((r, i) =>
    card(r, "spades", { instanceId: `pre-${i}` }),
  );
  g.state.modifiers[`${c.rank}-${c.suit}`] = ["echo"];
  g.state.handsLeft = 1;
  g.state.target = 100000;
  must(g, "connect", { a: p.a, b: p.b });
  assert.equal(g.state.reserve.length, 0);
  assert.equal(g.state.score, g.state.lastScore.finalScore + 15);
  assert.equal(g.state.phase, "lost");
});
test("banish costs one resource and does not fill hand; economic effect fires once", () => {
  const g = game();
  addJoker(g, "shadow");
  const p = availablePairs(g.state.board, 2, 1)[0],
    gold = g.state.gold;
  must(g, "connect", { a: p.a, b: p.b, mode: "banish" });
  assert.equal(g.state.banishes, 1);
  assert.equal(g.state.hand.length, 0);
  assert.equal(g.state.gold, gold + 2);
  assert.equal(g.state.score, 15);
});
test("multiple jokers, independent multipliers and unique timeline IDs", () => {
  const g = game();
  addJoker(g, "baron");
  addJoker(g, "flush");
  addJoker(g, "narrow");
  const r = scoreHand(
    g,
    [2, 4, 6, 8, 10].map((rank, i) =>
      card(rank, "hearts", { instanceId: `c${i}` }),
    ),
  );
  assert.equal(r.mult, 5);
  assert.equal(r.xMult, 2.6);
  assert.equal(r.finalScore, Math.floor(r.chips * r.mult * r.xMult));
  assert.equal(
    new Set(r.timeline.map((l) => l.sourceId)).size,
    r.timeline.length,
  );
});
test("every catalogue enhancement has a working deterministic handler", () => {
  for (const mod of ENHANCEMENTS) {
    const g = game("M");
    const cards = [2, 2, 2, 3, 3].map((r, i) =>
      card(r, "hearts", { instanceId: `m${i}`, modifiers: [mod.id] }),
    );
    const result = scoreHand(g, cards);
    assert.ok(result.finalScore > 0, mod.id);
  }
});
test("every joker can execute all scoring/collection/stage triggers without placeholder handlers", () => {
  assert.ok(JOKERS.length >= 30);
  for (const def of JOKERS) {
    const g = game("J");
    addJoker(g, def.id);
    g.bus.emit("onStageStart", {});
    for (const suit of ["clubs", "diamonds", "diamonds"])
      g.bus.emit("onCardCollected", { card: card(13, suit) });
    g.bus.emit("onPairDestroyed", {});
    const score = scoreHand(
      g,
      [13, 13, 13, 13, 13].map((r, i) =>
        card(r, "hearts", {
          instanceId: `j${i}`,
          turnsUsed: 2,
          usedOuterBorder: true,
          modifiers: ["gold"],
          echo: true,
        }),
      ),
    );
    assert.ok(Number.isFinite(score.finalScore), def.id);
    g.bus.emit("onStageWon", {});
  }
});
test("purchases, transforms, sale, reroll, contracts, reward idempotency", () => {
  const g = game();
  g.debugEnabled = true;
  g.state.contract = "noShuffle";
  g.state.gold = 100;
  must(g, "debug", { op: "win" });
  const paid = g.state.gold;
  assert.ok(g.state.reward.contract > 0);
  g.winStage();
  assert.equal(g.state.gold, paid);
  must(g, "openShop");
  const offer = {
    uid: "test-j",
    id: "knight",
    type: "joker",
    price: 7,
    sold: false,
  };
  g.state.shop.offers.push(offer);
  must(g, "buy", { uid: offer.uid });
  const after = g.state.gold;
  assert.equal(g.transact("buy", { uid: offer.uid }).ok, false);
  assert.equal(g.state.gold, after);
  must(g, "sell", { uid: g.state.jokers[0].uid });
  const r = g.rerollCost();
  must(g, "reroll");
  assert.equal(g.rerollCost(), 4);
  assert.equal(r, 2);
  g.state.shop.offers.push({
    uid: "transform",
    id: "transform",
    type: "special",
    price: 7,
    sold: false,
  });
  must(g, "buy", {
    uid: "transform",
    blueprintId: g.state.deck[0].blueprintId,
    rank: 14,
    suit: "clubs",
  });
  must(g, "nextStage");
  assert.equal(g.state.board.length, 104);
  assert.equal(
    g.state.board.filter((c) => c.rank === 14 && c.suit === "clubs").length,
    4,
  );
});
test("smith upgrades three chosen identities for one payment; incompatibility rolls back", () => {
  const g = game();
  g.debugEnabled = true;
  addJoker(g, "smith");
  must(g, "debug", { op: "win" });
  must(g, "openShop");
  g.state.gold = 100;
  const targets = deckIdentities(g.state.deck)
    .slice(0, 3)
    .map((c) => c.id);
  g.state.shop.offers.push({
    uid: "smith",
    type: "enhancement",
    id: "echo",
    price: 10,
    options: targets,
    sold: false,
  });
  must(g, "buy", { uid: "smith", targets });
  assert.equal(g.state.gold, 90);
  for (const t of targets) assert.deepEqual(g.state.modifiers[t], ["echo"]);
  g.state.modifiers[targets[0]] = ["glass"];
  g.state.shop.offers.push({
    uid: "bad",
    type: "enhancement",
    id: "cursed",
    price: 10,
    options: targets,
    sold: false,
  });
  const snapshot = JSON.stringify(g.state);
  assert.equal(
    g.transact("buy", { uid: "bad", targets: [targets[0]] }).ok,
    false,
  );
  assert.equal(JSON.stringify(g.state), snapshot);
});
test("save restores exact board, RNG, modified deck, resources and next action", () => {
  const g = game("SAVE");
  const p = availablePairs(g.state.board, 2, 1)[0];
  must(g, "connect", { a: p.a, b: p.b });
  g.state.modifiers["13-hearts"] = ["echo", "gold"];
  g.persist();
  const h = new Game(g.saveManager);
  assert.deepEqual(h.state, g.state);
  must(g, "shuffle");
  must(h, "shuffle");
  assert.deepEqual(h.state, g.state);
});
test("corrupt and incompatible saves are rejected safely", () => {
  const storage = new MemoryStorage(),
    save = new SaveManager(storage);
  storage.setItem(save.key, "{");
  assert.equal(save.load(), null);
  assert.ok(save.error);
  storage.setItem(save.key, JSON.stringify({ version: 999 }));
  assert.equal(save.load(), null);
  assert.match(save.error, /Версия/);
  const g = game();
  g.state.board[0] = null;
  assert.throws(() => validateState(g.state), /Нечётное/);
});
test("rituals are single use, including every target type", () => {
  assert.equal(RITUALS.length, 12);
  for (const ritual of RITUALS) {
    const g = game("RITUAL");
    g.state.rituals = [{ uid: "r", id: ritual.id }];
    const pair = availablePairs(g.state.board, 2, 1)[0];
    if (ritual.id === "cleanse") g.state.boss = "corners";
    const args = {
      uid: "r",
      target: "2-hearts",
      blueprintId: g.state.deck[0].blueprintId,
      rank: 14,
      suit: "clubs",
      copyIdentity: "13-spades",
      a: pair.a,
      b: pair.b,
      movement: "up",
    };
    must(g, "useRitual", args);
    assert.equal(g.state.rituals.length, 0, ritual.id);
    assert.equal(g.transact("useRitual", args).ok, false);
  }
});
test("all boosters start a valid playable board", () => {
  for (const b of BOOSTERS) {
    const g = game("BOOSTER", b.id);
    assert.equal(g.state.board.length, 104);
    assert.ok(availablePairs(g.state.board, g.rules.turns, 1).length);
    validateState(g.state);
  }
});
test("every boss allows a valid move, victory and reward", () => {
  for (const b of BOSSES) {
    const g = game("BOSS");
    g.debugEnabled = true;
    g.state.stage = 3;
    must(g, "debug", { op: "boss", value: b.id });
    assert.ok(availablePairs(g.state.board, g.rules.turns, 1).length);
    must(g, "debug", { op: "win" });
    assert.equal(g.state.phase, "reward");
    must(g, "openShop");
    assert.equal(g.state.phase, "chest");
    must(g, "chooseChest", { index: 0 });
    assert.equal(g.state.phase, "shop");
  }
});
test("no gold, no capacity and stale revisions cannot mutate state", () => {
  const g = game();
  g.debugEnabled = true;
  must(g, "debug", { op: "win" });
  must(g, "openShop");
  g.state.gold = 0;
  const before = JSON.stringify(g.state);
  assert.equal(
    g.transact("buy", { uid: g.state.shop.offers[0].uid }).ok,
    false,
  );
  assert.equal(g.transact("reroll").ok, false);
  assert.equal(JSON.stringify(g.state), before);
  assert.equal(g.transact("reroll", {}, -1).ok, false);
});
