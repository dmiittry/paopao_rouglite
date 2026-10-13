import {
  CONFIG,
  SYMBOLS,
  SUIT_NAMES,
  rankLabel,
  identity,
  HAND_NAMES,
  RARITIES,
} from "../config.js";
import { deckIdentities } from "../cards/CardCollection.js";
import { evaluatePoker } from "../cards/PokerEvaluator.js";
import { availablePairs } from "../board/PathFinder.js";
import { canEnhance, modifiersFor } from "../roguelite/EffectEngine.js";
import { JOKERS, jokerById } from "../data/jokers.js";
import {
  BOOSTERS,
  BOSSES,
  ENHANCEMENTS,
  RITUALS,
  CONTRACTS,
  EVENTS,
  enhancementById,
} from "../data/catalog.js";
import { MOVEMENTS } from "../data/movementModes.js";
import { ACHIEVEMENTS, isUnlocked } from "../data/unlocks.js";
import { AudioManager } from "./AudioManager.js";
import { AnimationManager } from "./AnimationManager.js";
import { ParticleManager } from "./ParticleManager.js";
import { emblem, escapeHTML as esc } from "./art.js";
const fmt = (n) => Math.floor(n || 0).toLocaleString("ru-RU");
const btn = (action, label, cls = "", attrs = "") =>
  `<button class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const labelCard = (c) => `${rankLabel(c.rank)}${SYMBOLS[c.suit]}`;
const SPECIALS = {
  transform: [
    "Преобразование",
    "Замените ранг и масть одной исходной пары. На следующем поле останется 104 плитки.",
    "⇌",
  ],
  jokerSlot: [
    "Тайный карман",
    "Добавьте один постоянный слот для джокера.",
    "▣",
  ],
  ritualSlot: [
    "Футляр ритуалов",
    "Добавьте один постоянный слот для ритуала.",
    "▤",
  ],
  level: [
    "Трактат о комбинациях",
    "Выбранная комбинация получает +35 базовых очков до конца забега.",
    "▥",
  ],
  chest: [
    "Запечатанный ларец",
    "Выберите одну из четырёх наград редкого сундука.",
    "◇",
  ],
};

export class UIManager {
  constructor(game) {
    this.game = game;
    this.app = document.querySelector("#app");
    this.dialog = document.querySelector("#dialog");
    this.page = "menu";
    this.category = "jokers";
    this.selected = null;
    this.mode = "collect";
    this.busy = false;
    this.audio = new AudioManager(game.settings);
    this.anim = new AnimationManager(game.settings);
    this.particles = new ParticleManager(game.settings);
    this.toastTimer = 0;
    this.focusTile = 0;
    document.addEventListener("click", (e) => this.click(e));
    document.addEventListener("contextmenu", (e) => {
      const tile = e.target.closest("[data-index]");
      if (tile) {
        e.preventDefault();
        this.chooseTile(Number(tile.dataset.index), "banish");
      }
    });
    document.addEventListener("submit", (e) => this.submit(e));
    document.addEventListener("change", (e) => this.change(e));
    document.addEventListener("keydown", (e) => this.keydown(e));
    this.dialog.addEventListener("cancel", () => {
      this.selected = null;
    });
    this.app.addEventListener("pointermove", (e) => this.flashlight(e));
    this.app.addEventListener("focusin", (e) => {
      const tile = e.target.closest("[data-index]");
      if (tile) {
        const r = tile.getBoundingClientRect();
        this.flashlight({
          clientX: r.x + r.width / 2,
          clientY: r.y + r.height / 2,
        });
      }
    });
  }
  toast(message) {
    const el = document.querySelector("#toast");
    el.textContent = message;
    el.classList.add("visible");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove("visible"), 3800);
  }
  close() {
    if (this.dialog.open) this.dialog.close();
    this.dialog.innerHTML = "";
  }
  modal(title, content, wide = false) {
    this.close();
    this.dialog.className = wide ? "wide" : "";
    this.dialog.innerHTML = `<div class="dialog-head"><h2>${title}</h2>${btn("close", "✕", "icon-button", 'aria-label="Закрыть"')}</div>${content}`;
    this.dialog.showModal();
  }
  header(section = "") {
    return `<header class="site-header"><button class="brand" data-action="menu"><span class="brand-mark">J</span><span>ЛАБИРИНТ ДЖОКЕРА<small>CARD CONNECT · ROGUELITE</small></span></button>${section ? `<span class="header-section">${section}</span>` : ""}<nav>${btn("help", "?", "icon-button", 'aria-label="Как играть"')}${btn("settings", "⚙", "icon-button", 'aria-label="Настройки"')}${btn("sound", this.game.settings.sound ? "♪" : "♩", "icon-button", `aria-label="${this.game.settings.sound ? "Выключить" : "Включить"} звук"`)}</nav></header>`;
  }
  render() {
    this.selected = null;
    const s = this.game.state;
    document.body.dataset.speed = this.game.settings.speed;
    this.app.innerHTML =
      this.page === "menu"
        ? this.menu()
        : this.page === "collection"
          ? this.collection()
          : this.page === "achievements"
            ? this.achievements()
            : this.page === "exit"
              ? this.exit()
              : !s
                ? this.menu()
                : s.phase === "booster"
                  ? this.booster()
                  : s.phase === "shop"
                    ? this.shop()
                    : s.phase === "chest"
                      ? this.chest()
                      : s.phase === "event"
                        ? this.event()
                        : this.play();
  }
  menu() {
    const s = this.game.state,
      canContinue = s && !["lost", "ended"].includes(s.phase);
    return `${this.header()}<main class="menu-screen"><div class="menu-copy"><div class="eyebrow"><span></span> КАРТОЧНЫЙ ROGUELITE С НОВЫМ ПОВОРОТОМ</div><h1>Лабиринт<br><em>Джокера</em><span class="title-diamond">◇</span></h1><p class="menu-description">Соединяй карты. Собирай комбинации.<br>Создавай невозможную колоду.</p><div class="menu-actions">${btn("new", "Новый забег <span>↗</span>", "primary large")}${btn("continue", canContinue ? `Продолжить <small>Этап ${s.stage} · ${fmt(s.score)} очков</small>` : "Продолжить забег", "secondary large", canContinue ? "" : "disabled")}<div class="minor-menu">${btn("collection", "Коллекция <span>↗</span>")}${btn("achievements", "Достижения <span>↗</span>")}${btn("help", "Как играть <span>↗</span>")}${btn("exit", "Выход <span>↗</span>")}</div></div><div class="menu-record"><span>ВАШ РЕКОРД <strong>${fmt(this.game.meta.bestScore)}</strong></span><span>ГЛУБИНА <strong>${this.game.meta.bestStage} <small>этапов</small></strong></span></div></div><div class="menu-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="art-star star-one">✧</div><div class="art-star star-two">✦</div><div class="hero-card hero-left"><span class="corner">K<br>♥</span><span class="hero-suit">♥</span><span class="card-caption">СОЕДИНИ</span></div><div class="hero-card hero-right"><span class="corner">A<br>♠</span><span class="hero-suit">♠</span><span class="card-caption">СОБЕРИ</span></div><div class="hero-joker">${emblem("labyrinth", "J")}<span>THE LABYRINTH</span><small>EVERY PAIR IS A POSSIBILITY</small><div class="joker-ornament">◇ ─── ✦ ─── ◇</div></div><div class="art-caption"><span>52 пары</span><i>✦</i><span>Бесконечные возможности</span></div></div></main><footer class="menu-footer"><span>ONET CONNECT <i>×</i> POKER <i>×</i> ROGUELITE</span><span>Сохраняется автоматически <b>●</b></span></footer>`;
  }
  booster() {
    const s = this.game.state;
    return `${this.header("НОВЫЙ ЗАБЕГ")}<main class="center-screen"><div class="eyebrow">ПЕРВЫЙ ВЫБОР МЕНЯЕТ ВСЁ</div><h1 class="screen-title">С чего начнётся <em>ваш путь?</em></h1><p class="subtle">Выберите одно стартовое усиление. Оно останется с вами до конца забега.</p><div class="booster-grid">${s.boosterChoices
      .map((id, i) => {
        const b = BOOSTERS.find((x) => x.id === id);
        return `<button class="booster-card" data-action="chooseBooster" data-id="${id}"><span class="catalog-index">0${i + 1} / НАЧАЛО</span>${emblem(id, b.icon)}<h2>${b.name}</h2><p>${b.description}</p><span class="card-cta">Выбрать путь <b>↗</b></span></button>`;
      })
      .join(
        "",
      )}</div><div class="seed-label">SEED: ${esc(s.seed)}</div></main>`;
  }
  tile(c, index = null, extra = "", mods = null) {
    if (!c) return `<div class="empty-cell"></div>`;
    const s = this.game.state,
      m = mods ?? (s ? modifiersFor(s, c) : []),
      text = `${rankLabel(c.rank)} ${SUIT_NAMES[c.suit]}${m.length ? " · " + m.map((id) => enhancementById(id)?.name).join(", ") : ""}`;
    return `<${index === null ? "div" : "button"} class="playing-card ${c.suit} ${m.length ? "enhanced" : ""} ${m.includes("echo") ? "echo" : ""} ${extra}" ${index === null ? "" : `data-index="${index}" data-tile-id="${c.id}" aria-label="${esc(text)}"`} title="${esc(text)}"><span class="card-top">${rankLabel(c.rank)} <span>${SYMBOLS[c.suit]}</span></span><span class="suit-big">${SYMBOLS[c.suit]}</span><strong class="rank-big">${rankLabel(c.rank)}</strong><span class="card-bottom">${SYMBOLS[c.suit]} ${rankLabel(c.rank)}</span>${m.length ? `<span class="mod-badges">${m.map((id) => `<i>${enhancementById(id)?.icon || "✦"}</i>`).join("")}</span>` : ""}</${index === null ? "div" : "button"}>`;
  }
  inventory(shop = false) {
    const s = this.game.state,
      r = this.game.rules;
    return `<div class="side-heading">ДЖОКЕРЫ <span>${s.jokers.length} / ${r.jokerSlots}</span></div><div class="joker-list">${s.jokers
      .map((j) => {
        const d = jokerById(j.id);
        return `<button class="joker-mini ${d.rarity}" data-action="inspectJoker" data-uid="${j.uid}" title="${esc(d.description)}">${emblem(j.id, d.icon)}<span><b>${d.name}</b><small>${d.description}</small>${j.count ? `<em>Накоплено: ${j.count}</em>` : ""}</span></button>`;
      })
      .join(
        "",
      )}${Array.from({ length: Math.max(0, r.jokerSlots - s.jokers.length) }, (_, i) => `<div class="joker-empty"><span>＋</span> Слот джокера ${s.jokers.length + i + 1}</div>`).join("")}</div><div class="side-heading ritual-heading">РИТУАЛЫ <span>${s.rituals.length} / ${r.ritualSlots}</span></div><div class="ritual-list">${s.rituals
      .map((r) => {
        const d = RITUALS.find((x) => x.id === r.id);
        return `<button class="ritual-mini" data-action="ritual" data-uid="${r.uid}" title="${esc(d.description)}"><i>${d.icon}</i><span>${d.name}<small>${shop ? "На следующем этапе" : "Использовать ↗"}</small></span></button>`;
      })
      .join(
        "",
      )}${s.rituals.length === 0 ? '<div class="ritual-empty">Свитки одноразовых способностей<br>можно найти в магазине</div>' : ""}</div>`;
  }
  play() {
    const s = this.game.state,
      r = this.game.rules,
      m = MOVEMENTS.find((x) => x.id === s.movement),
      boss = BOSSES.find((x) => x.id === s.boss),
      progress = Math.min(100, (s.score / s.target) * 100);
    return `${this.header(`ГЛАВА ${Math.ceil(s.stage / 3)} <span class="divider">/</span> ЭТАП ${s.stage}`)}<main class="game-screen"><div class="game-hud"><div class="target-stat"><span>ЦЕЛЬ ЭТАПА</span><strong>${fmt(s.target)}</strong></div><div class="score-stat"><div><span>ВАШИ ОЧКИ</span><strong>${fmt(s.score)}</strong></div><div class="progress-track"><i style="width:${progress}%"></i></div></div><div class="hands-stat"><span>ОСТАЛОСЬ РУК</span><strong>${s.handsLeft}<small> / ${Math.max(r.hands, s.handsLeft)}</small></strong></div><div class="gold-stat"><span>ЗОЛОТО</span><strong>◎ ${fmt(s.gold)}</strong></div>${btn("pause", "Ⅱ", "pause-button", 'aria-label="Пауза"')}</div><div class="play-layout"><section class="board-column"><div class="board-caption"><span><b>${m?.icon || "·"}</b> ${m?.name || "Лабиринт"} <small>${m?.description || ""}</small></span><span>${s.board.filter(Boolean).length / 2} <small>пар на поле</small></span></div><div class="board-shell ${boss?.id === "night" ? "night" : ""} ${this.game.settings.reducedDarkness ? "soft-night" : ""}" style="--light-x:50%;--light-y:50%"><div class="board-grid" role="group" aria-label="Игровое поле 13 на 8">${s.board.map((c, i) => this.tile(c, i)).join("")}</div>${boss?.id === "night" ? '<div class="night-mask" aria-hidden="true"></div>' : ""}</div><div class="hand-bar"><div class="hand-label"><span>ВАША РУКА</span><b>${s.hand.length ? evaluatePoker(s.hand).name : "Начните комбинацию"}</b><small>${s.hand.length} из 5 карт · розыгрыш автоматически</small></div><div class="hand-slots">${Array.from({ length: 5 }, (_, i) => `<div class="hand-slot" data-hand-slot="${i}">${s.hand[i] ? this.tile(s.hand[i], null, "", s.hand[i].modifiers) : `<span>${i + 1}</span>`}</div>`).join("")}</div><div class="reserve"><span>РЕЗЕРВ ${s.reserve.length}/${CONFIG.reserveLimit}</span><b>${s.reserve.map(labelCard).join(" ") || "—"}</b><small>Эхо переходит в следующую руку</small></div></div><div class="board-controls"><div class="mode-toggle">${btn("mode", "↗ Собрать", this.mode === "collect" ? "active" : "", 'data-mode="collect"')}${btn("mode", `✕ Уничтожить <b>${s.banishes}</b>`, this.mode === "banish" ? "active danger" : "", 'data-mode="banish"')}</div>${btn("shuffle", `↻ Перемешать <b>${s.manualShuffles}</b>`, "secondary", !s.manualShuffles ? "disabled" : "")}${btn("hint", "◉ Подсказка", "ghost")}<span class="turn-rule">≤ <strong>${r.turns}</strong> поворота</span></div></section><aside class="game-sidebar">${this.inventory()}${boss ? `<div class="boss-note"><span>${boss.icon} БОСС ЭТАПА</span><h3>${boss.name}</h3><p>${boss.description}</p>${s.boss === "suit" ? `<b>${SYMBOLS[s.cursedSuit]} ${SUIT_NAMES[s.cursedSuit]}</b>` : ""}${s.temp.cleansed ? "<small>Штраф очищен</small>" : ""}</div>` : ""}${s.contract ? `<div class="contract-note"><span>◇ КОНТРАКТ · +${CONTRACTS.find((c) => c.id === s.contract).reward} ◎</span><p>${CONTRACTS.find((c) => c.id === s.contract).description}</p></div>` : ""}<div class="sidebar-bottom">${btn("deck", "▤ Ваша колода <span>↗</span>", "text-button")}${btn("timeline", "≡ Последний расчёт <span>↗</span>", "text-button", s.lastScore ? "" : "disabled")}${this.game.debugEnabled ? btn("debug", "⌘ Отладка", "text-button") : ""}<small>SEED ${esc(s.seed)} <i>●</i></small></div></aside></div></main>${s.phase === "briefing" ? this.briefing() : s.phase === "reward" ? this.reward() : ["lost", "ended"].includes(s.phase) ? this.endRun() : ""}`;
  }
  briefing() {
    const s = this.game.state,
      m = MOVEMENTS.find((x) => x.id === s.movement),
      b = BOSSES.find((x) => x.id === s.boss),
      c = CONTRACTS.find((x) => x.id === s.contractOffer);
    return `<div class="screen-shade"><section class="stage-intro panel"><div class="eyebrow">${b ? "ОСОБОЕ ИСПЫТАНИЕ" : "СЛЕДУЮЩАЯ КОМНАТА"} · ЭТАП ${s.stage}</div>${emblem(b?.id || m.id, b?.icon || m.icon)}<h1>${b?.name || m.name}</h1><p>${b?.description || m.description}</p><div class="intro-stats"><span>Цель<strong>${fmt(s.target)}</strong></span><span>Руки<strong>${s.handsLeft}</strong></span><span>Повороты<strong>≤ ${this.game.rules.turns}</strong></span></div><div class="contract-choice"><span>ДОБРОВОЛЬНЫЙ КОНТРАКТ <b>+${c.reward} ◎</b></span><h3>${c.name}</h3><p>${c.description}</p><small>При невыполнении теряется только бонус.</small></div><div class="button-row">${btn("begin", "Начать без контракта", "secondary", 'data-contract="false"')}${btn("begin", "Принять и начать ↗", "primary", 'data-contract="true"')}</div></section></div>`;
  }
  reward() {
    const s = this.game.state,
      r = s.reward;
    return `<div class="screen-shade"><section class="result-panel panel"><div class="eyebrow">${s.stage % 3 === 0 ? "ГЛАВА ПРОЙДЕНА" : "КОМНАТА ПРОЙДЕНА"}</div><div class="result-sigil">✦</div><h1>${s.stage % 3 === 0 ? "Лабиринт становится глубже" : "Путь открыт"}</h1><div class="result-score">${fmt(s.score)}<small>из ${fmt(s.target)} очков</small></div><div class="receipt"><span>Награда этапа <b>+${r.base} ◎</b></span><span>Оставшиеся руки <b>+${r.efficiency} ◎</b></span>${r.boss ? `<span>Победа над боссом <b>+${r.boss} ◎</b></span>` : ""}${r.contract ? `<span>Контракт выполнен <b>+${r.contract} ◎</b></span>` : ""}${r.interest ? `<span>Проценты банкира <b>+${r.interest} ◎</b></span>` : ""}${r.penalty ? `<span>Модификатор награды <b>${r.penalty} ◎</b></span>` : ""}<strong>Получено <b>+${r.total} ◎</b></strong></div>${btn("openShop", s.boss ? "Открыть награду ◇" : "Дальше — к торговцу ↗", "primary large")}${s.stage % 3 === 0 ? btn("finish", "Завершить забег с этим рекордом", "text-button") : ""}</section></div>`;
  }
  endRun() {
    const s = this.game.state;
    return `<div class="screen-shade"><section class="result-panel panel"><div class="eyebrow">${s.phase === "lost" ? "КОНЕЦ ЗАБЕГА" : "ПУТЬ ЗАВЕРШЁН"}</div><div class="result-sigil">${s.phase === "lost" ? "◇" : "✦"}</div><h1>${s.phase === "lost" ? "Лабиринт помнит вас" : "До следующей встречи"}</h1><p>${s.phase === "lost" ? esc(s.lossReason) : "Вы покинули лабиринт. Открытый контент сохранён."}</p><div class="intro-stats"><span>Этап<strong>${s.stage}</strong></span><span>Всего очков<strong>${fmt(s.stats.totalScore)}</strong></span><span>Лучшая рука<strong>${fmt(s.stats.bestHand)}</strong></span></div><div class="button-row">${btn("menu", "В меню", "secondary")}${btn("new", "Ещё один путь ↗", "primary")}</div><small class="subtle">Достижения и разблокировки остаются с вами.</small></section></div>`;
  }
  offerInfo(o) {
    if (o.type === "joker") return jokerById(o.id);
    if (o.type === "enhancement")
      return ENHANCEMENTS.find((x) => x.id === o.id);
    if (o.type === "ritual") return RITUALS.find((x) => x.id === o.id);
    const [name, description, icon] = SPECIALS[o.id];
    return { name, description, icon, rarity: "uncommon" };
  }
  shop() {
    const s = this.game.state;
    return `${this.header("МЕЖДУ ЭТАПАМИ")}<main class="shop-screen"><div class="shop-top"><div><div class="eyebrow">ПРИВАЛ В ЛАБИРИНТЕ</div><h1 class="screen-title">Лавка <em>невозможного</em></h1><p class="subtle">Меняйте колоду. Находите синергии. Готовьтесь к следующей комнате.</p></div><div class="shop-wallet"><span>ВАШЕ ЗОЛОТО</span><strong>◎ ${fmt(s.gold)}</strong></div></div><div class="shop-layout"><section><div class="section-label">СЕГОДНЯ В ЛАВКЕ <span>Этап ${s.stage} завершён</span></div><div class="shop-offers">${s.shop.offers
      .map((o) => {
        const d = this.offerInfo(o),
          price = this.game.price(o);
        return `<article class="offer-card ${d.rarity} ${o.sold ? "sold" : ""}"><div class="offer-type">${{ joker: "ДЖОКЕР", enhancement: "УЛУЧШЕНИЕ КАРТЫ", ritual: "РИТУАЛ", special: "ОСОБЫЙ ПРЕДМЕТ" }[o.type]} <span>${RARITIES[d.rarity].name}</span></div>${emblem(o.id, d.icon)}<h3>${d.name}</h3><p>${d.description}</p>${btn("offer", o.sold ? "Куплено ✓" : `<span>${["enhancement", "special"].includes(o.type) && ["transform", "level", ...ENHANCEMENTS.map((x) => x.id)].includes(o.id) ? "Выбрать" : "Купить"}</span><b>${price === 0 ? "Бесплатно" : price + " ◎"}</b>`, "offer-buy", `data-uid="${o.uid}" ${o.sold || s.gold < price ? "disabled" : ""}`)}</article>`;
      })
      .join(
        "",
      )}</div><div class="shop-footer">${btn("reroll", `↻ Обновить товары <b>${this.game.rerollCost()} ◎</b>`, "secondary", s.gold < this.game.rerollCost() ? "disabled" : "")}<small>Цена обновления растёт в пределах одного магазина.</small>${btn("next", "Следующий этап ↗", "primary")}</div></section><aside class="shop-sidebar"><div class="section-label">ВАША СБОРКА</div>${this.inventory(true)}${btn("deck", "▤ Посмотреть колоду", "secondary full-width")}${s.stage % 3 === 0 ? btn("finish", "Завершить забег", "text-button") : ""}</aside></div></main>`;
  }
  chest() {
    const s = this.game.state,
      c = s.chest;
    return `${this.header("НАГРАДА")}<main class="center-screen"><div class="eyebrow">${RARITIES[c.rarity].name.toUpperCase()} СУНДУК</div><div class="chest-art">◇</div><h1 class="screen-title">Одна награда. <em>Новый путь.</em></h1><p class="subtle">Выберите один подарок. Изменения сохранятся до конца забега.</p><div class="reward-options">${c.options
      .map((o, i) => {
        const d =
          o.type === "joker"
            ? jokerById(o.id)
            : o.type === "ritual"
              ? RITUALS.find((r) => r.id === o.id)
              : o.type === "gold"
                ? {
                    name: `${o.value} золота`,
                    description: "Пополните запас перед магазином.",
                    icon: "◎",
                  }
                : o.type === "slot"
                  ? {
                      name: "Слот джокера",
                      description: "+1 постоянный слот.",
                      icon: "▣",
                    }
                  : o.type === "transform"
                    ? {
                        name: "Пара тузов",
                        description: "Одна исходная пара становится тузами.",
                        icon: "A",
                      }
                    : {
                        name: "Эхо ×2",
                        description: `Улучшение идентичности ${o.target}.`,
                        icon: "∞",
                      };
        return `<button class="booster-card" data-action="chest" data-index="${i}">${emblem(o.type, d.icon)}<h2>${d.name}</h2><p>${d.description}</p><span class="card-cta">Забрать подарок ↗</span></button>`;
      })
      .join("")}</div></main>`;
  }
  event() {
    const s = this.game.state,
      e = EVENTS.find((x) => x.id === s.event.id);
    return `${this.header("СЛУЧАЙНАЯ ВСТРЕЧА")}<main class="center-screen event-screen">${emblem(e.id, "✦")}<div class="eyebrow">ИНОГДА ЛАБИРИНТ ДЕЛИТСЯ СЕКРЕТАМИ</div><h1 class="screen-title">${e.name}</h1><p>${e.description}</p><div class="event-choices">${e.choices.map((c, i) => btn("event", c.label + " ↗", "secondary large", `data-index="${i}"`)).join("")}</div></main>`;
  }
  collection() {
    const all = {
      jokers: JOKERS,
      rituals: RITUALS,
      boosters: BOOSTERS,
      enhancements: ENHANCEMENTS,
      bosses: BOSSES,
      movements: MOVEMENTS,
    };
    const names = {
      jokers: "Джокеры",
      rituals: "Ритуалы",
      boosters: "Стартовые усиления",
      enhancements: "Улучшения",
      bosses: "Боссы",
      movements: "Движения",
    };
    return `${this.header("КОЛЛЕКЦИЯ")}<main class="catalog-screen"><div class="eyebrow">СЕКРЕТЫ, КОТОРЫЕ ВЫ УЖЕ ЗНАЕТЕ</div><h1 class="screen-title">Атлас <em>лабиринта</em></h1><div class="catalog-tabs">${Object.entries(
      names,
    )
      .map(([id, name]) =>
        btn(
          "category",
          `${name} <small>${all[id].length}</small>`,
          this.category === id ? "active" : "",
          `data-id="${id}"`,
        ),
      )
      .join("")}</div><div class="catalog-grid">${all[this.category]
      .map((d) => {
        const unlocked = isUnlocked(d, this.game.meta);
        return `<article class="catalog-card ${unlocked ? "" : "locked"}"><span class="rarity-label">${RARITIES[d.rarity || "common"].name}</span>${emblem(d.id, unlocked ? d.icon : "?")}<h3>${unlocked ? d.name : "Неизвестный секрет"}</h3><p>${unlocked ? d.description : "Открывается: " + (ACHIEVEMENTS.find((a) => a.id === d.unlockedBy)?.description || "Продолжайте исследовать лабиринт.")}</p></article>`;
      })
      .join("")}</div>${btn("menu", "← Вернуться в меню", "secondary")}</main>`;
  }
  achievements() {
    return `${this.header("ДОСТИЖЕНИЯ")}<main class="catalog-screen"><div class="eyebrow">${this.game.meta.achievements.length} ИЗ ${ACHIEVEMENTS.length} ОТКРЫТО</div><h1 class="screen-title">Следы <em>вашего пути</em></h1><div class="achievement-grid">${ACHIEVEMENTS.map((a) => `<article class="achievement ${this.game.meta.achievements.includes(a.id) ? "unlocked" : ""}"><span>${this.game.meta.achievements.includes(a.id) ? "✦" : "◇"}</span><div><h3>${a.name}</h3><p>${a.description}</p><small>Награда: ${a.reward}</small></div></article>`).join("")}</div>${btn("menu", "← Вернуться в меню", "secondary")}</main>`;
  }
  exit() {
    return `${this.header()}<main class="center-screen"><div class="result-sigil">◇</div><h1 class="screen-title">Путь сохранён</h1><p class="subtle">Теперь можно закрыть вкладку. Лабиринт будет ждать.</p>${btn("menu", "Вернуться в меню", "primary")}</main>`;
  }
  async click(e) {
    const b = e.target.closest("[data-action]"),
      tile = e.target.closest("[data-index].playing-card");
    if (tile) {
      this.chooseTile(Number(tile.dataset.index), this.mode);
      return;
    }
    if (!b || b.disabled) return;
    this.audio.unlock();
    const a = b.dataset.action;
    if (a === "close") {
      this.close();
      return;
    }
    if (a === "menu") {
      this.anim.cancel();
      this.actionSerial = (this.actionSerial || 0) + 1;
      this.busy = false;
      this.app.setAttribute("aria-busy", "false");
      this.close();
      this.page = "menu";
      this.render();
      return;
    }
    if (a === "new") {
      this.modal(
        "Новый путь",
        `<form data-form="new"><p>Каждый seed создаёт воспроизводимый лабиринт. Оставьте поле пустым для нового приключения.</p>${this.game.state && !["lost", "ended"].includes(this.game.state.phase) ? '<p class="warning-text">Новый забег заменит текущий. Достижения сохранятся.</p>' : ""}<label>SEED<input name="seed" maxlength="64" placeholder="Случайный seed" autocomplete="off"></label><button class="primary large" type="submit">Войти в лабиринт ↗</button></form>`,
      );
      return;
    }
    if (a === "continue") {
      this.page = "game";
      this.render();
      return;
    }
    if (a === "collection" || a === "achievements" || a === "exit") {
      this.game.persist();
      this.page = a;
      this.render();
      return;
    }
    if (a === "category") {
      this.category = b.dataset.id;
      this.render();
      return;
    }
    if (a === "help") {
      this.help();
      return;
    }
    if (a === "settings") {
      this.settings();
      return;
    }
    if (a === "sound") {
      this.game.setSettings({ sound: !this.game.settings.sound });
      this.render();
      return;
    }
    if (a === "pause") {
      this.anim.cancel();
      this.actionSerial = (this.actionSerial || 0) + 1;
      this.busy = false;
      this.app.setAttribute("aria-busy", "false");
      this.render();
      this.modal(
        "Пауза",
        `<p>Текущее состояние сохранено. Здесь нет таймера — продумайте следующий ход.</p><div class="pause-actions">${btn("close", "Продолжить", "primary")}${btn("settings", "Настройки", "secondary")}${btn("menu", "В главное меню", "secondary")}</div>`,
      );
      return;
    }
    if (a === "deck") {
      this.deck();
      return;
    }
    if (a === "timeline") {
      this.timeline();
      return;
    }
    if (a === "debug") {
      this.debug();
      return;
    }
    if (this.busy) return;
    if (a === "chooseBooster")
      await this.act("chooseBooster", { id: b.dataset.id });
    if (a === "begin")
      await this.act("beginStage", { contract: b.dataset.contract === "true" });
    if (a === "mode") {
      this.mode = b.dataset.mode;
      this.render();
    }
    if (a === "shuffle") await this.act("shuffle");
    if (a === "hint") this.hint();
    if (a === "openShop") await this.act("openShop");
    if (a === "reroll") await this.act("reroll");
    if (a === "next") await this.act("nextStage");
    if (a === "finish") await this.act("finishRun");
    if (a === "offer") this.offerDialog(b.dataset.uid);
    if (a === "buy") await this.act("buy", { uid: b.dataset.uid });
    if (a === "inspectJoker") this.jokerDialog(b.dataset.uid);
    if (a === "sell") await this.act("sell", { uid: b.dataset.uid });
    if (a === "ritual") this.ritualDialog(b.dataset.uid);
    if (a === "useRitual") await this.act("useRitual", { uid: b.dataset.uid });
    if (a === "discard")
      await this.act("discardRitual", { uid: b.dataset.uid });
    if (a === "chest")
      await this.act("chooseChest", { index: Number(b.dataset.index) });
    if (a === "event")
      await this.act("chooseEvent", { index: Number(b.dataset.index) });
  }
  async submit(e) {
    const form = e.target;
    if (!form.dataset.form) return;
    e.preventDefault();
    if (this.busy) return;
    const data = new FormData(form),
      args = Object.fromEntries(data);
    switch (form.dataset.form) {
      case "new": {
        const bytes = new Uint32Array(1);
        crypto.getRandomValues(bytes);
        await this.act("newRun", {
          seed: args.seed.trim() || bytes[0].toString(36).toUpperCase(),
        });
        break;
      }
      case "buy":
        args.targets = data.getAll("targets");
        await this.act("buy", args);
        break;
      case "ritual":
        if (args.pair) {
          const [a, b] = args.pair.split(",").map(Number);
          args.a = a;
          args.b = b;
        }
        await this.act("useRitual", args);
        break;
      case "debug":
        await this.act("debug", args);
        break;
    }
  }
  change(e) {
    if (e.target.dataset.setting) {
      const key = e.target.dataset.setting,
        value =
          e.target.type === "checkbox"
            ? e.target.checked
            : e.target.type === "range"
              ? Number(e.target.value)
              : e.target.value;
      this.game.setSettings({ [key]: value });
      this.audio.stopMusic();
      this.audio.updateMusic();
      document.body.dataset.speed = this.game.settings.speed;
      document
        .querySelector(".board-shell")
        ?.classList.toggle("soft-night", this.game.settings.reducedDarkness);
    }
    if (e.target.name === "targets") {
      const labels = e.target.form.querySelectorAll(".target-card");
      for (const label of labels)
        label.classList.toggle("checked", label.querySelector("input").checked);
    }
  }
  async act(action, args = {}) {
    if (this.busy) return;
    const actionSerial = (this.actionSerial = (this.actionSerial || 0) + 1);
    this.busy = true;
    this.app.setAttribute("aria-busy", "true");
    this.audio.unlock();
    const previous = this.anim.capture(),
      result = this.game.transact(action, args);
    if (!result.ok) {
      this.busy = false;
      this.app.setAttribute("aria-busy", "false");
      this.toast(result.error);
      return;
    }
    this.close();
    this.page = "game";
    this.selected = null;
    const generation = this.anim.generation;
    try {
      await this.playEvents(result.events, generation);
      if (generation === this.anim.generation) {
        this.render();
        await this.anim.move(previous);
      }
      if (!result.saved) this.toast(`Не удалось сохранить: ${result.error}`);
    } catch (error) {
      console.error(error);
      if (actionSerial === this.actionSerial) {
        this.render();
        this.toast("Анимация прервана. Состояние игры сохранено.");
      }
    } finally {
      if (actionSerial === this.actionSerial) {
        this.busy = false;
        this.app.setAttribute("aria-busy", "false");
      }
    }
  }
  async chooseTile(index, mode) {
    if (
      this.busy ||
      this.dialog.open ||
      this.page !== "game" ||
      this.game.state?.phase !== "playing"
    )
      return;
    this.audio.unlock();
    const card = this.game.state.board[index];
    if (!card) return;
    this.focusTile = index;
    if (!this.selected || this.selected.mode !== mode) {
      this.selected = { index, mode };
      this.paintSelection();
      this.audio.play("select");
      return;
    }
    if (this.selected.index === index) {
      this.selected = null;
      this.paintSelection();
      return;
    }
    const a = this.selected.index;
    if (identity(this.game.state.board[a]) !== identity(card)) {
      this.selected = { index, mode };
      this.paintSelection();
      this.audio.play("select");
      return;
    }
    this.selected = null;
    this.paintSelection();
    await this.act("connect", { a, b: index, mode });
  }
  paintSelection() {
    document.querySelectorAll("[data-index].playing-card").forEach((el) => {
      const on = Number(el.dataset.index) === this.selected?.index;
      el.classList.toggle("selected", on);
      el.classList.toggle(
        "banish-selected",
        on && this.selected.mode === "banish",
      );
      el.setAttribute("aria-pressed", String(on));
    });
  }
  hint(pairs = null) {
    if (this.game.state?.phase !== "playing") return;
    const list =
      pairs || availablePairs(this.game.state.board, this.game.rules.turns, 1);
    for (const p of list)
      for (const i of [p.a, p.b])
        document
          .querySelector(`[data-index="${i}"].playing-card`)
          ?.classList.add("hinted");
    this.audio.play("hint");
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(
      () =>
        document
          .querySelectorAll(".hinted")
          .forEach((el) => el.classList.remove("hinted")),
      2600,
    );
  }
  flashlight(e) {
    const board = document.querySelector(".board-shell.night");
    if (!board) return;
    const r = board.getBoundingClientRect();
    board.style.setProperty("--light-x", `${e.clientX - r.left}px`);
    board.style.setProperty("--light-y", `${e.clientY - r.top}px`);
  }
  keydown(e) {
    if (e.key === "Escape" && !this.dialog.open && this.page === "game") {
      e.preventDefault();
      document.querySelector('[data-action="pause"]')?.click();
      return;
    }
    if (this.dialog.open || e.target.matches("input,select,textarea")) return;
    if (this.game.state?.phase !== "playing" || this.page !== "game") return;
    if (e.key.toLowerCase() === "h") {
      this.hint();
      return;
    }
    if (e.key.toLowerCase() === "s") {
      this.act("shuffle");
      return;
    }
    if (e.key.toLowerCase() === "b") {
      this.mode = this.mode === "collect" ? "banish" : "collect";
      this.render();
      return;
    }
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -13, ArrowDown: 13 }[
      e.key
    ];
    if (delta) {
      e.preventDefault();
      let i = this.focusTile;
      for (let n = 0; n < 104; n++) {
        i = (i + delta + 104) % 104;
        if (this.game.state.board[i]) break;
      }
      this.focusTile = i;
      document.querySelector(`.playing-card[data-index="${i}"]`)?.focus();
    }
  }
  async playEvents(events, generation) {
    for (const ev of events) {
      if (generation !== this.anim.generation) return;
      if (ev.type === "pair") {
        this.audio.play(ev.mode === "banish" ? "banish" : "pair");
        await this.pairAnimation(ev, generation);
      } else if (ev.type === "collect") {
        const slots = document.querySelector(".hand-slots");
        if (slots)
          slots.innerHTML = Array.from(
            { length: 5 },
            (_, i) =>
              `<div class="hand-slot" data-hand-slot="${i}">${ev.cards[i] ? this.tile(ev.cards[i], null, "", ev.cards[i].modifiers) : `<span>${i + 1}</span>`}</div>`,
          ).join("");
        this.audio.play("collect");
      } else if (ev.type === "score") await this.scoreAnimation(ev.result);
      else if (ev.type === "notice") this.toast(ev.text);
      else if (ev.type === "achievement") {
        const a = ACHIEVEMENTS.find((x) => x.id === ev.id);
        this.toast(`✦ Достижение: ${a.name}`);
      } else if (ev.type === "hint") {
        this.render();
        this.hint(ev.pairs);
      } else
        this.audio.play(
          ev.type === "stage" ? (ev.boss ? "boss" : "move") : ev.type,
        );
    }
  }
  async pairAnimation(ev, generation) {
    const board = document.querySelector(".board-shell"),
      a = document.querySelector(`.playing-card[data-index="${ev.a}"]`),
      b = document.querySelector(`.playing-card[data-index="${ev.b}"]`);
    if (!board || !a || !b) return;
    const br = board.getBoundingClientRect(),
      r = a.getBoundingClientRect(),
      grid = document.querySelector(".board-grid").getBoundingClientRect(),
      gap =
        parseFloat(
          getComputedStyle(document.querySelector(".board-grid")).gap,
        ) || 6;
    const cw = (grid.width - gap * 12) / 13,
      ch = (grid.height - gap * 7) / 8;
    const coords = ev.path.points
      .map(
        (p) =>
          `${grid.x - br.x + p.x * (cw + gap) + cw / 2},${grid.y - br.y + p.y * (ch + gap) + ch / 2}`,
      )
      .join(" ");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${br.width} ${br.height}`);
    svg.classList.add("path-overlay");
    svg.innerHTML = `<polyline points="${coords}" fill="none" stroke="${ev.mode === "banish" ? "#ee927c" : "#ffda83"}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>`;
    board.append(svg);
    this.particles.burst(r.x + r.width / 2, r.y + r.height / 2);
    const rb = b.getBoundingClientRect();
    this.particles.burst(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await this.anim.delay(180);
    if (generation !== this.anim.generation) return;
    await Promise.all(
      [a, b].map((el) =>
        this.anim.animate(
          el,
          [
            { transform: "scale(1)", opacity: 1 },
            { transform: "scale(.75)", opacity: 0 },
          ],
          180,
        ),
      ),
    );
    if (generation !== this.anim.generation) return;
    if (ev.mode === "collect") {
      const dst =
        document.querySelector(`.hand-slot[data-hand-slot="${ev.handSlot}"]`) ||
        document.querySelector(".hand-slot");
      if (dst) {
        const dr = dst.getBoundingClientRect(),
          clone = a.cloneNode(true);
        clone.className += " flying-card";
        clone.removeAttribute("data-index");
        Object.assign(clone.style, {
          position: "fixed",
          left: `${r.x}px`,
          top: `${r.y}px`,
          width: `${r.width}px`,
          height: `${r.height}px`,
        });
        document.body.append(clone);
        await this.anim.animate(
          clone,
          [
            { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
            {
              transform: `translate(${dr.x - r.x}px,${dr.y - r.y}px) rotate(8deg)`,
              opacity: 0.7,
            },
          ],
          280,
        );
        clone.remove();
      }
    }
    svg.remove();
  }
  async scoreAnimation(result) {
    const overlay = document.createElement("section");
    overlay.className = "score-overlay panel";
    overlay.innerHTML = `<div class="eyebrow">РУКА СОБРАНА</div><h2>${result.evaluation.name}</h2><div class="score-equation"><span class="chips-value">0</span><i>×</i><span class="mult-value">1</span></div><div class="score-step">Считаем карты и маршруты</div><strong class="final-value">+${fmt(result.finalScore)}</strong>`;
    document.body.append(overlay);
    this.audio.play("score");
    const phases = [...new Set(result.timeline.map((l) => l.phase))];
    for (const phase of phases) {
      if (!overlay.isConnected) return;
      const lines = result.timeline.filter((l) => l.phase === phase),
        last = lines.at(-1);
      overlay.querySelector(".chips-value").textContent = fmt(last.chips);
      overlay.querySelector(".mult-value").textContent = (
        last.mult * last.xMult
      )
        .toFixed(2)
        .replace(/\.00$/, "");
      overlay.querySelector(".score-step").textContent = lines
        .map((l) => l.source)
        .filter((x, i, a) => a.indexOf(x) === i)
        .slice(0, 3)
        .join(" · ");
      this.audio.play(phase >= 8 ? "mult" : "chips");
      await this.anim.delay(190);
    }
    await this.anim.animate(
      overlay,
      [
        { transform: "translate(-50%,-50%) scale(1)" },
        { transform: "translate(-50%,-50%) scale(1.035)" },
        { transform: "translate(-50%,-50%) scale(1)" },
      ],
      300,
    );
    await this.anim.delay(350);
    overlay.remove();
  }
  help() {
    this.modal(
      "Как пройти лабиринт",
      `<div class="help-intro"><b>Вы сами добываете карты для покерной руки.</b><p>Найдите две одинаковые карты — ранг и масть должны совпадать. Соедините их свободной линией с максимум двумя поворотами. Можно идти вокруг внешней границы.</p></div><ol class="help-steps"><li><b>Собирайте</b><p>Левый клик по паре удаляет две плитки и добавляет одну карту в руку.</p></li><li><b>Планируйте</b><p>Пять карт разыгрываются автоматически. Обычно у вас четыре руки, чтобы достичь цели. Каре и флеш могут сработать вместе.</p></li><li><b>Расчищайте путь</b><p>Правый клик уничтожает пару без добавления карты. Есть 2 уничтожения и 2 ручных перемешивания. При отсутствии ходов поле перемешивается бесплатно.</p></li><li><b>Меняйте правила</b><p>Покупайте джокеров, ритуалы и улучшения. Колода всегда содержит 52 исходные пары и 104 плитки, даже после преобразований.</p></li></ol><div class="help-note"><b>Эхо и резерв</b><p>Эхо ×2 добавляет две карты. Переполнение хранится в резерве (до ${CONFIG.reserveLimit} карт) и переходит в следующую руку. В конце этапа каждая неиспользованная карта резерва даёт ${CONFIG.reserveBonus} очков.</p><b>Формула: очки × множитель × произведение усилений</b><p>Номиналы: 2–10 по рангу, J/Q/K = 10, A = 11. Геометрия: +5 / +10 / +15 за 0 / 1 / 2 поворота. Все эффекты видны в последнем расчёте.</p></div><p class="subtle">Клавиатура: стрелки + Enter — выбор карт; S — перемешать; B — режим; H — подсказка; Esc — пауза. На телефоне используйте переключатель «Собрать / Уничтожить».</p>${btn("close", "Всё понятно", "primary")}`,
      true,
    );
  }
  settings() {
    const s = this.game.settings;
    this.modal(
      "Настройки",
      `<div class="settings-grid"><label class="setting-row"><span>Звуковые эффекты</span><input type="checkbox" data-setting="sound" ${s.sound ? "checked" : ""}></label><label class="setting-row"><span>Тихий музыкальный фон</span><input type="checkbox" data-setting="music" ${s.music ? "checked" : ""}></label><label>Громкость<input type="range" data-setting="volume" min="0" max="1" step=".05" value="${s.volume}"></label><label>Анимации<select data-setting="speed"><option value="normal" ${s.speed === "normal" ? "selected" : ""}>Нормальные</option><option value="fast" ${s.speed === "fast" ? "selected" : ""}>Ускоренные ×2</option><option value="minimal" ${s.speed === "minimal" ? "selected" : ""}>Минимальные</option></select></label><label class="setting-row"><span>Мягкая тьма Ночного Джокера<small>Увеличивает радиус света, сохраняя ограничение видимости</small></span><input type="checkbox" data-setting="reducedDarkness" ${s.reducedDarkness ? "checked" : ""}></label></div>${btn("close", "Готово", "primary")}`,
    );
  }
  deck() {
    const s = this.game.state;
    this.modal(
      "Ваша колода · 52 исходные пары",
      `<p class="subtle">Любое улучшение действует на все копии текущей идентичности. До трёх совместимых свойств на идентичность.</p><div class="deck-grid">${deckIdentities(
        s.deck,
      )
        .map(
          (c) =>
            `<div class="deck-entry">${this.tile(c)}<b>${c.copies} плитки</b><small>${(s.modifiers[c.id] || []).map((m) => enhancementById(m).name).join(" · ") || "Без улучшений"}</small></div>`,
        )
        .join("")}</div>`,
      true,
    );
  }
  timeline() {
    const s = this.game.state,
      r = s.lastScore;
    if (!r) return;
    this.modal(
      r.evaluation.name,
      `<div class="timeline-total">${fmt(r.chips)} × ${r.mult.toFixed(2)} × ${r.xMult.toFixed(2)} = <b>${fmt(r.finalScore)}</b></div><div class="timeline">${r.timeline.map((l) => `<div><span>${l.source}</span><b>${l.kind === "xMult" ? "×" : l.value >= 0 ? "+" : ""}${Number(l.value.toFixed(2))}${l.kind === "gold" ? " ◎" : l.kind === "mult" ? " множ." : ""}</b></div>`).join("")}</div>`,
      true,
    );
  }
  jokerDialog(uid) {
    const s = this.game.state,
      j = s.jokers.find((j) => j.uid === uid);
    if (!j) return;
    const d = jokerById(j.id);
    this.modal(
      d.name,
      `<div class="inspect-art">${emblem(d.id, d.icon)}</div><div class="rarity-label">${RARITIES[d.rarity].name}</div><p>${d.description}</p><p class="subtle">Накоплено: ${j.count || 0} · Продажа: ${d.sellPrice} ◎<br>Один экземпляр на забег. ${d.id === "copyist" ? "Порядок слотов важен: копируется сосед слева." : "Порядок слотов не меняет этот эффект."}</p>${s.phase === "shop" ? btn("sell", `Продать за ${d.sellPrice} ◎`, "secondary", `data-uid="${uid}"`) : btn("close", "Понятно", "primary")}`,
    );
  }
  identitySelect(name = "target") {
    return `<select name="${name}">${deckIdentities(this.game.state.deck)
      .map(
        (c) =>
          `<option value="${c.id}">${labelCard(c)} · ${c.copies} плитки · ${(this.game.state.modifiers[c.id] || []).map((m) => enhancementById(m).name).join(", ") || "без свойств"}</option>`,
      )
      .join("")}</select>`;
  }
  transformFields(mirror = false) {
    const s = this.game.state;
    return `<label>Исходная пара<select name="blueprintId">${s.deck
      .map((b) => {
        const one =
          s.phase === "playing" &&
          s.board.filter((c) => c?.blueprintId === b.blueprintId).length === 1;
        return `<option value="${b.blueprintId}" ${one ? "disabled" : ""}>${rankLabel(b.originalRank)}${SYMBOLS[b.originalSuit]} → ${rankLabel(b.currentRank)}${SYMBOLS[b.currentSuit]}${one ? " · осталась 1 плитка" : ""}</option>`;
      })
      .join("")}</select></label>${
      mirror
        ? `<label>Скопировать идентичность${this.identitySelect("copyIdentity")}</label>`
        : `<div class="form-two"><label>Новый ранг<select name="rank">${Array.from({ length: 13 }, (_, i) => `<option value="${i + 2}">${rankLabel(i + 2)}</option>`).join("")}</select></label><label>Новая масть<select name="suit">${Object.entries(
            SUIT_NAMES,
          )
            .map(
              ([id, name]) =>
                `<option value="${id}">${SYMBOLS[id]} ${name}</option>`,
            )
            .join("")}</select></label></div>`
    }<p class="subtle">Изменится одна исходная пара (2 плитки на новом поле). Свойства определяются новой идентичностью.</p>`;
  }
  offerDialog(uid) {
    const s = this.game.state,
      o = s.shop.offers.find((o) => o.uid === uid);
    if (!o || o.sold) return;
    const d = this.offerInfo(o);
    if (
      !["enhancement", "special"].includes(o.type) ||
      (o.type === "special" && !["transform", "level"].includes(o.id))
    ) {
      this.act("buy", { uid });
      return;
    }
    let fields = "";
    if (o.type === "enhancement")
      fields = `<p>${d.description}</p><p class="subtle">Выберите от 1 до ${this.game.rules.upgradeTargets} карт. Изменятся все их одинаковые копии. Одна общая цена.</p><div class="upgrade-targets">${o.options
        .map((key) => {
          const c = deckIdentities(s.deck).find((x) => x.id === key),
            eligible = canEnhance(s, key, o.id);
          return `<label class="target-card ${eligible ? "" : "ineligible"}"><input type="checkbox" name="targets" value="${key}" ${eligible ? "" : "disabled"}>${this.tile(c)}<b>${c.copies} плитки</b><small>Сейчас: ${(s.modifiers[key] || []).map((m) => enhancementById(m).name).join(", ") || "обычная"}</small><small>После: + ${d.name}</small></label>`;
        })
        .join("")}</div>`;
    else if (o.id === "transform") fields = this.transformFields();
    else
      fields = `<p>${d.description}</p><label>Усилить комбинацию<select name="handCategory">${Object.entries(
        HAND_NAMES,
      )
        .filter(([id]) => !id.includes("Synergy"))
        .map(
          ([id, name]) =>
            `<option value="${id}">${name} · уровень ${(s.handLevels[id] || 0) + 1}</option>`,
        )
        .join("")}</select></label>`;
    this.modal(
      d.name,
      `<form data-form="buy"><input type="hidden" name="uid" value="${uid}">${fields}<button class="primary large" type="submit">Подтвердить покупку · ${this.game.price(o)} ◎</button></form>`,
      o.type === "enhancement",
    );
  }
  ritualDialog(uid) {
    const s = this.game.state,
      r = s.rituals.find((r) => r.uid === uid);
    if (!r) return;
    const d = RITUALS.find((x) => x.id === r.id);
    let fields = "";
    if (s.phase === "playing") {
      if (d.target === "identity" || d.target === "optionalIdentity")
        fields = `<label>Карточная идентичность${
          d.target === "optionalIdentity"
            ? `<select name="target"><option value="">Снять штраф босса</option>${deckIdentities(
                s.deck,
              )
                .filter((c) => (s.modifiers[c.id] || []).includes("cursed"))
                .map(
                  (c) =>
                    `<option value="${c.id}">${labelCard(c)} · снять проклятие</option>`,
                )
                .join("")}</select>`
            : this.identitySelect()
        }</label>`;
      if (d.target === "blueprint" || d.target === "mirror")
        fields = this.transformFields(d.target === "mirror");
      if (d.target === "movement")
        fields =
          '<label>Направление<select name="movement"><option value="down">Вниз</option><option value="up">Вверх</option><option value="left">Влево</option><option value="right">Вправо</option></select></label>';
      if (d.target === "pair")
        fields = `<label>Доступная пара<select name="pair">${availablePairs(
          s.board,
          this.game.rules.turns,
        )
          .map(
            (p) =>
              `<option value="${p.a},${p.b}">${labelCard(s.board[p.a])} · клетки ${p.a + 1} и ${p.b + 1}</option>`,
          )
          .join("")}</select></label>`;
    }
    this.modal(
      d.name,
      `<p>${d.description}</p>${s.phase === "playing" ? `<form data-form="ritual"><input type="hidden" name="uid" value="${uid}">${fields}<button class="primary large" type="submit">Применить ритуал</button></form>` : '<p class="subtle">Ритуал можно использовать во время следующего этапа.</p>'}${btn("discard", "Освободить слот — выбросить ритуал", "text-button", `data-uid="${uid}"`)}`,
    );
  }
  debug() {
    const s = this.game.state;
    this.modal(
      "Отладка · только ?debug=1",
      `<pre>${esc(JSON.stringify({ seed: s.seed, stage: s.stage, hands: s.handsLeft, score: s.score, turns: this.game.rules.turns, movement: s.movement, temp: s.temp, lastTriggers: s.effectLog.slice(-5) }, null, 2))}</pre><form data-form="debug"><label>Действие<select name="op"><option value="gold">Выдать 100 золота</option><option value="win">Пройти этап</option><option value="joker">Выдать джокера</option><option value="enhance">Улучшить карту</option><option value="boss">Выбрать босса</option><option value="hands">Установить число рук</option><option value="movement">Сменить движение</option></select></label><label>Значение / ID<input name="value" list="debug-values"></label><datalist id="debug-values">${[...JOKERS, ...BOSSES, ...MOVEMENTS, ...ENHANCEMENTS].map((x) => `<option value="${x.id}">${x.name}</option>`).join("")}</datalist><label>Карта для улучшения${this.identitySelect()}</label><button class="primary" type="submit">Применить</button></form>`,
    );
  }
}
