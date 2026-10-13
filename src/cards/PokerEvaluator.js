import { HAND_NAMES, SUITS } from "../config.js";
export function evaluatePoker(cards) {
  const counts = new Map();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a),
    unique = [...counts.keys()].sort((a, b) => a - b);
  let rankCategory = "highCard";
  if (groups[0] >= 5) rankCategory = "fiveOfKind";
  else if (groups[0] === 4) rankCategory = "fourOfKind";
  else if (groups[0] === 3 && groups[1] >= 2) rankCategory = "fullHouse";
  else if (groups[0] === 3) rankCategory = "threeOfKind";
  else if (groups[0] === 2 && groups[1] === 2) rankCategory = "twoPair";
  else if (groups[0] === 2) rankCategory = "pair";
  const complete = cards.length === 5,
    straight =
      complete &&
      unique.length === 5 &&
      (unique[4] - unique[0] === 4 || unique.join(",") === "2,3,4,5,14");
  const flush =
    complete &&
    SUITS.some((s) =>
      cards.every((c) => c.suit === s || c.secondarySuit === s),
    );
  const patterns = [];
  if (straight) patterns.push("straight");
  if (flush) patterns.push("flush");
  if (straight && flush) patterns.push("straightFlushSynergy");
  if (straight && flush && unique[0] === 10) patterns.push("royalFlushSynergy");
  const names = [
    ...(rankCategory !== "highCard" || !patterns.length
      ? [HAND_NAMES[rankCategory]]
      : []),
    ...(patterns.includes("royalFlushSynergy")
      ? [HAND_NAMES.royalFlushSynergy]
      : patterns.includes("straightFlushSynergy")
        ? [HAND_NAMES.straightFlushSynergy]
        : patterns.map((p) => HAND_NAMES[p])),
  ];
  return {
    rankCategory,
    patterns,
    straight,
    flush,
    counts: Object.fromEntries(counts),
    name: names.join(" + "),
  };
}
