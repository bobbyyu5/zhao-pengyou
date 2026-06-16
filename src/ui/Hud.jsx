import React from "react";
import { useLang } from "../i18n/i18n.jsx";
import { SUIT_SYMBOL, SUIT_IS_RED, rankLabel } from "../../engine/index.js";

/** Top HUD: trump suit · table level · grabber points vs pass line. */
export default function Hud({ trumpSuit, level, grabberPoints, passLine }) {
  const { t, suitName } = useLang();
  const red = trumpSuit && SUIT_IS_RED[trumpSuit];
  return (
    <div className="hud">
      <div>
        <span className="chip">
          <span className="muted" style={{ fontSize: 12 }}>{t("trump")}</span>
          {trumpSuit ? (
            <>
              <span className={`trump-suit ${red ? "suit-red" : "suit-black"}`}>{SUIT_SYMBOL[trumpSuit]}</span>
              <span className="data brass-text" style={{ fontSize: 12 }}>{suitName(trumpSuit)}</span>
            </>
          ) : (
            <span className="data brass-text" style={{ fontSize: 12 }}>{t("noTrump")}</span>
          )}
        </span>
      </div>
      <div className="level">
        <small>{t("level")}</small>
        <b className="data">{rankLabel(level)}</b>
      </div>
      <div className="pts">
        <small>{t("grabbers")}</small>
        <b className="data">{grabberPoints}<span className="of"> / {passLine}</span></b>
      </div>
    </div>
  );
}
