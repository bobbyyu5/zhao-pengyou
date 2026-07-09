import React, { createContext, useContext, useState } from "react";

/**
 * Lightweight i18n — 中文 / English / 日本語, switchable anytime, persisted in localStorage.
 * t("key", { vars }) looks up the current language and interpolates {var} placeholders.
 * The 找朋友 wordmark stays constant (it's the logo); everything else translates.
 */
export const LANGS = [
  { id: "zh", label: "中" },
  { id: "en", label: "EN" },
  { id: "ja", label: "日" },
];

const STORE_KEY = "zhao.lang";
function load() { try { return localStorage.getItem(STORE_KEY) || "zh"; } catch { return "zh"; } }
function save(l) { try { localStorage.setItem(STORE_KEY, l); } catch {} }

// id: { zh, en, ja }. Use {placeholders} for interpolation.
const DICT = {
  // common
  back: { zh: "返回", en: "Back", ja: "戻る" },
  close: { zh: "关闭", en: "Close", ja: "閉じる" },
  leave: { zh: "离开", en: "Leave", ja: "退出" },
  you: { zh: "你", en: "You", ja: "あなた" },
  clear: { zh: "清除", en: "Clear", ja: "クリア" },

  // home
  subtitle: { zh: "ZHAO PENGYOU · 找朋友", en: "ZHAO PENGYOU · FIND FRIENDS", ja: "ZHAO PENGYOU · 友達さがし" },
  vsBots: { zh: "单机对战", en: "Solo vs bots", ja: "一人で対戦" },
  vsBotsSub: { zh: "电脑对手", en: "vs bots", ja: "ボット相手" },
  playOnline: { zh: "多人联机", en: "Play online", ja: "オンライン対戦" },
  playOnlineSub: { zh: "和亲友", en: "with friends", ja: "友達と" },
  cardBacks: { zh: "牌背设计", en: "Card backs", ja: "カード裏デザイン" },
  cardBacksSub: { zh: "主题", en: "themes", ja: "テーマ" },
  homeTagline1: { zh: "把链接发给亲友，加到主屏幕即可当 App 用。", en: "Share the link · add to home screen · plays like an app.", ja: "リンクを送って、ホーム画面に追加すればアプリのように使えます。" },

  // setup
  players: { zh: "人数", en: "Players", ja: "人数" },
  deal: { zh: "发牌开始", en: "Deal", ja: "配牌開始" },
  uncalibrated: { zh: "未校准", en: "draft", ja: "未調整" },
  unconfirmedWarn: { zh: "⚠ 8–10 人规则为推算值，待家庭实战校准。", en: "⚠ 8–10 player rules are estimates — confirm after a real game.", ja: "⚠ 8〜10人のルールは暫定です。実戦後に調整してください。" },
  cfgDecks: { zh: "牌副", en: "Decks", ja: "デッキ" },
  cfgHand: { zh: "每人", en: "Hand", ja: "手札" },
  cfgKitty: { zh: "底牌", en: "Kitty", ja: "底札" },
  cfgFriends: { zh: "朋友", en: "Friends", ja: "友" },
  cfgPoints: { zh: "总分", en: "Points", ja: "総点" },
  cfgPass: { zh: "过庄线", en: "Pass", ja: "ライン" },

  // online menu / lobby
  online: { zh: "多人联机", en: "Play online", ja: "オンライン対戦" },
  serverMissingTitle: { zh: "联机服务器未配置", en: "Online server not configured", ja: "サーバー未設定" },
  serverMissingBody: { zh: "未设置 VITE_SERVER_URL。配置已部署的服务器地址后，本页会自动连接。", en: "Set VITE_SERVER_URL to your deployed server, then this screen connects automatically.", ja: "VITE_SERVER_URL を設定すると自動的に接続します。" },
  serverMissingNote: { zh: "单机对战已可完整体验全部规则。", en: "Solo vs-bots play already runs the full ruleset.", ja: "一人対戦でも全ルールを楽しめます。" },
  displayName: { zh: "昵称", en: "Display name", ja: "ニックネーム" },
  yourName: { zh: "你的名字", en: "Your name", ja: "お名前" },
  createForN: { zh: "人数（创建房间）", en: "Players (create room)", ja: "人数（部屋を作成）" },
  createRoom: { zh: "创建房间", en: "Create room", ja: "部屋を作成" },
  roomCode: { zh: "房间号", en: "Room code", ja: "ルームコード" },
  joinRoom: { zh: "加入房间", en: "Join room", ja: "部屋に参加" },
  lobby: { zh: "等待大厅", en: "Lobby", ja: "ロビー" },
  shareCode: { zh: "把房间号发给亲友 · 分享此号码", en: "Share this code with friends", ja: "このコードを友達に共有" },
  copyInvite: { zh: "复制邀请链接", en: "Copy invite link", ja: "招待リンクをコピー" },
  copied: { zh: "已复制！发到微信即可", en: "Copied! Paste it into WeChat", ja: "コピーしました！" },
  wechatBanner: { zh: "在微信里请点右上角「···」→ 在浏览器打开，摄像头才能用。", en: "In WeChat, tap ⋯ (top-right) → Open in Browser so the camera works.", ja: "微信では右上「···」→ ブラウザで開くとカメラが使えます。" },
  gotIt: { zh: "知道了", en: "Got it", ja: "OK" },
  seats: { zh: "座位", en: "Seats", ja: "席" },
  emptySeat: { zh: "空位…", en: "empty…", ja: "空席…" },
  fillBots: { zh: "补满机器人", en: "Fill with bots", ja: "ボットで埋める" },
  startGame: { zh: "开始游戏", en: "Start game", ja: "ゲーム開始" },
  waitHost: { zh: "等待房主开始…", en: "Waiting for the host…", ja: "ホストを待っています…" },
  videoPrompt: { zh: "开摄像头边玩边聊 · 看到彼此", en: "Turn on camera — see & hear each other", ja: "カメラをオンにして顔を見ながら遊ぶ" },
  startCamera: { zh: "📷 开启视频", en: "📷 Start camera", ja: "📷 カメラ開始" },
  muteOn: { zh: "🎤 静音", en: "🎤 Mute", ja: "🎤 ミュート" },
  muteOff: { zh: "🔇 取消静音", en: "🔇 Unmute", ja: "🔇 解除" },
  camOff: { zh: "📹 关摄像头", en: "📹 Camera off", ja: "📹 カメラ停止" },
  camOn: { zh: "🚫 开摄像头", en: "🚫 Camera on", ja: "🚫 カメラ再開" },
  cantConnectServer: { zh: "无法连接服务器", en: "Server unreachable", ja: "サーバーに接続できません" },

  // leave-game confirmation
  leaveConfirmTitle: { zh: "离开游戏？", en: "Leave the game?", ja: "ゲームを退出しますか？" },
  leaveConfirmBody: { zh: "当前这局会丢失，无法恢复。", en: "The current game will be lost and can't be recovered.", ja: "現在のゲームは失われ、元に戻せません。" },
  leaveConfirmYes: { zh: "离开", en: "Leave", ja: "退出" },
  leaveConfirmNo: { zh: "继续游戏", en: "Keep playing", ja: "続ける" },

  // video fallback
  videoTrouble: { zh: "摄像头连接失败 — 在 WiFi 下效果最好（手机流量可能连不上）。", en: "Camera couldn't connect — works best on WiFi (cellular may block it).", ja: "カメラに接続できませんでした — WiFiで最適です（モバイル回線は不可の場合あり）。" },

  // game / HUD
  stats: { zh: "战绩", en: "Stats", ja: "成績" },
  roundOverTag: { zh: "结束", en: "End", ja: "終了" },
  handTag: { zh: "第{n}手·{p}人", en: "Hand {n} · {p}p", ja: "第{n}局 · {p}人" },
  trump: { zh: "主", en: "Trump", ja: "切札" },
  noTrump: { zh: "无主", en: "No trump", ja: "切札なし" },
  level: { zh: "LEVEL", en: "LEVEL", ja: "LEVEL" },
  grabbers: { zh: "抓分 Grabbers", en: "Grabbers", ja: "得点側" },
  yourHand: { zh: "你的手牌", en: "Your hand", ja: "あなたの手札" },
  friendCardsLabel: { zh: "朋友牌：", en: "Friend cards: ", ja: "友カード：" },
  play: { zh: "出牌", en: "Play", ja: "出す" },
  dealerBurying: { zh: "庄家正在埋牌…", en: "Dealer is burying the kitty…", ja: "親が底札を伏せています…" },
  yourTurnLead: { zh: "轮到你 · 出一张牌", en: "Your turn — play a card", ja: "あなたの番 — カードを出す" },
  yourTurnFollow: { zh: "轮到你 · 跟牌", en: "Your turn — follow", ja: "あなたの番 — 続けて出す" },
  yourTurn: { zh: "轮到你", en: "Your turn", ja: "あなたの番" },
  waitingPlay: { zh: "等待出牌…", en: "Waiting…", ja: "待機中…" },
  trickWon: { zh: "{name} 赢墩 · {pts} 分", en: "{name} won the trick · {pts} pts", ja: "{name} がこの場を取った · {pts}点" },
  trickWonNoPts: { zh: "{name} 赢墩", en: "{name} won the trick", ja: "{name} がこの場を取った" },
  wonTag: { zh: "赢", en: "won", ja: "勝" },
  dealerCalling: { zh: "庄家正在叫朋友…", en: "Dealer is calling friends…", ja: "親が友を指名しています…" },

  // bidding
  bidTitle: { zh: "叫牌 · 亮{r}定主", en: "Bid · expose a {r} for trump", ja: "コール · {r}で切札を宣言" },
  bidBody: { zh: "亮出你的{r}定主。", en: "Expose your {r}s to claim trump.", ja: "{r}を見せて切札を宣言します。" },
  bidCurrent: { zh: "当前最高：{bid}", en: "High bid: {bid}", ja: "最高コール：{bid}" },
  bidNobody: { zh: "无人叫主", en: "no bid yet", ja: "まだコールなし" },
  bidNoTrump: { zh: "无主 (王 ×{n})", en: "No-trump (jokers ×{n})", ja: "切札なし (ジョーカー×{n})" },
  pass: { zh: "不叫", en: "Pass", ja: "パス" },
  passNoRank: { zh: "无本级牌 · 过", en: "no rank cards · pass", ja: "該当札なし · パス" },
  // live draw
  dealing: { zh: "发牌中…", en: "Dealing…", ja: "配牌中…" },
  drawTapBid: { zh: "想坐庄定主？点「叫牌」亮出你的 6（或王）。", en: "Want to claim trump? Tap Bid to expose your 6s (or jokers).", ja: "親になりたい？「コール」で6（やジョーカー）を見せます。" },
  bidBtn: { zh: "叫牌 · 亮主", en: "Bid", ja: "コール" },
  bidWindowTitle: { zh: "亮牌定主 · {n} 秒", en: "Expose to claim trump · {n}s", ja: "公開して切札を宣言 · {n}秒" },
  exposedBy: { zh: "{name} 亮出 {label}", en: "{name} exposed {label}", ja: "{name} が公開：{label}" },
  finalCall: { zh: "最后叫牌！", en: "Last call!", ja: "ラストコール！" },
  nothingToExpose: { zh: "你没有可亮的牌（无 6 无王）", en: "Nothing to expose (no 6s or jokers)", ja: "公開できる札がありません" },
  cancel: { zh: "取消", en: "Cancel", ja: "キャンセル" },
  bidCantBeat: { zh: "你的牌无法超过当前最高叫牌，请过牌。", en: "Your cards can't beat the high bid — tap Pass.", ja: "今のコールを超えられません。パスしてください。" },
  bidHowto: { zh: "亮更多张本级牌（或王）才能压过别人；压不过就过牌。", en: "Expose more rank cards (or jokers) to outbid; if you can't, pass.", ja: "より多くの級札（またはジョーカー）で上回ります。無理ならパス。" },

  // bury
  buryTitle: { zh: "埋牌 · 扣 {n} 张", en: "Bury {n} cards", ja: "底札 · {n}枚伏せる" },
  buryBody: { zh: "选 {n} 张扣下（已选 {h}/{n}）。", en: "Pick {n} cards to bury (selected {h}/{n}).", ja: "{n}枚選んで伏せます（選択 {h}/{n}）。" },
  buryBtn: { zh: "确认埋牌", en: "Bury", ja: "確定" },

  // call friends
  callTitle: { zh: "叫朋友 · 选 {n} 张", en: "Call {n} friend card(s)", ja: "友を指名 · {n}枚" },
  callBody: { zh: "第一个打出该牌的人成为你的朋友。", en: "First player to PLAY a called card joins your side.", ja: "そのカードを最初に出した人が味方になります。" },
  selected: { zh: "已选：", en: "Selected: ", ja: "選択：" },
  callBtn: { zh: "确认叫朋友", en: "Call", ja: "確定" },

  // scoring
  tier_dealer_loses: { zh: "庄家失败", en: "Dealer loses", ja: "親の負け" },
  tier_dealer_wins: { zh: "庄家胜", en: "Dealer wins", ja: "親の勝ち" },
  tier_small_sweep: { zh: "小光", en: "Small sweep 小光", ja: "小光" },
  tier_big_sweep: { zh: "大光", en: "Big sweep 大光", ja: "大光" },
  gouDaoDi: { zh: "钩到底！", en: "Gou Dao Di 钩到底!", ja: "鈎到底（コウダオディ）！" },
  scoreGrab: { zh: "抓分方 {g} / {line}", en: "grabbers {g} / {line}", ja: "得点側 {g} / {line}" },
  kittyBonus: { zh: " (+{k} 底)", en: " (+{k} kitty)", ja: " (+{k} 底)" },
  roleDealer: { zh: "庄", en: "Dealer", ja: "親" },
  roleFriend: { zh: "友", en: "Friend", ja: "友" },
  toLevel: { zh: "打{lvl}", en: "→ {lvl}", ja: "{lvl}へ" },
  soloDealer: { zh: "庄家单干 — 无朋友调整", en: "solo dealer — no friend change", ja: "親の単独戦 — 友の変動なし" },
  nextHand: { zh: "下一手", en: "Next hand", ja: "次の局" },
  seeResult: { zh: "查看结果", en: "See result", ja: "結果を見る" },
  roundOver: { zh: "本轮结束", en: "Round over", ja: "ラウンド終了" },
  dealerPassedA: { zh: "庄家方过 A，赢得本轮！", en: "Dealer side passed A — they win the round!", ja: "親側がAを超え、ラウンド勝利！" },
  roundComplete: { zh: "本轮完成。", en: "Round complete.", ja: "ラウンド完了。" },
  home: { zh: "回到首页", en: "Home", ja: "ホームへ" },

  // settings
  chooseBack: { zh: "选择牌背", en: "Choose card back", ja: "カード裏を選択" },
  backsUpdateNote: { zh: "新牌背会不定期更新（无需重新安装）。", en: "New designs arrive over time automatically — no reinstall needed.", ja: "新しいデザインは随時自動で追加されます（再インストール不要）。" },

  // progression / unlocks
  locked: { zh: "未解锁", en: "Locked", ja: "未解放" },
  unlockHandsWon: { zh: "赢 {n} 手解锁", en: "Win {n} hand(s)", ja: "{n}局勝利で解放" },
  unlockHandsPlayed: { zh: "玩 {n} 手解锁", en: "Play {n} hands", ja: "{n}局プレイで解放" },
  unlockRoundsWon: { zh: "赢一轮解锁", en: "Win a round", ja: "ラウンド勝利で解放" },
  unlockStreak: { zh: "连续 {n} 天解锁", en: "{n}-day streak", ja: "{n}日連続で解放" },
  newBackUnlocked: { zh: "🎉 解锁新牌背：{name}！", en: "🎉 New card back unlocked: {name}!", ja: "🎉 新しいカード裏を解放：{name}！" },
  streakChip: { zh: "🔥 连续 {n} 天", en: "🔥 {n}-day streak", ja: "🔥 {n}日連続" },
  yourProgress: { zh: "战绩：{played} 手 · {won} 胜", en: "{played} hands · {won} wins", ja: "{played}局 · {won}勝" },

  // friends + leaderboard
  friends: { zh: "好友榜", en: "Friends", ja: "フレンド" },
  yourFriendCode: { zh: "你的好友码", en: "Your friend code", ja: "あなたのコード" },
  copyCode: { zh: "复制好友码", en: "Copy code", ja: "コードをコピー" },
  addFriendLabel: { zh: "添加好友（输入对方的码）", en: "Add a friend (enter their code)", ja: "フレンド追加（相手のコード）" },
  add: { zh: "添加", en: "Add", ja: "追加" },
  friendAdded: { zh: "已添加好友：{name}", en: "Added {name}!", ja: "{name} を追加しました！" },
  friendNotFound: { zh: "找不到该好友码", en: "Friend code not found", ja: "コードが見つかりません" },
  leaderboard: { zh: "排行榜（按最佳连胜）", en: "Leaderboard (by best streak)", ja: "ランキング（最高連続）" },
  noFriendsYet: { zh: "还没有好友。分享你的码，一起上榜！", en: "No friends yet — share your code to compete!", ja: "まだフレンドがいません。コードを共有しよう！" },
  colWins: { zh: "胜", en: "Wins", ja: "勝" },
  colStreak: { zh: "最佳", en: "Best", ja: "最高" },
  signedInAs: { zh: "已登录：{name}", en: "Signed in as {name}", ja: "ログイン中：{name}" },
  signInHint: { zh: "用 Google 登录，进度跟着你换手机", en: "Sign in to carry your progress to a new phone", ja: "ログインで進捗を別の端末へ引き継ぎ" },

  // rules / scoring reference
  rulesBtn: { zh: "规则", en: "Rules", ja: "ルール" },
  rulesTitle: { zh: "规则与算分", en: "Rules & Scoring", ja: "ルールと得点" },
  rulesObjectiveH: { zh: "目标", en: "Objective", ja: "目的" },
  rulesObjective: {
    zh: "庄家方守分，抓分方抢分。抓分方拿满“过庄线”就赢这手并坐庄。",
    en: "The dealer's side defends points; the grabbers try to capture them. Reach the pass line and the grabbers win the hand and take the deal.",
    ja: "親側は点を守り、得点側は点を奪います。ラインに達すれば得点側がその局に勝ち、親を奪います。",
  },
  rulesPassH: { zh: "过庄线 — 赢这手需要多少分", en: "Pass line — points needed to win", ja: "ライン — 勝つのに必要な点" },
  rulesPass: {
    zh: "本桌 {p} 副牌，共 {tp} 分。抓分方需 ≥ {line} 分翻庄。",
    en: "This table: {p} decks, {tp} points total. Grabbers need ≥ {line} to flip the dealer.",
    ja: "このテーブル：{p}デッキ、計{tp}点。得点側は{line}点以上で親を倒します。",
  },
  rulesTiersH: { zh: "算分（按本桌分线）", en: "Scoring (this table's line)", ja: "得点（このラインで）" },
  rulesTierLose: {
    zh: "抓 ≥ {line}：庄家失败 — 庄 −2 级，友 −1 级",
    en: "grabbers ≥ {line}: dealer loses — dealer −2 levels, friend −1",
    ja: "得点 {line}以上：親の負け — 親−2、友−1",
  },
  rulesTierWin: {
    zh: "{half}–{lineless}：庄家胜 — 庄 +2，友 +1",
    en: "{half}–{lineless}: dealer wins — dealer +2, friend +1",
    ja: "{half}〜{lineless}：親の勝ち — 親+2、友+1",
  },
  rulesTierSmall: {
    zh: "1–{halfless}：小光 — 庄 +3，友 +2",
    en: "1–{halfless}: small sweep — dealer +3, friend +2",
    ja: "1〜{halfless}：小光 — 親+3、友+2",
  },
  rulesTierBig: {
    zh: "0：大光 — 庄 +4，友 +3",
    en: "0: big sweep — dealer +4, friend +3",
    ja: "0：大光 — 親+4、友+3",
  },
  rulesWinH: { zh: "如何赢得本轮", en: "Winning the round", ja: "ラウンドの勝ち方" },
  rulesWin: {
    zh: "庄家方每赢一手升级（6→7→…→A）。先打过 A 者赢得本轮。",
    en: "The dealer's side climbs a level each win (6→7→…→A). First side to pass A wins the round.",
    ja: "親側は勝つごとに昇級（6→7→…→A）。最初にAを越えた側がラウンド勝利。",
  },
  rulesTrumpH: { zh: "主牌大小", en: "Trump order (high → low)", ja: "切札の強さ（強→弱）" },
  rulesTrump: {
    zh: "大王 > 小王 > 主级牌(本花) > 主级牌(他花) > 主花色 A→2 > 其它花色 A→2",
    en: "Big joker > small joker > level card (trump suit) > level cards (off-suit) > trump suit A→2 > other suits A→2",
    ja: "大王 > 小王 > 級札(切札スート) > 級札(他スート) > 切札スートA→2 > 他スートA→2",
  },
  rulesPointsH: { zh: "分牌", en: "Point cards", ja: "点札" },
  rulesPoints: { zh: "5 = 5 分 · 10 = 10 分 · K = 10 分", en: "5 = 5 pts · 10 = 10 pts · K = 10 pts", ja: "5＝5点 · 10＝10点 · K＝10点" },
  rulesFriendH: { zh: "朋友机制", en: "Finding friends", ja: "友の仕組み" },
  rulesFriend: {
    zh: "庄家叫一张牌；第一个打出它的人成为庄家方朋友（隐藏的队友）。",
    en: "The dealer calls a card; the first player to play it becomes the dealer's hidden friend.",
    ja: "親がカードを指名。最初にそれを出した人が親側の隠れた味方になります。",
  },

  // stats
  statsTitle: { zh: "战绩", en: "Stats", ja: "成績" },
  noHands: { zh: "本局还没有完成的牌可统计。", en: "No completed hands yet.", ja: "まだ完了した局がありません。" },
  levelProgress: { zh: "等级进度", en: "Level progression", ja: "レベル推移" },
  pointsPerHand: { zh: "每手抓分", en: "Grabber points / hand", ja: "局ごとの得点" },

  // seal / friend
  friendFound: { zh: "找到朋友！", en: "Friend found!", ja: "友が見つかった！" },
  joinsSide: { zh: "{name} 加入庄家方", en: "{name} joins the dealer's side", ja: "{name} が親側に加わりました" },
  youAreFriend: { zh: "你是朋友（庄家方）", en: "You're the friend (dealer's side)", ja: "あなたは友（親側）です" },
  youAreDealer: { zh: "你是庄家", en: "You're the dealer", ja: "あなたは親です" },

  // video controls (titles)
  videoTag: { zh: "📷 视频", en: "📷 Video", ja: "📷 映像" },

  // seat names (4p relative)
  seat_next: { zh: "下家", en: "Next", ja: "下家" },
  seat_across: { zh: "对家", en: "Across", ja: "対面" },
  seat_prev: { zh: "上家", en: "Prev", ja: "上家" },
  seat_player: { zh: "玩家{r}", en: "Player {r}", ja: "プレイヤー{r}" },
  dealerBadge: { zh: "庄", en: "D", ja: "親" },
};

