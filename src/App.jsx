import React, { useMemo, useState } from "react";
import Game from "./ui/Game.jsx";
import Settings from "./ui/Settings.jsx";
import { Seal } from "./ui/Seal.jsx";
import { VideoTile, SelfView, VideoControls } from "./ui/Video.jsx";
import { ThemeProvider } from "./theme/theme.jsx";
import { useLocalGame } from "./game/useLocalGame.js";
import { useOnlineGame, SERVER_URL } from "./net/useOnlineGame.js";
import { useWebRTC } from "./net/useWebRTC.js";
import { CONFIG, MIN_PLAYERS, MAX_PLAYERS } from "../engine/index.js";

const COUNTS = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

export default function App() {
  return (
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  );
}

function Root() {
  const [screen, setScreen] = useState("home"); // home | localSetup | localGame | online | settings
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

  // route online by its own phase
  if (screen === "online" && online.phase === "game" && online.view) {
    return (
      <>
        <Game {...online}
          videoTiles={videoTiles}
          videoControls={<VideoControls rtc={rtc} />}
          onExit={() => { rtc.stop(); online.actions.leave(); setScreen("home"); }} />
        <SelfView stream={rtc.localStream} camOn={rtc.camOn} />
        {rtc.error && <div className="toast">{rtc.error}</div>}
      </>
    );
  }
  if (screen === "localGame" && local.view) {
    return <Game {...local} onExit={() => setScreen("home")} />;
  }

  return (
    <div className="app">
      {screen === "home" && <Home onLocal={() => setScreen("localSetup")} onOnline={() => setScreen("online")} onSettings={() => setScreen("settings")} />}
      {screen === "settings" && <Settings onBack={() => setScreen("home")} />}
      {screen === "localSetup" && (
        <LocalSetup onBack={() => setScreen("home")} onStart={(n) => { local.actions.start(n); setScreen("localGame"); }} />
      )}
      {screen === "online" && (
        <Online online={online} rtc={rtc} onBack={() => { rtc.stop(); online.actions.leave(); setScreen("home"); }} />
      )}
    </div>
  );
}

function Home({ onLocal, onOnline, onSettings }) {
  return (
    <div className="splash">
      <div>
        <div className="wordmark">找朋友</div>
        <div className="sub">ZHAO PENGYOU · FIND FRIENDS</div>
      </div>
      <Seal />
      <div className="stack" style={{ width: "100%", maxWidth: 320 }}>
        <button className="btn btn-primary" onClick={onLocal}>单机对战 <span className="en" style={{ color: "inherit", opacity: .7 }}>vs bots</span></button>
        <button className="btn btn-cinnabar" onClick={onOnline}>多人联机 <span className="en" style={{ color: "inherit", opacity: .85 }}>play online</span></button>
        <button className="btn btn-ghost" onClick={onSettings}>牌背设计 <span className="en" style={{ color: "inherit", opacity: .7 }}>card backs</span></button>
      </div>
      <p className="muted center" style={{ fontSize: 11, maxWidth: 300 }}>
        把链接发给亲友，加到主屏幕即可当 App 用。<br />
        <span className="en">Share the link · add to home screen · plays like an app.</span>
      </p>
    </div>
  );
}

function LocalSetup({ onBack, onStart }) {
  const [n, setN] = useState(4);
  const cfg = CONFIG[n];
  return (
    <div className="stack" style={{ paddingTop: 24 }}>
      <div className="title-bar">
        <span className="brand" style={{ fontSize: 26 }}>找朋友</span>
        <button className="tag" onClick={onBack}>返回</button>
      </div>
      <div className="panel">
        <div className="field" style={{ marginBottom: 12 }}>
          <label>人数 Players</label>
          <div className="seg">
            {COUNTS.map((c) => (
              <button key={c} className={n === c ? "active" : ""} onClick={() => setN(c)}>
                {c}
                {!CONFIG[c].confirmed && <span className="unconf">未校准</span>}
              </button>
            ))}
          </div>
        </div>
        <ConfigSummary cfg={cfg} />
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => onStart(n)}>
          发牌开始 Deal
        </button>
        {!cfg.confirmed && (
          <p className="cinnabar-text center" style={{ fontSize: 11, marginBottom: 0 }}>
            ⚠ 8–10 人规则为推算值，待家庭实战校准。
          </p>
        )}
      </div>
    </div>
  );
}

