import React, { useEffect, useState } from "react";
import { useLang, LangSwitch } from "../i18n/i18n.jsx";
import { getMe, addFriend, getLeaderboard } from "../account/account.js";

/**
 * Friends + leaderboard screen. Only reachable when cloud sync is enabled (otherwise the entry
 * button is hidden), so it's fully dormant for the local-only family build.
 */
export default function Friends({ onBack }) {
  const { t } = useLang();
  const [me, setMe] = useState(null);
  const [board, setBoard] = useState([]);
  const [code, setCode] = useState("");
  const [toast, setToast] = useState(null);

  async function refresh() {
    setMe(await getMe());
    setBoard(await getLeaderboard());
  }
  useEffect(() => { refresh(); }, []);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 2400); }

  async function onAdd() {
    if (!code.trim()) return;
    const r = await addFriend(code.trim().toUpperCase());
    if (r?.friend) { flash(t("friendAdded", { name: r.friend.name })); setCode(""); refresh(); }
    else flash(t("friendNotFound"));
  }

  function copyCode() {
    const c = me?.friendCode || "";
    try { navigator.clipboard?.writeText(c); flash(t("copyCode")); } catch {}
  }

  return (
    <div className="stack" style={{ paddingTop: 24 }}>
      {toast && <div className="toast">{toast}</div>}
      <div className="title-bar">
        <span className="brand" style={{ fontSize: 26 }}>{t("friends")}</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}><LangSwitch /><button className="tag" onClick={onBack}>{t("back")}</button></span>
      </div>

      <div className="panel center">
        <div className="muted" style={{ fontSize: 12 }}>{t("yourFriendCode")}</div>
        <div className="data" style={{ fontSize: 30, letterSpacing: 5, color: "var(--brass-light)" }}>{me?.friendCode || "…"}</div>
        <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 8 }} onClick={copyCode}>🔗 {t("copyCode")}</button>
      </div>

      <div className="panel">
        <div className="field" style={{ marginBottom: 10 }}>
          <label>{t("addFriendLabel")}</label>
          <div className="row" style={{ alignItems: "stretch" }}>
            <input className="input code" style={{ fontSize: 20 }} value={code} maxLength={7}
              onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC1234" />
            <button className="btn btn-primary" style={{ width: "auto", flex: "0 0 auto", padding: "0 18px" }} onClick={onAdd}>{t("add")}</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <p className="head" style={{ marginTop: 0, fontSize: 15 }}>{t("leaderboard")}</p>
        {board.length <= 1 ? (
          <p className="muted center" style={{ fontSize: 12 }}>{t("noFriendsYet")}</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "var(--jade)", fontSize: 11, textAlign: "left" }}>
                <th style={{ padding: "4px 6px" }}>#</th><th>{ }</th>
                <th style={{ textAlign: "right" }}>{t("colStreak")}</th>
                <th style={{ textAlign: "right", padding: "4px 6px" }}>{t("colWins")}</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r) => (
                <tr key={r.id} style={{ background: r.you ? "rgba(201,162,39,.12)" : "transparent" }}>
                  <td style={{ padding: "6px", color: "var(--brass-light)", fontFamily: "var(--font-data)" }}>{r.rank}</td>
                  <td style={{ fontWeight: r.you ? 700 : 400 }}>{r.name}{r.you ? " ←" : ""}</td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-data)" }}>🔥{r.bestStreak}</td>
                  <td style={{ textAlign: "right", padding: "6px", fontFamily: "var(--font-data)" }}>{r.handsWon}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
