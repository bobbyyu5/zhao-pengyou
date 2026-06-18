import React, { useMemo, useState } from "react";
import Game from "./ui/Game.jsx";
import Settings from "./ui/Settings.jsx";
import Rules from "./ui/Rules.jsx";
import { Seal } from "./ui/Seal.jsx";
import { VideoTile, SelfView, VideoControls, VideoHint } from "./ui/Video.jsx";
import AdBanner from "./ui/AdBanner.jsx";
import { ThemeProvider } from "./theme/theme.jsx";
import { LanguageProvider, LangSwitch, useLang } from "./i18n/i18n.jsx";
import SoundToggle from "./ui/SoundToggle.jsx";
import { useLocalGame } from "./game/useLocalGame.js";
import { useOnlineGame, SERVER_URL } from "./net/useOnlineGame.js";
import { useWebRTC } from "./net/useWebRTC.js";
import { CONFIG, MIN_PLAYERS, MAX_PLAYERS } from "../engine/index.js";

const COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </LanguageProvider>
  );
}

// invite link: ?room=CODE lands straight on the join screen with the code prefilled
const INVITE_ROOM = (() => {
  try { return new URLSearchParams(window.location.search).get("room"); } catch { return null; }
})();
const IS_WECHAT = (() => {
  try { return /micromessenger/i.test(navigator.userAgent); } catch { return false; }
})();

function Root() {
  const [screen, setScreen] = useState(INVITE_ROOM ? "online" : "home");
  const [showRules, setShowRules] = useState(false);
  const [wechatDismissed, setWechatDismissed] = useState(false);
  const { t } = useLang();
  const local = useLocalGame();
  const online = useOnlineGame();
  const rtc = useWebRTC({ socket: online.socket, you: online.you, players: online.room?.players });

  const videoTiles = useMemo(() => {
    const tiles = {};
    for (const seat of Object.keys(online?.view ? rtc.remote : {})) {
      tiles[seat] = <VideoTile stream={rtc.remote[seat]} />;
    }
    return tiles;
  }, [rtc.remote, online?.view]);

  const wechatBanner = IS_WECHAT && !wechatDismissed ? (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 70, background: "var(--cinnabar-deep)",
      color: "var(--ivory)", fontSize: 12, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center",
      boxShadow: "var(--shadow-lift)",
    }}>
      <span style={{ flex: 1, lineHeight: 1.4 }}>{t("wechatBanner")}</span>
      <button className="tag" onClick={() => setWechatDismissed(true)}>{t("gotIt")}</button>
    </div>
  ) : null;

  if (screen === "online" && online.phase === "game" && online.view) {
    return (
      <>
        {wechatBanner}
        <Game {...online}
          videoTiles={videoTiles}
          videoControls={<VideoControls rtc={rtc} />}
          onExit={() => { rtc.stop(); online.actions.leave(); setScreen("home"); }} />
        <SelfView stream={rtc.localStream} camOn={rtc.camOn} />
        {rtc.error && <div className="toast">{rtc.error}</div>}
        <VideoHint show={rtc.videoHint && rtc.active} />
        <AdBanner />
      </>
    );
  }
  if (screen === "localGame" && local.view) {
    return <>{wechatBanner}<Game {...local} onExit={() => setScreen("home")} /><AdBanner /></>;
  }

  return (
    <div className="app">
      {wechatBanner}
      <AdBanner />
      {showRules && <Rules onClose={() => setShowRules(false)} />}
      {screen === "home" && <Home onLocal={() => setScreen("localSetup")} onOnline={() => setScreen("online")} onSettings={() => setScreen("settings")} onRules={() => setShowRules(true)} />}
      {screen === "settings" && <Settings onBack={() => setScreen("home")} />}
      {screen === "localSetup" && (
        <LocalSetup onBack={() => setScreen("home")} onStart={(n) => { local.actions.start(n); setScreen("localGame"); }} />
      )}
      {screen === "online" && (
        <Online online={online} rtc={rtc} initialCode={INVITE_ROOM} onBack={() => { rtc.stop(); online.actions.leave(); setScreen("home"); }} />
      )}
    </div>
  );
}

