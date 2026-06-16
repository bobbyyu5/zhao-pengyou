import React from "react";
import { SUIT_SYMBOL, SUIT_NAME_ZH, SUIT_IS_RED, rankLabel } from "../../engine/index.js";

/** Top HUD: trump suit · table level · grabber points vs pass line. */
export default function Hud({ trumpSuit, level, grabberPoints, passLine }) {
  const red = trumpSuit && SUIT_IS_RED[trumpSuit];
  return (
    <div className="hud">
      <div>
        <span className="chip">
          <span className="muted" style={{ fontSize: 12 }}>主</span>
          {trumpSuit ? (
            <>
              <span className={`trump-suit ${red ? "suit-red" : "suit-black"}`}>{SUIT_SYMBOL[trumpSuit]}</span>
              <span className="data brass-text" style={{ fontSize: 12 }}>{SUIT_NAME_ZH[trumpSuit]}</span>
            </>
          ) : (
            <span className="data brass-text" style={{ fontSize: 12 }}>无主</span>
          )}
        </span>
      </div>
      <div className="level">
        <small>LEVEL</small>
        <b className="data">{rankLabel(level)}</b>
      </div>
      <div className="pts">
        <small>抓分 Grabbers</small>
        <b className="data">{grabberPoints}<span className="of"> / {passLine}</span></b>
      </div>
    </div>
  );
}
