import { SUITS, identity } from "../config.js";
export function createDeck() {
  return SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({
      blueprintId: `${suit}-${i + 2}`,
      originalRank: i + 2,
      originalSuit: suit,
      currentRank: i + 2,
      currentSuit: suit,
    })),
  );
}
export function deckIdentities(deck) {
  const entries = new Map();
  for (const b of deck) {
    const id = identity(b);
    if (!entries.has(id))
      entries.set(id, {
        id,
        rank: b.currentRank,
        suit: b.currentSuit,
        copies: 0,
        blueprints: [],
      });
    const e = entries.get(id);
    e.copies += 2;
    e.blueprints.push(b.blueprintId);
  }
  return [...entries.values()];
}
export function makeTiles(deck) {
  return deck.flatMap((b) =>
    [0, 1].map((copy) => ({
      id: `${b.blueprintId}:${copy}`,
      blueprintId: b.blueprintId,
      rank: b.currentRank,
      suit: b.currentSuit,
    })),
  );
}
export function transformBlueprint(state, blueprintId, rank, suit) {
  const b = state.deck.find((x) => x.blueprintId === blueprintId);
  if (
    !b ||
    !Number.isInteger(rank) ||
    rank < 2 ||
    rank > 14 ||
    !SUITS.includes(suit)
  )
    throw Error("Неверная карта");
  b.currentRank = rank;
  b.currentSuit = suit;
  for (const t of state.board || [])
    if (t?.blueprintId === blueprintId) {
      t.rank = rank;
      t.suit = suit;
    }
}
