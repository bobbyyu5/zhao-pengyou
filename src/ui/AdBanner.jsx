import React, { useEffect, useState } from "react";

/**
 * Ad slot. AdMob is a NATIVE Android SDK — it cannot run in the browser / a TWA — so this
 * component is a deliberate **no-op on the web** (returns null) and only shows a real banner
 * inside the Capacitor native app. That keeps the live family PWA completely ad-free while the
 * Play Store build monetizes. The native deps aren't bundled into the web app (dynamic import
 * is hidden from Vite), so `npm run build` stays lean.
 *
 * Put your real unit ID in VITE_ADMOB_BANNER_ID; the default is Google's official TEST id.
 */
const ADMOB_PKG = "@capacitor-community/admob"; // resolved only in the native build
const TEST_BANNER_ID = "ca-app-pub-3940256099942544/6300978111"; // Google's test banner

function isNative() {
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  catch { return false; }
}

export default function AdBanner() {
  const [native, setNative] = useState(false);
  useEffect(() => {
    if (!isNative()) return;
    setNative(true);
    showBanner().catch(() => {});
    return () => { hideBanner().catch(() => {}); };
  }, []);

  // On the web (and TWA) this renders nothing. On native, AdMob draws its own bottom overlay;
  // we just reserve height so it never covers the Play button.
  if (!native) return null;
  return <div style={{ height: 56, flex: "0 0 auto" }} aria-hidden="true" />;
}

async function showBanner() {
  const { AdMob, BannerAdPosition, BannerAdSize } = await import(/* @vite-ignore */ ADMOB_PKG);
  await AdMob.initialize({});
  // GDPR / consent (Google UMP) — show the consent form when required, before any ad.
  try {
    const info = await AdMob.requestConsentInfo();
    if (info?.isConsentFormAvailable && info?.status === "REQUIRED") await AdMob.showConsentForm();
  } catch { /* consent optional in non-EEA */ }
  await AdMob.showBanner({
    adId: (import.meta.env && import.meta.env.VITE_ADMOB_BANNER_ID) || TEST_BANNER_ID,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 0,
  });
}

async function hideBanner() {
  const { AdMob } = await import(/* @vite-ignore */ ADMOB_PKG);
  await AdMob.hideBanner();
}