function Home({ onLocal, onOnline, onSettings, onRules }) {
  const { t } = useLang();
  return (
    <div className="splash">
      <div style={{ position: "absolute", top: 16, right: 12, display: "flex", gap: 6, alignItems: "center" }}><SoundToggle /><LangSwitch /></div>
      <div>
        <div className="wordmark">找朋友</div>
        <div className="sub">{t("subtitle")}</div>
      </div>
      <Seal />
      <div className="stack" style={{ width: "100%", maxWidth: 320 }}>
        <button className="btn btn-primary" onClick={onLocal}>{t("vsBots")} <span className="en" style={{ color: "inherit", opacity: .7 }}>{t("vsBotsSub")}</span></button>
        <button className="btn btn-cinnabar" onClick={onOnline}>{t("playOnline")} <span className="en" style={{ color: "inherit", opacity: .85 }}>{t("playOnlineSub")}</span></button>
        <div className="row">
          <button className="btn btn-ghost btn-sm" style={{ width: "auto", flex: 1 }} onClick={onRules}>{t("rulesBtn")}</button>
          <button className="btn btn-ghost btn-sm" style={{ width: "auto", flex: 1 }} onClick={onSettings}>{t("cardBacks")}</button>
        </div>
      </div>
      <p className="muted center" style={{ fontSize: 11, maxWidth: 300 }}>{t("homeTagline1")}</p>
    </div>
  );
}

function LocalSetup({ onBack, onStart }) {
  const { t } = useLang();
  const [n, setN] = useState(4);
  const cfg = CONFIG[n];
  return (
    <div className="stack" style={{ paddingTop: 24 }}>
      <div className="title-bar">
        <span className="brand" style={{ fontSize: 26 }}>找朋友</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}><LangSwitch /><button className="tag" onClick={onBack}>{t("back")}</button></span>
      </div>
      <div className="panel">
        <div className="field" style={{ marginBottom: 12 }}>
          <label>{t("players")}</label>
          <div className="seg">
            {COUNTS.map((c) => (
              <button key={c} className={n === c ? "active" : ""} onClick={() => setN(c)}>
                {c}
                {!CONFIG[c].confirmed && <span className="unconf">{t("uncalibrated")}</span>}
              </button>
            ))}
          </div>
        </div>
        <ConfigSummary cfg={cfg} />
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => onStart(n)}>{t("deal")}</button>
        {!cfg.confirmed && <p className="cinnabar-text center" style={{ fontSize: 11, marginBottom: 0 }}>{t("unconfirmedWarn")}</p>}
      </div>
    </div>
  );
}

function ConfigSummary({ cfg }) {
  const { t } = useLang();
  const items = [
    [t("cfgDecks"), cfg.decks], [t("cfgHand"), cfg.perPlayer], [t("cfgKitty"), cfg.kitty],
    [t("cfgFriends"), cfg.friends], [t("cfgPoints"), cfg.totalPoints], [t("cfgPass"), cfg.passLine],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
      {items.map(([k, v]) => (
        <div key={k} className="center" style={{ background: "var(--felt-deep)", borderRadius: 8, padding: "8px 4px" }}>
          <div className="data brass-text" style={{ fontSize: 20 }}>{v}</div>
          <div className="muted" style={{ fontSize: 10 }}>{k}</div>
        </div>
      ))}
    </div>
  );
}