function ConfigSummary({ cfg }) {
  const items = [
    ["牌副 Decks", cfg.decks], ["每人 Hand", cfg.perPlayer], ["底牌 Kitty", cfg.kitty],
    ["朋友 Friends", cfg.friends], ["总分 Points", cfg.totalPoints], ["过庄线 Pass", cfg.passLine],
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

function Online({ online, rtc, onBack }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [players, setPlayers] = useState(4);

  if (!SERVER_URL) {
    return (
      <div className="stack" style={{ paddingTop: 24 }}>
        <div className="title-bar"><span className="brand" style={{ fontSize: 26 }}>多人联机</span><button className="tag" onClick={onBack}>返回</button></div>
        <div className="panel">
          <p className="head">联机服务器未配置</p>
          <p className="en">No server configured. Set <code>VITE_SERVER_URL</code> at build time to your deployed Railway server, then this screen connects automatically.</p>
          <p className="muted" style={{ fontSize: 12 }}>单机对战已可完整体验全部规则。</p>
        </div>
      </div>
    );
  }

  if (online.phase === "lobby" && online.room) {
    return <Lobby online={online} rtc={rtc} onBack={onBack} />;
  }

  return (
    <div className="stack" style={{ paddingTop: 24 }}>
      <div className="title-bar"><span className="brand" style={{ fontSize: 26 }}>多人联机</span><button className="tag" onClick={onBack}>返回</button></div>
      {online.error && <div className="panel cinnabar-text">{online.error}</div>}
      <div className="panel">
        <div className="field" style={{ marginBottom: 12 }}>
          <label>昵称 Display name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="你的名字" maxLength={8} />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>人数 Players (创建房间)</label>
          <div className="seg">
            {COUNTS.map((c) => <button key={c} className={players === c ? "active" : ""} onClick={() => setPlayers(c)}>{c}</button>)}
          </div>
        </div>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={() => online.actions.createRoom(name.trim(), players)}>
          创建房间 Create room
        </button>
      </div>
      <div className="panel">
        <div className="field" style={{ marginBottom: 12 }}>
          <label>房间号 Room code</label>
          <input className="input code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD" maxLength={6} />
        </div>
        <button className="btn btn-cinnabar" disabled={!name.trim() || code.length < 4} onClick={() => online.actions.joinRoom(name.trim(), code)}>
          加入房间 Join room
        </button>
      </div>
    </div>
  );
}

function Lobby({ online, rtc, onBack }) {
  const room = online.room;
  const isHost = online.you === room.host;
  const filled = room.seats.filter(Boolean).length;
  return (
    <div className="stack" style={{ paddingTop: 24 }}>
      <div className="title-bar"><span className="brand" style={{ fontSize: 26 }}>等待大厅</span><button className="tag" onClick={onBack}>离开</button></div>
      <div className="panel center">
        <div className="muted" style={{ fontSize: 12 }}>房间号 ROOM CODE</div>
        <div className="data" style={{ fontSize: 40, letterSpacing: 8, color: "var(--brass-light)" }}>{room.code}</div>
        <div className="muted" style={{ fontSize: 12 }}>把房间号发给亲友 · share this code</div>
      </div>
      <div className="panel">
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>座位 Seats ({filled}/{room.players})</div>
        <div className="players-pill">
          {room.seats.map((s, i) => (
            <span key={i} className={`pp ${s ? "ready" : ""}`}>
              {i + 1}. {s ? (s.bot ? `${s.name}🤖` : s.name) : "空位…"}{i === room.host ? " 👑" : ""}
            </span>
          ))}
        </div>
        {isHost && (
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={online.actions.addBots}>补满机器人</button>
            <button className="btn btn-primary btn-sm" disabled={filled < 2} onClick={online.actions.startGame}>开始游戏</button>
          </div>
        )}
        {!isHost && <p className="muted center" style={{ fontSize: 12, marginTop: 10 }}>等待房主开始…</p>}
      </div>
      <div className="panel center">
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>开摄像头边玩边聊 · see &amp; hear each other</p>
        {rtc && !rtc.active && <button className="btn btn-ghost btn-sm" onClick={rtc.start}>📷 开启视频 Start camera</button>}
        {rtc && rtc.active && (
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn btn-ghost btn-sm" onClick={rtc.toggleMic}>{rtc.micOn ? "🎤 静音" : "🔇 取消静音"}</button>
            <button className="btn btn-ghost btn-sm" onClick={rtc.toggleCam}>{rtc.camOn ? "📹 关摄像头" : "🚫 开摄像头"}</button>
          </div>
        )}
        {rtc?.error && <p className="cinnabar-text" style={{ fontSize: 11 }}>{rtc.error}</p>}
      </div>
    </div>
  );
}
