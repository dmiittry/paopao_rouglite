import { CONFIG, identity, SUITS } from "../config.js";
import { jokerById } from "../data/jokers.js";
import { enhancementById, BOOSTERS } from "../data/catalog.js";
export function hasJoker(state, id) {
  return state.jokers.some((j) => j.id === id);
}
export function rulesFor(s) {
  const b = BOOSTERS.find((b) => b.id === s.booster)?.effects || {};
  const has = (id) => hasJoker(s, id);
  return {
    turns: Math.min(
      CONFIG.maxTurns,
      Math.max(
        1,
        CONFIG.turns +
          (b.turns || 0) +
          (has("turner") ? 1 : 0) -
          (has("narrow") ? 1 : 0) +
          (s.temp?.turns || 0) -
          (s.boss === "corners" && !s.temp?.cleansed ? 1 : 0),
      ),
    ),
    hands: Math.max(
      1,
      CONFIG.hands +
        (b.hands || 0) +
        (has("keeper") ? 1 : 0) -
        (has("vault") ? 1 : 0) -
        (s.boss === "dealer" && !s.temp?.cleansed ? 1 : 0),
    ),
    shuffles: Math.max(0, CONFIG.shuffles + (b.shuffles || 0)),
    banishes: Math.max(0, CONFIG.banishes + (b.banishes || 0)),
    jokerSlots:
      CONFIG.jokerSlots +
      (s.extraJokerSlots || 0) +
      (has("pockets") ? 1 : 0) +
      (has("vault") ? 2 : 0),
    ritualSlots:
      CONFIG.ritualSlots + (s.extraRitualSlots || 0) + (has("pockets") ? 1 : 0),
    targetOptions: has("atlas") ? 10 : 5,
    upgradeTargets: has("smith") ? 3 : 1,
    xMult: b.xMult || 1,
    chips: b.chips || 0,
    reward: b.reward || 0,
    discount: b.discount || 0,
  };
}
export function modifiersFor(s, card) {
  return [
    ...new Set([
      ...(s.modifiers[identity(card)] || []),
      ...(s.temporaryModifiers[identity(card)] || []),
    ]),
  ];
}
export function canEnhance(s, key, enhancement) {
  const list = s.modifiers[key] || [];
  return (
    !list.includes(enhancement) &&
    list.length < 3 &&
    !(enhancement === "glass" && list.includes("cursed")) &&
    !(enhancement === "cursed" && list.includes("glass"))
  );
}
export class EffectEngine {
  constructor(game) {
    this.game = game;
    const events = [
      "onStageStart",
      "onCardCollected",
      "onPairDestroyed",
      "onCardScored",
      "beforeScore",
      "onStageWon",
    ];
    for (const type of events)
      game.bus.on(type, "effect-engine", (p, e) => this.run(type, p, e));
  }
  run(type, p, event) {
    const s = this.game.state;
    for (const instance of [...s.jokers].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      const j = jokerById(instance.id);
      if (!j?.trigger.includes(type)) continue;
      const key = `${event.id}:${instance.uid}:${type}`;
      if (event.seen.has(key)) continue;
      event.seen.add(key);
      this.joker(instance, type, p);
    }
    if (type === "beforeScore") {
      if (hasJoker(s, "mirror")) {
        const c = p.cards[0],
          mod = c.modifiers?.find((m) => !["echo", "dual"].includes(m));
        if (mod) this.enhancement(mod, c, p, "Осколок зеркала");
      }
      if (
        hasJoker(s, "architect") &&
        hasJoker(s, "border") &&
        p.cards.some((c) => c.turnsUsed === 2 && c.usedOuterBorder)
      )
        p.add(
          "Синергия: внешняя архитектура",
          "chips",
          80,
          7,
          "synergy:architecture",
        );
      if (
        hasJoker(s, "flush") &&
        hasJoker(s, "baron") &&
        p.evaluation.flush &&
        p.cards.every((c) => c.suit === "hearts")
      )
        p.add("Синергия: алый прилив", "xMult", 1.3, 9, "synergy:red");
    }
    if (type === "beforeScore" || type === "onCardScored") {
      for (let i = 1; i < s.jokers.length; i++)
        if (s.jokers[i].id === "copyist") {
          const left = s.jokers[i - 1];
          if (left.id === "eternal" && type === "beforeScore") {
            p.add(
              "Левый летописец → Вечный коллекционер",
              "chips",
              left.count || 0,
              7,
              "copy:eternal",
            );
          } else if (
            !["copyist", "mirror"].includes(left.id) &&
            jokerById(left.id).trigger.includes(type)
          ) {
            this.joker(left, type, p, "Левый летописец → ");
          }
        }
    }
  }
  joker(j, type, p, prefix = "") {
    const s = this.game.state,
      c = p.card,
      def = jokerById(j.id),
      add = (kind, n, phase = kind === "chips" ? 7 : kind === "mult" ? 8 : 9) =>
        p.add?.(
          prefix + def.name,
          kind,
          n,
          phase,
          `${j.uid}:${type}:${c?.instanceId || "hand"}:${prefix}`,
        ),
      gold = (n) => this.game.gainGold(n);
    let active = false;
    if (type === "onCardCollected") {
      if (j.id === "treasurer" && c.suit === "clubs") {
        gold(1);
        active = true;
      }
      if (j.id === "merchant" && c.suit === "diamonds") {
        j.count = (j.count || 0) + 1;
        if (j.count % 2 === 0) {
          gold(3);
          active = true;
        }
      }
    } else if (type === "onPairDestroyed" && j.id === "shadow") {
      gold(2);
      s.score += 15;
      s.stats.totalScore += 15;
      active = true;
    } else if (
      type === "onStageStart" &&
      j.id === "spendthrift" &&
      s.gold >= 2
    ) {
      s.gold -= 2;
      s.handsLeft++;
      active = true;
    } else if (type === "onStageWon" && j.id === "banker") {
      const n = Math.min(12, Math.floor(s.gold * 0.2));
      gold(n);
      p.interest = (p.interest || 0) + n;
      active = n > 0;
    } else if (type === "onCardScored") {
      if (j.id === "baron" && c.suit === "hearts") {
        add("mult", 0.4);
        active = true;
      }
      if (j.id === "king" && c.rank === 13) {
        add("chips", 45, 6);
        active = true;
      }
      if (j.id === "knight" && c.suit === "spades") {
        add("chips", 24, 6);
        active = true;
      }
      if (j.id === "architect" && c.turnsUsed === 2) {
        add("chips", 35, 6);
        active = true;
      }
      if (j.id === "straightway" && c.turnsUsed === 0) {
        add("chips", 30, 6);
        active = true;
      }
      if (j.id === "border" && c.usedOuterBorder) {
        add("mult", 0.5);
        active = true;
      }
      if (j.id === "aces" && c.rank === 14) {
        add("chips", 55, 6);
        active = true;
      }
      if (j.id === "doubleheart" && c.echo) {
        add("chips", 15, 6);
        active = true;
      }
    } else if (type === "beforeScore") {
      const e = p.evaluation;
      if (j.id === "narrow") {
        add("xMult", 2);
        active = true;
      }
      if (j.id === "pairs" && ["pair", "twoPair"].includes(e.rankCategory)) {
        add("chips", 100);
        active = true;
      }
      if (
        j.id === "triple" &&
        ["threeOfKind", "fullHouse"].includes(e.rankCategory)
      ) {
        add("chips", 180);
        active = true;
      }
      if (
        j.id === "quad" &&
        ["fourOfKind", "fiveOfKind"].includes(e.rankCategory)
      ) {
        add("xMult", 2);
        active = true;
      }
      if (j.id === "flush" && e.flush) {
        add("mult", 2);
        active = true;
      }
      if (j.id === "sequence" && e.straight) {
        add("chips", 220);
        add("mult", 1);
        active = true;
      }
      if (j.id === "hunter") {
        add(
          s.boss === "night" ? "xMult" : "chips",
          s.boss === "night" ? 2.5 : 40,
        );
        active = true;
      }
      if (j.id === "mad") {
        add("mult", this.game.rng.next() < 0.5 ? 2 : -0.4);
        active = true;
      }
      if (j.id === "crown") {
        add("xMult", this.game.rng.next() < 0.75 ? 2.5 : 0.7);
        active = true;
      }
      if (
        j.id === "elements" &&
        new Set(p.cards.map((c) => c.suit)).size === 4
      ) {
        add("mult", 2);
        active = true;
      }
      if (j.id === "eternal") {
        j.seenRanks ??= {};
        for (const c of p.cards) {
          if (j.seenRanks[c.rank]) j.count = (j.count || 0) + 3;
          j.seenRanks[c.rank] = true;
        }
        add("chips", j.count || 0);
        active = true;
      }
    }
    if (active) {
      s.effectLog.push({
        sourceId: j.id,
        event: type,
        label: prefix + def.name,
      });
      s.effectLog = s.effectLog.slice(-40);
    }
  }
  enhancement(id, c, p, prefix = "") {
    const s = this.game.state,
      key = identity(c),
      name = prefix
        ? `${prefix}: ${enhancementById(id).name}`
        : enhancementById(id).name;
    const add = (kind, n) =>
      p.add(
        name,
        kind,
        n,
        kind === "chips" ? 5 : kind === "mult" ? 8 : 9,
        `${c.instanceId}:${id}:${prefix}`,
      );
    switch (id) {
      case "gold":
        add("chips", 25);
        break;
      case "silver":
        add("mult", 0.5);
        break;
      case "lucky":
        if (this.game.rng.next() < 0.35) {
          add("chips", 70);
          this.game.gainGold(1);
        }
        break;
      case "fire":
        add("chips", s.boss ? 60 : 35);
        break;
      case "ice":
        add("chips", p.cards.filter((x) => x.suit === c.suit).length * 12);
        break;
      case "glass":
        if (!s.dormant[key]) {
          add("xMult", 1.8);
          if (this.game.rng.next() < 0.25) {
            s.dormant[key] = true;
            p.add(
              `${name}: уснула до следующего этапа`,
              "note",
              0,
              9,
              `${c.instanceId}:sleep`,
            );
          }
        }
        break;
      case "magnetic":
        add(
          "chips",
          (p.cards.filter((x) => x.rank === c.rank).length - 1) * 18,
        );
        break;
      case "royal":
        add("chips", [11, 12, 13].includes(c.rank) ? 55 : 10);
        break;
      case "diamond":
        this.game.gainGold(1);
        p.add(name, "gold", 1, 5, `${c.instanceId}:gold:${prefix}`);
        break;
      case "ancient":
        add("chips", (s.stage - 1) * 12);
        break;
      case "growing":
        s.cardGrowth[key] = (s.cardGrowth[key] || 0) + 8;
        add("chips", s.cardGrowth[key]);
        break;
      case "cursed":
        add("xMult", 2.2);
        break;
      case "echo":
      case "dual":
        break;
      default:
        throw Error(`Неизвестное улучшение ${id}`);
    }
  }
  prepareCard(tile, path) {
    const s = this.game.state,
      mods = modifiersFor(s, tile);
    return {
      ...tile,
      ...path,
      instanceId: `card-${++s.cardSerial}`,
      modifiers: mods,
      secondarySuit: mods.includes("dual")
        ? SUITS[(SUITS.indexOf(tile.suit) + 1) % 4]
        : null,
      echo: mods.includes("echo"),
    };
  }
}
