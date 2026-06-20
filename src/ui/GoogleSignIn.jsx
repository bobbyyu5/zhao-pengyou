import React, { useEffect, useRef, useState } from "react";
import { useLang } from "../i18n/i18n.jsx";
import { googleClientId, cloudEnabled, googleSignIn, getAccountName, syncProgress } from "../account/account.js";
import { getProgress, mergeRemote } from "../progress/progress.js";

/**
 * "Sign in with Google" via Google Identity Services. Renders ONLY when both cloud sync and a
 * VITE_GOOGLE_CLIENT_ID are configured — so it's invisible/dormant until you set it up. Signing
 * in claims the guest account on the server (merging its progress), so streaks follow the player
 * to a new phone.
 */
export default function GoogleSignIn() {
  const { t } = useLang();
  const ref = useRef(null);
  const [name, setName] = useState(getAccountName());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!cloudEnabled || !googleClientId || name) return;
    let tries = 0;
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) { clearInterval(timer); setReady(true); init(); }
      else if (++tries > 40) clearInterval(timer); // ~6s; GIS script blocked/offline
    }, 150);
    return () => clearInterval(timer);
  }, []);

  function init() {
    try {
      window.google.accounts.id.initialize({ client_id: googleClientId, callback: onCredential });
      if (ref.current) window.google.accounts.id.renderButton(ref.current, { theme: "filled_black", size: "large", shape: "pill", text: "signin_with" });
    } catch {}
  }

  function onCredential(resp) {
    googleSignIn(resp.credential).then((j) => {
      if (j?.name) {
        setName(j.name);
        syncProgress(getProgress()).then((m) => m && mergeRemote(m));
      }
    });
  }

  if (!cloudEnabled || !googleClientId) return null;
  if (name) return <p className="muted" style={{ fontSize: 11 }}>{t("signedInAs", { name })}</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div ref={ref} />
      {ready && <p className="muted" style={{ fontSize: 10, maxWidth: 240, textAlign: "center" }}>{t("signInHint")}</p>}
    </div>
  );
}
