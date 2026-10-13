import {
  CONFIG,
  SUITS,
  identity,
  STAGE_TARGETS,
  STAGE_REWARDS,
  RARITIES,
} from "../config.js";
import { SeededRandom } from "./SeededRandom.js";
import { EventBus } from "./EventBus.js";
import {
  SaveManager,
  defaultMeta,
  defaultSettings,
  validateState,
} from "./SaveManager.js";
import {
  createDeck,
  deckIdentities,
  transformBlueprint,
} from "../cards/CardCollection.js";
import { generateBoard, shuffleBoard, ensureMove } from "../board/Board.js";
import { findPath, availablePairs } from "../board/PathFinder.js";
import { moveBoard } from "../board/MovementEngine.js";
import { scoreHand } from "../cards/ScoringEngine.js";
import {
  EffectEngine,
  rulesFor,
  hasJoker,
  canEnhance,
  modifiersFor,
} from "../roguelite/EffectEngine.js";
import { JOKERS, jokerById } from "../data/jokers.js";
import {
  BOOSTERS,
  BOSSES,
  ENHANCEMENTS,
  RITUALS,
  CONTRACTS,
  EVENTS,
} from "../data/catalog.js";
import { MOVEMENTS } from "../data/movementModes.js";
import { checkAchievements, isUnlocked } from "../data/unlocks.js";

