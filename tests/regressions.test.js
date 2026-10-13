import test from "node:test";
import assert from "node:assert/strict";
import { game, card, must, addJoker } from "./helpers.js";
import { simulate } from "../scripts/simulate.mjs";
import { scoreHand } from "../src/cards/ScoringEngine.js";
import { availablePairs, findPath } from "../src/board/PathFinder.js";
import { moveBoard } from "../src/board/MovementEngine.js";
import { shuffleBoard } from "../src/board/Board.js";
import { makeTiles } from "../src/cards/CardCollection.js";
import { SeededRandom } from "../src/core/SeededRandom.js";
import { Game } from "../src/core/Game.js";

test("a natural seeded run beats the third-stage boss and finishes stage four without debug", () => {
  const result = simulate("BALANCE-0", 4);
  assert.equal(result.stage, 4);
  assert.equal(result.phase, "reward");
  assert.ok(result.score > 3000);
});
test("same natural run repeats identical purchases, boards, score and outcome", () => {
  assert.deepEqual(simulate("BALANCE-3", 5), simulate("BALANCE-3", 5));
});
test("shuffle fallback succeeds even when random attempts never change a blocked arrangement", () => {
  const g = game("fallback"),
    rng = new SeededRandom("blocked");
  let b;
  for (let i = 0; i < 10000; i++) {
    const candidate = rng.shuffle(makeTiles(g.state.deck));
    if (!availablePairs(candidate, 1, 1).length) {
      b = candidate;
      break;
    }
  }
  assert.ok(b);
  const next = shuffleBoard(b, { shuffle: (a) => [...a] }, 1);
  assert.ok(availablePairs(next, 1, 1).length);
  assert.deepEqual(next.map((c) => c.id).sort(), b.map((c) => c.id).sort());
});
test("every step of returned paths is orthogonal and avoids occupied interior cells", () => {
  const g = game("paths");
  for (let turn = 0; turn < 35; turn++) {
    const pairs = availablePairs(g.state.board, g.rules.turns);
    assert.ok(pairs.length);
    for (const p of pairs) {
      for (let i = 1; i < p.path.cells.length; i++) {
        const a = p.path.cells[i - 1],
          b = p.path.cells[i];
        assert.equal(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1);
        if (
          i < p.path.cells.length - 1 &&
          b.x >= 0 &&
          b.x < 13 &&
          b.y >= 0 &&
          b.y < 8
        )
          assert.equal(g.state.board[b.y * 13 + b.x], null);
      }
    }
    const p = pairs[0];
    g.state.board[p.a] = null;
    g.state.board[p.b] = null;
    g.ensureBoard();
  }
});
test("economy does not pay twice for echo copies; double-heart generates three cards", () => {
  const g = game();
  g.state.board = [...Array(104).fill(null)];
  g.state.board[0] = { ...card(2, "clubs"), id: "a", blueprintId: "clubs-2" };
  g.state.board[1] = { ...card(2, "clubs"), id: "b", blueprintId: "clubs-2" };
  g.state.modifiers["2-clubs"] = ["echo"];
  addJoker(g, "treasurer");
  addJoker(g, "doubleheart");
  const before = g.state.gold;
  g.removePair(0, 1, "collect", false);
  assert.equal(g.state.gold, before + 1);
  assert.equal(g.state.hand.length, 3);
});
test("mirror retriggers one card enhancement exactly once and copyist copies the left card joker", () => {
  const g = game();
  addJoker(g, "mirror");
  addJoker(g, "king");
  addJoker(g, "copyist");
  const cards = [13, 2, 3, 4, 5].map((rank, i) =>
    card(rank, "hearts", {
      instanceId: `copy-${i}`,
      modifiers: i === 0 ? ["gold"] : [],
    }),
  );
  const result = scoreHand(g, cards);
  assert.equal(
    result.timeline
      .filter((l) => l.source.includes("Король королей"))
      .reduce((n, l) => n + l.value, 0),
    90,
  );
  assert.equal(
    result.timeline
      .filter((l) => l.source.includes("Золотая"))
      .reduce((n, l) => n + l.value, 0),
    50,
  );
});
test("epic copyist copies scaling payout without mutating its count a second time", () => {
  const g = game();
  addJoker(g, "eternal");
  addJoker(g, "copyist");
  const cards = [2, 2, 2, 2, 2].map((rank, i) =>
    card(rank, "hearts", { instanceId: `et-${i}` }),
  );
  const result = scoreHand(g, cards);
  assert.equal(g.state.jokers[0].count, 12);
  assert.equal(
    result.timeline
      .filter((l) => l.source.includes("Вечный коллекционер"))
      .reduce((n, l) => n + l.value, 0),
    24,
  );
});
test("cursed suit penalty and cleansing change scoring by the documented factor", () => {
  const g = game(),
    cards = [2, 4, 6, 8, 10].map((rank, i) =>
      card(rank, "hearts", { instanceId: `curse-${i}` }),
    );
  g.state.boss = "suit";
  g.state.cursedSuit = "hearts";
  const cursed = scoreHand(g, cards);
  g.state.temp.cleansed = true;
  const clean = scoreHand(g, cards);
  assert.equal(cursed.finalScore, Math.floor(clean.chips * Math.pow(0.88, 5)));
  assert.ok(clean.finalScore > cursed.finalScore);
});
test("mirror boss reflects the board after scoring, and the dealer reduces hands", () => {
  const g = game();
  g.state.boss = "reflection";
  g.state.hand = [2, 4, 6, 8, 10].map((rank, i) =>
    card(rank, "hearts", { instanceId: `reflect-${i}` }),
  );
  const expected = moveBoard(g.state.board, "mirrorX");
  g.resolveHand();
  assert.deepEqual(g.state.board, expected);
  g.state.boss = "dealer";
  assert.equal(g.rules.hands, 4);
});
test("glass sleeps for the stage and reset restores it; card enhancements affect actual score", () => {
  const g = game(),
    cards = [2, 4, 6, 8, 10].map((rank, i) =>
      card(rank, "hearts", {
        instanceId: `glass-${i}`,
        modifiers: i === 0 ? ["glass"] : [],
      }),
    );
  g.rng.next = () => 0;
  const a = scoreHand(g, cards);
  assert.equal(a.xMult, 1.8);
  const b = scoreHand(g, cards);
  assert.equal(b.xMult, 1);
  assert.ok(g.state.dormant["2-hearts"]);
});
test("reward/chest/event transactions survive reload and cannot be claimed twice", () => {
  const g = game();
  g.debugEnabled = true;
  g.state.boss = "night";
  must(g, "debug", { op: "win" });
  must(g, "openShop");
  const restored = new Game(g.saveManager);
  const gold = restored.state.gold;
  must(restored, "chooseChest", { index: 0 });
  assert.ok(restored.state.gold > gold);
  const after = restored.state.gold;
  assert.equal(restored.transact("chooseChest", { index: 0 }).ok, false);
  assert.equal(restored.state.gold, after);
});
test("banker interest, slot restrictions and reroll discount apply real economic effects", () => {
  const g = game();
  addJoker(g, "banker");
  addJoker(g, "economist");
  g.state.gold = 50;
  g.debugEnabled = true;
  must(g, "debug", { op: "win" });
  assert.equal(g.state.reward.interest, 12);
  must(g, "openShop");
  assert.equal(g.rerollCost(), 1);
  addJoker(g, "keeper");
  g.state.shop.offers.push({
    uid: "full",
    type: "joker",
    id: "king",
    price: 7,
    sold: false,
  });
  const before = g.state.gold;
  assert.equal(g.transact("buy", { uid: "full" }).ok, false);
  assert.equal(g.state.gold, before);
});
test("temporary route and echo bonuses expire on the next appropriate stage", () => {
  const g = game();
  g.state.rituals = [
    { uid: "route", id: "path" },
    { uid: "echo", id: "echo" },
  ];
  must(g, "useRitual", { uid: "route" });
  must(g, "useRitual", { uid: "echo", target: "2-hearts" });
  assert.equal(g.rules.turns, 2);
  assert.deepEqual(g.state.temporaryModifiers["2-hearts"], ["echo"]);
  g.debugEnabled = true;
  must(g, "debug", { op: "win" });
  must(g, "openShop");
  must(g, "nextStage");
  assert.equal(g.rules.turns, 3);
  assert.deepEqual(g.state.temporaryModifiers, {});
});
test("a missing mandatory save field is rejected with a useful message", () => {
  const g = game();
  const raw = JSON.parse(g.saveManager.storage.getItem(g.saveManager.key));
  delete raw.run.stats;
  g.saveManager.storage.setItem(g.saveManager.key, JSON.stringify(raw));
  assert.equal(g.saveManager.load(), null);
  assert.match(g.saveManager.error, /stats/);
});