function Online({ online, rtc, onBack, initialCode }) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [code, setCode] = useState((initialCode || "").toUpperCase());
  const [players, setPlayers] = useState(4);

  if (!SERVER_URL) {
    return (
      <div className="stack" style={{ paddingTop: 24 }}>
        <div className="title-bar"><span className="brand" style={{ fontSize: 26 }}>{t("online")}</span><span style={{ display: "flex", gap: 6 }}><LangSwitch /><button className="tag" onClick={onBack}>{t("back")}</button></span></div>
        <div className="panel">
          <p className="head">{t("serverMissingTitle")}</p>
          <p className="en">{t("serverMissingBody")}</p>
          <p className="muted" style={{ fontSize: 12 }}>{t("serverMissingNote")}</p>
        </div>
      </div>
    );
  }

  if (online.phase === "lobby" && online.room) {
    return <Lobby online={online} rtc={rtc} onBack={onBack} />;
  }

  return (
    <div className="stack" style={{ paddingTop: 24 }}>
      <div className="title-bar"><span className="brand" style={{ fontSize: 26 }}>{t("online")}</span><span style={{ display: "flex", gap: 6 }}><LangSwitch /><button className="tag" onClick={onBack}>{t("back")}</button></span></div>
      {online.error && <div className="panel cinnabar-text">{t("cantConnectServer")}</div>}
      <div className="panel">
        <div className="field" style={{ marginBottom: 12 }}>
          <label>{t("displayName")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("yourName")} maxLength={8} />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>{t("createForN")}</label>
          <div className="seg">
            {COUNTS.map((c) => <button key={c} className={players === c ? "active" : ""} onClick={() => setPlayers(c)}>{c}</button>)}
          </div>
        </div>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={() => online.actions.createRoom(name.trim(), players)}>{t("createRoom")}</button>
      </div>
      <div className="panel">
        <div className="field" style={{ marginBottom: 12 }}>
          <label>{t("roomCode")}</label>
          <input className="input code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD" maxLength={6} />
        </div>
        <button className="btn btn-cinnabar" disabled={!name.trim() || code.length < 4} onClick={() => online.actions.joinRoom(name.trim(), code)}>{t("joinRoom")}</button>
      </div>
    </div>
  );
}

function Lobby({ online, rtc, onBack }) {
  const { t } = useLang();
  const room = online.room;
  const isHost = online.you === room.host;
  const filled = room.seats.filter(Boolean).length;
  const [copied, setCopied] = useState(false);

  function copyInvite() {
    const link = `${window.location.origin}${window.location.pathname}?room=${room.code}`;
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 2200); };
    try {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(done, done);
      else { // fallback for older / in-app browsers
        const ta = document.createElement("textarea"); ta.value = link; document.body.appendChild(ta);
        ta.select(); document.execCommand("copy"); document.body.removeChild(ta); done();
      }
    } catch { done(); }
  }

  return (
    <div className="stack" style={{ paddingTop: 24 }}>
      {copied && <div className="toast">{t("copied")}</div>}
      <div className="title-bar"><span className="brand" style={{ fontSize: 26 }}>{t("lobby")}</span><span style={{ display: "flex", gap: 6 }}><LangSwitch /><button className="tag" onClick={onBack}>{t("leave")}</button></span></div>
      <div className="panel center">
        <div className="muted" style={{ fontSize: 12 }}>{t("roomCode")}</div>
        <div className="data" style={{ fontSize: 40, letterSpacing: 8, color: "var(--brass-light)" }}>{room.code}</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{t("shareCode")}</div>
        <button className="btn btn-primary btn-sm" style={{ width: "100%" }} onClick={copyInvite}>🔗 {t("copyInvite")}</button>
      </div>
      <div className="panel">
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{t("seats")} ({filled}/{room.players})</div>
        <div className="players-pill">
          {room.seats.map((s, i) => (
            <span key={i} className={`pp ${s ? "ready" : ""}`}>
              {i + 1}. {s ? (s.bot ? `${s.name}🤖` : s.name) : t("emptySeat")}{i === room.host ? " 👑" : ""}
            </span>
          ))}
        </div>
        {isHost && (
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={online.actions.addBots}>{t("fillBots")}</button>
            <button className="btn btn-primary btn-sm" disabled={filled < 2} onClick={online.actions.startGame}>{t("startGame")}</button>
          </div>
        )}
        {!isHost && <p className="muted center" style={{ fontSize: 12, marginTop: 10 }}>{t("waitHost")}</p>}
      </div>
      <div className="panel center">
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>{t("videoPrompt")}</p>
        {rtc && !rtc.active && <button className="btn btn-ghost btn-sm" onClick={rtc.start}>{t("startCamera")}</button>}
        {rtc && rtc.active && (
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn btn-ghost btn-sm" onClick={rtc.toggleMic}>{rtc.micOn ? t("muteOn") : t("muteOff")}</button>
            <button className="btn btn-ghost btn-sm" onClick={rtc.toggleCam}>{rtc.camOn ? t("camOff") : t("camOn")}</button>
          </div>
        )}
        {rtc?.error && <p className="cinnabar-text" style={{ fontSize: 11 }}>{rtc.error}</p>}
      </div>
    </div>
  );
}