export class Game {
  constructor(save = new SaveManager()) {
    this.saveManager = save;
    const data = save.load();
    this.state = data?.run || null;
    this.meta = data?.meta || defaultMeta();
    this.settings = { ...defaultSettings(), ...data?.settings };
    this.rng = new SeededRandom(
      this.state?.seed || "labyrinth",
      this.state?.rngState,
    );
    this.bus = new EventBus();
    this.effects = new EffectEngine(this);
    this.events = [];
  }
  get rules() {
    return this.state ? rulesFor(this.state) : {};
  }
  persist() {
    if (this.state) this.state.rngState = this.rng.state;
    return this.saveManager.save(this.state, this.meta, this.settings);
  }
  setSettings(values) {
    Object.assign(this.settings, values);
    this.persist();
  }
  gainGold(n) {
    if (n <= 0) return;
    this.state.gold += n;
    this.state.stats.goldEarned += n;
  }
  notice(text) {
    this.events.push({ type: "notice", text });
  }
  transact(action, args = {}, revision = this.state?.revision) {
    if (this.state && revision !== this.state.revision)
      return { ok: false, error: "Это действие уже обработано." };
    const previous = this.state ? structuredClone(this.state) : null,
      meta = structuredClone(this.meta),
      rngState = this.rng.state;
    this.events = [];
    try {
      if (
        ![
          "newRun",
          "chooseBooster",
          "beginStage",
          "connect",
          "shuffle",
          "openShop",
          "buy",
          "sell",
          "reroll",
          "nextStage",
          "useRitual",
          "discardRitual",
          "chooseChest",
          "chooseEvent",
          "finishRun",
          "debug",
        ].includes(action)
      )
        throw Error("Неизвестное действие");
      this[action](args);
      this.state.revision++;
      this.state.rngState = this.rng.state;
      const unlocked = checkAchievements(this.state, this.meta);
      for (const id of unlocked) this.events.push({ type: "achievement", id });
      validateState(this.state);
      const saved = this.persist();
      return {
        ok: true,
        events: this.events,
        saved,
        error: saved ? null : this.saveManager.error,
      };
    } catch (e) {
      this.state = previous;
      this.meta = meta;
      this.rng = new SeededRandom(previous?.seed || "labyrinth", rngState);
      return { ok: false, error: e.message };
    }
  }
  require(...phases) {
    if (!this.state || !phases.includes(this.state.phase))
      throw Error("Сейчас это действие недоступно.");
  }
  newRun({ seed = "LABYRINTH" } = {}) {
    this.rng = new SeededRandom(String(seed).slice(0, 64));
    this.meta.runs++;
    this.state = {
      seed: this.rng.seed,
      rngState: this.rng.state,
      revision: 0,
      phase: "booster",
      stage: 1,
      deck: createDeck(),
      modifiers: {},
      temporaryModifiers: {},
      dormant: {},
      cardGrowth: {},
      handLevels: {},
      board: [],
      hand: [],
      reserve: [],
      jokers: [],
      rituals: [],
      gold: CONFIG.startingGold,
      score: 0,
      target: 350,
      handsLeft: 4,
      manualShuffles: 2,
      banishes: 2,
      cardSerial: 0,
      itemSerial: 0,
      booster: null,
      boosterChoices: this.rng
        .shuffle(BOOSTERS.filter((x) => isUnlocked(x, this.meta)))
        .slice(0, 3)
        .map((x) => x.id),
      extraJokerSlots: 0,
      extraRitualSlots: 0,
      stageStats: {},
      stats: {
        totalScore: 0,
        bestHand: 0,
        goldEarned: 0,
        upgrades: 0,
        echoScored: 0,
      },
      temp: {},
      nextTemp: {},
      shop: null,
      lastScore: null,
      reward: null,
      effectLog: [],
      paidStages: [],
      boss: null,
      freeUpgradeUsed: false,
      contract: null,
      chest: null,
      event: null,
    };
    this.bus.emit("onRunStart", { state: this.state });
  }
  chooseBooster({ id }) {
    this.require("booster");
    const s = this.state;
    if (!s.boosterChoices.includes(id))
      throw Error("Выберите предложенное усиление.");
    s.booster = id;
    const b = BOOSTERS.find((x) => x.id === id).effects;
    if (b.gold) this.gainGold(b.gold);
    if (b.echo)
      for (const c of this.rng.shuffle(deckIdentities(s.deck)).slice(0, b.echo))
        s.modifiers[c.id] = ["echo"];
    if (b.randomUpgrades)
      for (const c of this.rng
        .shuffle(deckIdentities(s.deck))
        .slice(0, b.randomUpgrades))
        s.modifiers[c.id] = [this.rng.pick(ENHANCEMENTS).id];
    this.prepareStage();
  }
  prepareStage() {
    const s = this.state;
    s.phase = "briefing";
    s.boss =
      s.stage % 3 === 0
        ? this.rng.pick(BOSSES.filter((b) => isUnlocked(b, this.meta))).id
        : null;
    s.temp = { ...s.nextTemp };
    s.nextTemp = {};
    s.temporaryModifiers = {};
    s.dormant = {};
    s.cursedSuit = this.rng.pick(SUITS);
    s.movement =
      s.stage === 1
        ? "static"
        : this.rng.pick(MOVEMENTS.filter((m) => isUnlocked(m, this.meta))).id;
    s.target = Math.round(
      (STAGE_TARGETS[s.stage - 1] ||
        STAGE_TARGETS.at(-1) * Math.pow(1.48, s.stage - 8)) *
        (s.boss === "greed" ? 1.3 : 1),
    );
    s.score = 0;
    s.handsLeft = this.rules.hands;
    s.manualShuffles = this.rules.shuffles;
    s.banishes = this.rules.banishes + (s.temp.banishes || 0);
    s.hand = [];
    s.reserve = [];
    s.lastScore = null;
    s.reward = null;
    s.stageStats = {
      pairs: 0,
      banished: 0,
      manualShuffles: 0,
      flush: false,
      twoPair: false,
      maxTurns: 0,
    };
    s.contractOffer = this.rng.pick(CONTRACTS).id;
    s.contract = null;
    s.board = generateBoard(s.deck, this.rng, this.rules.turns);
    this.bus.emit("onStageStart", {});
    this.events.push({ type: "stage", boss: s.boss });
  }
  beginStage({ contract = false } = {}) {
    this.require("briefing");
    this.state.contract = contract ? this.state.contractOffer : null;
    this.state.phase = "playing";
  }
  connect({ a, b, mode = "collect", free = false } = {}) {
    this.require("playing");
    const s = this.state;
    if (mode !== "collect" && mode !== "banish")
      throw Error("Неизвестный режим");
    if (free)
      throw Error("Бесплатное уничтожение доступно только через ритуал.");
    this.removePair(a, b, mode, false);
  }
  removePair(a, b, mode, free) {
    const s = this.state;
    if (!Number.isInteger(a) || !Number.isInteger(b))
      throw Error("Выберите две карты.");
    const path = findPath(s.board, a, b, this.rules.turns);
    if (!path)
      throw Error(
        "Пара недоступна: нужна одинаковая карта и свободный маршрут.",
      );
    if (mode === "banish" && !free && s.banishes < 1)
      throw Error("Не осталось уничтожений.");
    const tile = { ...s.board[a] },
      before = [...s.board];
    s.board[a] = null;
    s.board[b] = null;
    s.stageStats.pairs++;
    this.events.push({
      type: "pair",
      a,
      b,
      path,
      tile,
      mode,
      before,
      handSlot: Math.min(4, s.hand.length + s.reserve.length),
    });
    if (mode === "banish") {
      if (!free) s.banishes--;
      s.stageStats.banished++;
      this.bus.emit("onPairDestroyed", { card: tile, path });
    } else {
      this.bus.emit("onPairConnected", { card: tile, path });
      s.stageStats.maxTurns = Math.max(s.stageStats.maxTurns, path.turnsUsed);
      if (s.reserve.length) {
        s.hand.push(...s.reserve);
        s.reserve = [];
      }
      const card = this.effects.prepareCard(tile, {
        turnsUsed: path.turnsUsed,
        usedOuterBorder: path.usedOuterBorder,
      });
      if (card.modifiers.includes("cursed")) {
        if (s.banishes) s.banishes--;
        else {
          const penalty = Math.min(s.score, 20);
          s.score -= penalty;
          s.stats.totalScore = Math.max(0, s.stats.totalScore - penalty);
          this.notice(`Проклятая карта: −${penalty} очков этапа.`);
        }
      }
      const n = card.echo ? (hasJoker(s, "doubleheart") ? 3 : 2) : 1;
      // Collection/economy is per successful connection, not per generated echo.
      this.bus.emit("onCardCollected", { card });
      for (let i = 0; i < n; i++) {
        const copy = {
          ...card,
          instanceId: i === 0 ? card.instanceId : `card-${++s.cardSerial}`,
        };
        if (s.hand.length < CONFIG.handSize) s.hand.push(copy);
        else if (s.reserve.length < CONFIG.reserveLimit) s.reserve.push(copy);
        else {
          s.score += CONFIG.reserveBonus;
          s.stats.totalScore += CONFIG.reserveBonus;
          this.notice(`Резерв полон: +${CONFIG.reserveBonus} очков.`);
        }
      }
      this.events.push({
        type: "collect",
        cards: structuredClone(s.hand),
        reserve: structuredClone(s.reserve),
        count: n,
      });
    }
    s.board = moveBoard(s.board, s.movement);
    if (
      s.boss === "chaos" &&
      !s.temp.cleansed &&
      s.stageStats.pairs % 4 === 0
    ) {
      s.board = shuffleBoard(s.board, this.rng, this.rules.turns);
      this.events.push({ type: "shuffle", automatic: true });
    }
    if (s.hand.length === CONFIG.handSize) this.resolveHand();
    if (s.phase === "playing") {
      this.checkEnd();
      if (s.phase === "playing") this.ensureBoard();
    }
  }
  resolveHand() {
    const s = this.state;
    const cards = [...s.hand];
    const result = scoreHand(this, cards);
    s.lastScore = result;
    s.score += result.finalScore;
    s.stats.totalScore += result.finalScore;
    s.stats.bestHand = Math.max(s.stats.bestHand, result.finalScore);
    s.stats.echoScored += cards.filter((c) => c.echo).length;
    s.stageStats.flush ||= result.evaluation.flush;
    s.stageStats.twoPair ||= result.evaluation.rankCategory === "twoPair";
    s.handsLeft--;
    s.hand = [];
    if (s.boss === "reflection" && !s.temp.cleansed)
      s.board = moveBoard(s.board, "mirrorX");
    this.events.push({ type: "score", result });
  }
  checkEnd() {
    const s = this.state;
    if (s.score >= s.target || s.handsLeft <= 0) {
      if (s.reserve.length) {
        const bonus = s.reserve.length * CONFIG.reserveBonus;
        s.score += bonus;
        s.stats.totalScore += bonus;
        s.reserve = [];
        this.notice(`Резерв завершённого этапа: +${bonus} очков.`);
      }
      if (s.score >= s.target) {
        this.winStage();
        return;
      }
      this.lose("Руки закончились, а цель ещё не достигнута.");
      return;
    }
    const copies =
      s.board
        .filter(Boolean)
        .reduce(
          (n, c) =>
            n +
            (modifiersFor(s, c).includes("echo")
              ? hasJoker(s, "doubleheart")
                ? 3
                : 2
              : 1),
          0,
        ) / 2;
    if (copies + s.hand.length + s.reserve.length < CONFIG.handSize)
      this.lose(
        "На поле осталось недостаточно карт для следующей полной руки.",
      );
  }
  ensureBoard() {
    const s = this.state,
      result = ensureMove(s.board, this.rng, this.rules.turns);
    s.board = result.board;
    if (result.shuffled) {
      this.events.push({ type: "shuffle", automatic: true });
      this.notice("Доступных пар не осталось. Бесплатное перемешивание.");
    }
  }
  shuffle() {
    this.require("playing");
    const s = this.state;
    if (!s.manualShuffles) throw Error("Перемешивания закончились.");
    s.board = shuffleBoard(s.board, this.rng, this.rules.turns);
    s.manualShuffles--;
    s.stageStats.manualShuffles++;
    this.events.push({ type: "shuffle" });
  }
  contractMet() {
    const s = this.state,
      t = s.stageStats;
    return (
      {
        noShuffle: t.manualShuffles === 0,
        flush: t.flush,
        noBanish: t.banished === 0,
        twoPair: t.twoPair,
        oneTurn: t.maxTurns <= 1,
        spare: s.handsLeft >= 1,
      }[s.contract] || false
    );
  }
  winStage() {
    const s = this.state;
    if (s.paidStages.includes(s.stage)) return;
    s.paidStages.push(s.stage);
    s.phase = "reward";
    const base = Math.max(
        1,
        STAGE_REWARDS[s.stage - 1] || 18 + Math.floor((s.stage - 8) * 1.5),
      ),
      efficiency = Math.max(0, s.handsLeft),
      contract =
        s.contract && this.contractMet()
          ? CONTRACTS.find((c) => c.id === s.contract).reward
          : 0;
    const reward = {
      base,
      efficiency,
      contract,
      interest: 0,
      boss: s.boss ? 4 : 0,
      penalty: this.rules.reward,
      total: 0,
    };
    if (s.boss === "bank") reward.penalty -= Math.floor(base / 2);
    const start = s.gold;
    this.gainGold(
      Math.max(0, base + efficiency + contract + reward.boss + reward.penalty),
    );
    this.bus.emit("onStageWon", reward);
    reward.total = s.gold - start;
    s.reward = reward;
    this.events.push({ type: "win", reward });
  }
  lose(reason) {
    this.state.phase = "lost";
    this.state.lossReason = reason;
    this.bus.emit("onStageLost", { reason });
    this.bus.emit("onRunEnded", { won: false });
    this.events.push({ type: "lose" });
  }
  openShop() {
    this.require("reward");
    const s = this.state;
    if (s.boss) {
      s.phase = "chest";
      const unlocked = (id) => this.meta.achievements.includes(id);
      const rarity =
        s.stage >= 9 || unlocked("score10000")
          ? "legendary"
          : s.stage >= 6 || unlocked("five") || unlocked("upgrades10")
            ? "epic"
            : s.boss === "bank" || unlocked("gold100") || unlocked("bossClean")
              ? "rare"
              : "common";
      s.chest = this.makeChest(rarity, "shop");
    } else if (s.stage % 2 === 0) {
      s.phase = "event";
      s.event = { id: this.rng.pick(EVENTS).id, claimed: false };
    } else this.enterShop();
  }
  enterShop() {
    const s = this.state;
    s.phase = "shop";
    s.shop = { visit: s.stage, rerolls: 0, bought: 0, offers: [] };
    this.rollOffers();
    this.bus.emit("onShopOpened", {});
    this.events.push({ type: "shop" });
  }
  randomJoker(minRarity = null, exclude = []) {
    const pool = JOKERS.filter(
      (j) =>
        isUnlocked(j, this.meta) &&
        !hasJoker(this.state, j.id) &&
        !exclude.includes(j.id) &&
        (!minRarity ||
          Object.keys(RARITIES).indexOf(j.rarity) >=
            Object.keys(RARITIES).indexOf(minRarity)),
    );
    if (!pool.length) return null;
    const tiers = [...new Set(pool.map((j) => j.rarity))];
    const rarity = this.rng.weighted(tiers, (r) => RARITIES[r].weight);
    return this.rng.pick(pool.filter((j) => j.rarity === rarity));
  }
  offer(type, id, price, extra = {}) {
    const s = this.state;
    return {
      uid: `offer-${++s.itemSerial}`,
      type,
      id,
      price,
      sold: false,
      ...extra,
    };
  }
  rollOffers() {
    const s = this.state,
      offers = [];
    for (let i = 0; i < 3; i++) {
      const j = this.randomJoker(
        null,
        offers.filter((o) => o.type === "joker").map((o) => o.id),
      );
      offers.push(
        j
          ? this.offer("joker", j.id, j.price)
          : this.offer("special", "level", 9),
      );
    }
    for (let i = 0; i < 2; i++) {
      const mod = this.rng.pick(ENHANCEMENTS);
      offers.push(
        this.offer("enhancement", mod.id, mod.price, {
          options: this.rng
            .shuffle(deckIdentities(s.deck))
            .slice(0, this.rules.targetOptions)
            .map((c) => c.id),
        }),
      );
    }
    const ritual = this.rng.pick(
      RITUALS.filter((r) => isUnlocked(r, this.meta)),
    );
    offers.push(this.offer("ritual", ritual.id, ritual.price));
    const special = this.rng.pick([
      "transform",
      "jokerSlot",
      "ritualSlot",
      "level",
      "chest",
    ]);
    offers.push(
      this.offer(
        "special",
        special,
        { transform: 7, jokerSlot: 15, ritualSlot: 9, level: 8, chest: 10 }[
          special
        ],
      ),
    );
    s.shop.offers = offers;
  }
  price(offer) {
    const s = this.state;
    if (
      offer.type === "enhancement" &&
      s.booster === "smith" &&
      !s.freeUpgradeUsed
    )
      return 0;
    let price = offer.price;
    if (s.shop?.bought === 0) price -= this.rules.discount;
    if (offer.id === "transform" && hasJoker(s, "alchemist")) price -= 3;
    return Math.max(1, price);
  }
  buy({ uid, targets = [], blueprintId, rank, suit, handCategory } = {}) {
    this.require("shop");
    const s = this.state,
      offer = s.shop.offers.find((o) => o.uid === uid);
    if (!offer || offer.sold) throw Error("Товар уже куплен или обновлён.");
    const cost = this.price(offer);
    if (s.gold < cost) throw Error("Не хватает золота.");
    if (offer.type === "joker") {
      if (hasJoker(s, offer.id)) throw Error("Такой джокер уже есть.");
      if (s.jokers.length >= this.rules.jokerSlots)
        throw Error("Нет свободного слота джокера.");
      s.jokers.push({ uid: `joker-${++s.itemSerial}`, id: offer.id, count: 0 });
      this.bus.emit("onJokerPurchased", { id: offer.id });
    } else if (offer.type === "ritual") {
      if (s.rituals.length >= this.rules.ritualSlots)
        throw Error("Нет свободного слота ритуала.");
      s.rituals.push({ uid: `ritual-${++s.itemSerial}`, id: offer.id });
    } else if (offer.type === "enhancement") {
      const keys = [...new Set(targets)];
      if (
        !keys.length ||
        keys.length > this.rules.upgradeTargets ||
        keys.some((k) => !offer.options.includes(k))
      )
        throw Error("Выберите подходящие карты из предложения.");
      for (const key of keys) this.applyEnhancement(key, offer.id);
      s.stats.upgrades++;
      if (cost === 0) s.freeUpgradeUsed = true;
    } else if (offer.id === "transform") {
      this.transform(blueprintId, Number(rank), suit);
    } else if (offer.id === "jokerSlot") s.extraJokerSlots++;
    else if (offer.id === "ritualSlot") s.extraRitualSlots++;
    else if (offer.id === "level") {
      if (
        ![
          "pair",
          "twoPair",
          "threeOfKind",
          "fullHouse",
          "fourOfKind",
          "fiveOfKind",
          "straight",
          "flush",
          "highCard",
        ].includes(handCategory)
      )
        throw Error("Выберите комбинацию.");
      s.handLevels[handCategory] = (s.handLevels[handCategory] || 0) + 1;
    } else if (offer.id === "chest") {
      s.chest = this.makeChest("rare", "shopReturn");
      s.phase = "chest";
    }
    s.gold -= cost;
    offer.sold = true;
    s.shop.bought++;
    this.events.push({ type: "purchase", offer });
  }
  applyEnhancement(key, mod) {
    const s = this.state;
    if (
      !deckIdentities(s.deck).some((c) => c.id === key) ||
      !ENHANCEMENTS.some((m) => m.id === mod) ||
      !canEnhance(s, key, mod)
    )
      throw Error("Улучшение уже есть, несовместимо или заняты все 3 слота.");
    s.modifiers[key] = [...(s.modifiers[key] || []), mod];
    this.bus.emit("onCardUpgraded", { key, mod });
  }
  transform(blueprintId, rank, suit) {
    const s = this.state;
    if (
      s.phase === "playing" &&
      s.board.filter((c) => c?.blueprintId === blueprintId).length === 1
    )
      throw Error(
        "Один экземпляр этой пары уже собран с другой исходной парой. Выберите целую пару.",
      );
    if (s.phase === "playing") transformBlueprint(s, blueprintId, rank, suit);
    else {
      const board = s.board;
      s.board = [];
      transformBlueprint(s, blueprintId, rank, suit);
      s.board = board;
    }
  }
  sell({ uid }) {
    this.require("shop");
    const s = this.state,
      i = s.jokers.findIndex((j) => j.uid === uid);
    if (i < 0) throw Error("Джокер уже продан.");
    const j = s.jokers[i];
    s.jokers.splice(i, 1);
    if (
      s.jokers.length > this.rules.jokerSlots ||
      s.rituals.length > this.rules.ritualSlots
    )
      throw Error("Сначала освободите дополнительные слоты этого джокера.");
    this.gainGold(jokerById(j.id).sellPrice);
    this.bus.emit("onJokerSold", { id: j.id });
  }
  rerollCost() {
    const n = this.state.shop?.rerolls || 0;
    return Math.max(
      1,
      (n === 0 ? 2 : n === 1 ? 4 : 7 + (n - 2) * 4) -
        (hasJoker(this.state, "economist") ? 1 : 0),
    );
  }
  reroll() {
    this.require("shop");
    const cost = this.rerollCost();
    if (this.state.gold < cost) throw Error("Не хватает золота.");
    this.state.gold -= cost;
    this.state.shop.rerolls++;
    this.rollOffers();
  }
  nextStage() {
    this.require("shop");
    this.state.stage++;
    this.prepareStage();
  }
  useRitual({
    uid,
    target,
    blueprintId,
    rank,
    suit,
    copyIdentity,
    a,
    b,
    movement = "down",
  } = {}) {
    this.require("playing");
    const s = this.state,
      index = s.rituals.findIndex((r) => r.uid === uid);
    if (index < 0) throw Error("Ритуал уже использован.");
    const ritual = s.rituals[index];
    switch (ritual.id) {
      case "transform":
        this.transform(blueprintId, Number(rank), suit);
        break;
      case "forge":
        this.applyEnhancement(target, "gold");
        break;
      case "mirror": {
        const c = deckIdentities(s.deck).find((x) => x.id === copyIdentity);
        if (!c) throw Error("Выберите образец.");
        this.transform(blueprintId, c.rank, c.suit);
        break;
      }
      case "mercy":
        s.manualShuffles++;
        break;
      case "sight":
        this.events.push({
          type: "hint",
          pairs: availablePairs(s.board, this.rules.turns),
        });
        break;
      case "rupture":
        this.removePair(a, b, "banish", true);
        break;
      case "hand":
        s.handsLeft++;
        break;
      case "shift":
        if (!["up", "down", "left", "right"].includes(movement))
          throw Error("Выберите направление.");
        s.board = moveBoard(s.board, movement);
        break;
      case "path":
        s.nextTemp.turns = (s.nextTemp.turns || 0) + 1;
        break;
      case "rain":
        this.gainGold(6);
        break;
      case "echo":
        if (
          !deckIdentities(s.deck).some((c) => c.id === target) ||
          modifiersFor(s, {
            rank: Number(target.split("-")[0]),
            suit: target.split("-")[1],
          }).includes("echo")
        )
          throw Error("Выберите карту без Эхо.");
        s.temporaryModifiers[target] = [
          ...(s.temporaryModifiers[target] || []),
          "echo",
        ];
        break;
      case "cleanse":
        if (target && (s.modifiers[target] || []).includes("cursed"))
          s.modifiers[target] = s.modifiers[target].filter(
            (x) => x !== "cursed",
          );
        else if (s.boss && s.boss !== "night" && !s.temp.cleansed) {
          s.temp.cleansed = true;
          if (s.boss === "greed") s.target = Math.round(s.target / 1.3);
          if (s.boss === "dealer") s.handsLeft++;
        } else throw Error("Нет подходящего штрафа для очищения.");
        break;
      default:
        throw Error("Неизвестный ритуал");
    }
    s.rituals.splice(index, 1);
    if (s.phase === "playing") {
      this.checkEnd();
      if (s.phase === "playing") this.ensureBoard();
    }
    this.events.push({ type: "ritual", id: ritual.id });
  }
  discardRitual({ uid }) {
    this.require("shop", "playing");
    const i = this.state.rituals.findIndex((r) => r.uid === uid);
    if (i < 0) throw Error("Ритуал не найден.");
    this.state.rituals.splice(i, 1);
  }
  makeChest(rarity, after) {
    const s = this.state,
      j = this.randomJoker(rarity === "common" ? null : rarity),
      r = this.rng.pick(RITUALS.filter((r) => isUnlocked(r, this.meta))),
      c = this.rng.pick(deckIdentities(s.deck));
    const value = { common: 5, rare: 9, epic: 15, legendary: 24 }[rarity];
    const options = [
      { type: "gold", value },
      { type: "upgrade", target: c.id, id: "echo" },
    ];
    if (j) options.push({ type: "joker", id: j.id });
    else options.push({ type: "slot" });
    options.push(
      this.rng.next() < 0.5
        ? { type: "ritual", id: r.id }
        : {
            type: "transform",
            blueprintId: c.blueprints[0],
            rank: 14,
            suit: c.suit,
          },
    );
    return { rarity, after, options, claimed: false };
  }
  chooseChest({ index }) {
    this.require("chest");
    const s = this.state,
      c = s.chest;
    if (c.claimed || !c.options[index]) throw Error("Награда уже выбрана.");
    const o = c.options[index];
    if (o.type === "gold") this.gainGold(o.value);
    if (o.type === "joker") {
      if (hasJoker(s, o.id) || s.jokers.length >= this.rules.jokerSlots)
        throw Error("Для награды нужен свободный слот.");
      s.jokers.push({ uid: `joker-${++s.itemSerial}`, id: o.id, count: 0 });
    }
    if (o.type === "upgrade") this.applyEnhancement(o.target, o.id);
    if (o.type === "slot") s.extraJokerSlots++;
    if (o.type === "ritual") {
      if (s.rituals.length >= this.rules.ritualSlots)
        throw Error("Слоты ритуалов заполнены. Выберите другую награду.");
      s.rituals.push({ uid: `ritual-${++s.itemSerial}`, id: o.id });
    }
    if (o.type === "transform") this.transform(o.blueprintId, o.rank, o.suit);
    c.claimed = true;
    if (c.after === "shopReturn") s.phase = "shop";
    else this.enterShop();
  }
  chooseEvent({ index }) {
    this.require("event");
    const s = this.state,
      ev = EVENTS.find((e) => e.id === s.event.id),
      o = ev.choices[index];
    if (s.event.claimed || !o) throw Error("Событие уже завершено.");
    if (o.gold) this.gainGold(o.gold);
    if (o.ritual) {
      if (s.rituals.length >= this.rules.ritualSlots)
        throw Error("Нет свободного слота ритуала.");
      s.rituals.push({
        uid: `ritual-${++s.itemSerial}`,
        id: this.rng.pick(RITUALS.filter((r) => isUnlocked(r, this.meta))).id,
      });
    }
    if (o.upgrade) {
      const choices = deckIdentities(s.deck).filter((c) =>
        canEnhance(s, c.id, o.upgrade),
      );
      if (!choices.length) this.gainGold(3);
      else this.applyEnhancement(this.rng.pick(choices).id, o.upgrade);
    }
    if (o.turns) s.nextTemp.turns = (s.nextTemp.turns || 0) + o.turns;
    if (o.banishes)
      s.nextTemp.banishes = (s.nextTemp.banishes || 0) + o.banishes;
    s.event.claimed = true;
    this.enterShop();
  }
  finishRun() {
    this.require("reward", "shop");
    this.state.phase = "ended";
    this.bus.emit("onRunEnded", { won: true });
  }
  debug({ op, value, target }) {
    if (!this.debugEnabled) throw Error("Отладка выключена.");
    const s = this.state;
    switch (op) {
      case "gold":
        this.gainGold(100);
        break;
      case "win":
        if (s.phase !== "playing") throw Error("Начните этап.");
        s.score = s.target;
        this.winStage();
        break;
      case "joker":
        if (!jokerById(value) || hasJoker(s, value))
          throw Error("Неверный джокер");
        s.extraJokerSlots++;
        s.jokers.push({ uid: `joker-${++s.itemSerial}`, id: value, count: 0 });
        break;
      case "enhance":
        this.applyEnhancement(target, value);
        break;
      case "hands":
        s.handsLeft = Math.max(0, Math.min(20, Number(value) || 0));
        if (s.phase === "playing") this.checkEnd();
        break;
      case "movement":
        if (!MOVEMENTS.some((m) => m.id === value))
          throw Error("Неверное движение");
        s.movement = value;
        break;
      case "boss": {
        if (!BOSSES.some((b) => b.id === value)) throw Error("Неверный босс");
        const oldHands = this.rules.hands;
        if (s.boss === "greed" && !s.temp.cleansed)
          s.target = Math.round(s.target / 1.3);
        s.boss = value;
        s.temp.cleansed = false;
        if (value === "greed") s.target = Math.round(s.target * 1.3);
        s.handsLeft = Math.max(1, s.handsLeft + this.rules.hands - oldHands);
        this.ensureBoard();
        break;
      }
      default:
        throw Error("Неизвестная команда");
    }
  }
}