// suit names per language
export const SUIT_NAME = {
  S: { zh: "黑桃", en: "Spades", ja: "スペード" },
  H: { zh: "红桃", en: "Hearts", ja: "ハート" },
  C: { zh: "梅花", en: "Clubs", ja: "クラブ" },
  D: { zh: "方块", en: "Diamonds", ja: "ダイヤ" },
};

function interp(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

const LangContext = createContext(null);
export function useLang() { return useContext(LangContext); }

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(load);
  function setLang(l) { setLangState(l); save(l); }
  function t(key, vars) {
    const entry = DICT[key];
    if (!entry) return key;
    return interp(entry[lang] ?? entry.zh, vars);
  }
  function suitName(suit) { return (SUIT_NAME[suit]?.[lang]) ?? SUIT_NAME[suit]?.zh ?? ""; }
  return <LangContext.Provider value={{ lang, setLang, t, suitName }}>{children}</LangContext.Provider>;
}

/**
 * Resolve a seat's display name. Real names (from a `names` array, e.g. online players) win;
 * otherwise a translated relative label (You / Next / Across / Prev, or Player N). Reactive to
 * the current language, so it re-translates when the player switches languages mid-game.
 */
export function seatName(seat, players, you, names, t) {
  if (names && names[seat]) return names[seat];
  const r = (seat - you + players) % players;
  if (r === 0) return t("you");
  if (players === 4) return [null, t("seat_next"), t("seat_across"), t("seat_prev")][r];
  return t("seat_player", { r });
}

/** Compact 中 / EN / 日 switcher chip. */
export function LangSwitch({ compact }) {
  const ctx = useLang();
  if (!ctx) return null;
  const { lang, setLang } = ctx;
  return (
    <span className="lang-switch" role="group" aria-label="language">
      {LANGS.map((l) => (
        <button key={l.id} className={lang === l.id ? "active" : ""} onClick={() => setLang(l.id)}>{l.label}</button>
      ))}
    </span>
  );
}
