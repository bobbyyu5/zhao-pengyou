import { useEffect, useRef, useState } from "react";

/**
 * Live video + audio among room members (the camaraderie layer). A WebRTC full mesh — each
 * pair of players holds a direct peer connection — signaled through the game's socket server.
 * Fine for a family table (≈4–7); a mesh gets heavy past ~8 peers. The NEW joiner always
 * initiates offers, which avoids signaling glare.
 *
 * Media never touches the server (only SDP/ICE signaling is relayed), so it stays private.
 * Needs HTTPS + camera/mic permission — works on the deployed site, not always on localhost.
 */
// STUN is always on (free, lets most home-network peers connect directly). TURN is a relay
// for players behind strict/cellular networks where direct connection fails — add keys via
// env (e.g. metered.ca Open Relay free tier or Twilio) and they're used automatically.
const ENV = import.meta.env || {};
function buildIce() {
  const ice = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ];
  const turnUrls = (ENV.VITE_TURN_URLS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (turnUrls.length && ENV.VITE_TURN_USERNAME && ENV.VITE_TURN_CREDENTIAL) {
    ice.push({ urls: turnUrls, username: ENV.VITE_TURN_USERNAME, credential: ENV.VITE_TURN_CREDENTIAL });
  }
  return ice;
}
const ICE = buildIce();

export function useWebRTC({ socket, you, players }) {
  const [localStream, setLocalStream] = useState(null);
  const [remote, setRemote] = useState({}); // seat -> MediaStream
  const [active, setActive] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState(null);

  const pcs = useRef({});       // seat -> RTCPeerConnection
  const localRef = useRef(null);

  function createPC(seat) {
    if (pcs.current[seat]) return pcs.current[seat];
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pcs.current[seat] = pc;
    if (localRef.current) localRef.current.getTracks().forEach((t) => pc.addTrack(t, localRef.current));
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit("rtc-signal", { toSeat: seat, data: { ice: e.candidate } }); };
    pc.ontrack = (e) => setRemote((r) => ({ ...r, [seat]: e.streams[0] }));
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) closePC(seat);
    };
    return pc;
  }

  async function offerTo(seat) {
    const pc = createPC(seat);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("rtc-signal", { toSeat: seat, data: { sdp: pc.localDescription } });
    } catch (e) { /* renegotiation may retry */ }
  }

  function closePC(seat) {
    const pc = pcs.current[seat];
    if (pc) { try { pc.close(); } catch {} delete pcs.current[seat]; }
    setRemote((r) => { const n = { ...r }; delete n[seat]; return n; });
  }

  async function start() {
    if (!socket || active) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 320 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      localRef.current = stream;
      setLocalStream(stream);
      setActive(true);
      // add tracks to any PCs already created (in case peers connected first)
      Object.values(pcs.current).forEach((pc) => stream.getTracks().forEach((t) => pc.addTrack(t, stream)));
      socket.emit("rtc-join");
    } catch (e) {
      setError("无法访问摄像头/麦克风 — 请检查权限。Camera/mic blocked.");
    }
  }

  function stop() {
    socket?.emit("rtc-leave");
    Object.keys(pcs.current).forEach((s) => closePC(Number(s)));
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocalStream(null);
    setActive(false);
    setRemote({});
  }

  function toggleMic() {
    const s = localRef.current; if (!s) return;
    const on = !micOn; setMicOn(on);
    s.getAudioTracks().forEach((t) => (t.enabled = on));
  }
  function toggleCam() {
    const s = localRef.current; if (!s) return;
    const on = !camOn; setCamOn(on);
    s.getVideoTracks().forEach((t) => (t.enabled = on));
  }

  useEffect(() => {
    if (!socket) return;
    const onPeers = ({ seats }) => { seats.forEach((seat) => { if (seat !== you) offerTo(seat); }); };
    const onJoined = ({ seat }) => { if (seat !== you) createPC(seat); /* wait for their offer */ };
    const onSignal = async ({ fromSeat, data }) => {
      const pc = createPC(fromSeat);
      try {
        if (data.sdp) {
          await pc.setRemoteDescription(data.sdp);
          if (data.sdp.type === "offer") {
            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            socket.emit("rtc-signal", { toSeat: fromSeat, data: { sdp: pc.localDescription } });
          }
        } else if (data.ice) {
          try { await pc.addIceCandidate(data.ice); } catch {}
        }
      } catch {}
    };
    const onLeft = ({ seat }) => closePC(seat);
    socket.on("rtc-peers", onPeers);
    socket.on("rtc-peer-joined", onJoined);
    socket.on("rtc-signal", onSignal);
    socket.on("rtc-peer-left", onLeft);
    return () => {
      socket.off("rtc-peers", onPeers);
      socket.off("rtc-peer-joined", onJoined);
      socket.off("rtc-signal", onSignal);
      socket.off("rtc-peer-left", onLeft);
    };
  }, [socket, you]);

  useEffect(() => () => stop(), []); // cleanup on unmount

  return { localStream, remote, active, micOn, camOn, error, start, stop, toggleMic, toggleCam };
}
