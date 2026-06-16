import React from "react";
import { SUIT_SYMBOL, SUIT_IS_RED, rankLabel, pointValue, isTrump, BIG_JOKER } from "../../engine/index.js";
import { useTheme, BUILTIN_BACKS } from "../theme/theme.jsx";

/**
 * Card face matching the design mockup: oversized corner index, big center pip, green point
 * dot for 5/10/K, brass-tinted trump rank cards, joker treatment, and a swappable card back.
 */
export default function Card({ card, size, selected, legal, glow, illegal, friendCall, level, trumpSuit, onClick, back, backId }) {
  const theme = useTheme();
  const cls = ["card"];
  if (size) cls.push(size); // "sm" | "xs"
  if (selected) cls.push("selected");
  if (legal) cls.push("legal");
  if (glow) cls.push("glow");
  if (illegal) cls.push("illegal");
  if (friendCall) cls.push("friend-call");

  if (back) {
    const id = backId || theme?.cardBack || "cinnabar-seal";
    const isSeal = BUILTIN_BACKS.find((b) => b.id === id)?.seal;
    return <div className={`card back cb-${id} ${isSeal ? "seal-glyph" : ""} ${size || ""}`} aria-hidden="true" />;
  }

  const trump = level != null && isTrump(card, level, trumpSuit);
  if (trump && !card.suit.startsWith("JOKER")) cls.push("is-trump");

  const pts = pointValue(card);

  if (card.suit === "JOKER") {
    cls.push("is-trump");
    return (
      <button type="button" className={cls.join(" ")} onClick={onClick}
        aria-label={card.rank === BIG_JOKER ? "大王 big joker" : "小王 small joker"}>
        <span className="joker-mark">{card.rank === BIG_JOKER ? "大王" : "小王"}</span>
        <span className="joker-star">★</span>
      </button>
    );
  }

  const red = SUIT_IS_RED[card.suit];
  const colorClass = red ? "suit-red" : "suit-black";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={cls.join(" ")} onClick={onClick}
      aria-label={`${SUIT_SYMBOL[card.suit]}${rankLabel(card.rank)}`}>
      <span className={`index ${colorClass}`}>{rankLabel(card.rank)}</span>
      <span className={`pip ${colorClass}`}>{SUIT_SYMBOL[card.suit]}</span>
      {pts > 0 && <span className="point-dot">{pts}</span>}
    </Tag>
  );
}
