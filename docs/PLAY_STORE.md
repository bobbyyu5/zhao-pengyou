# Publishing to Google Play with AdMob ads — step by step

**Decision baked in:** ads = **Google AdMob**, which is a *native* SDK. It does **not** run in a
TWA (the cheap "wrap the website" route), so we package with **Capacitor** — the same web app
you already have, plus a thin native Android shell that can run AdMob. Still publishes to Play.

> ⚠️ Ads only appear in the **Android app**. The web version at `zhao-pengyou.vercel.app` stays
> 100% ad-free (the `AdBanner` component is a no-op in the browser), so the family link is
> unaffected. Test ad units are used until you paste your real IDs.

What's already done in the repo: `AdBanner` ad-slot component (web no-op), `capacitor.config.json`,
a privacy policy at `public/privacy.html`, and the env hooks (`VITE_ADMOB_BANNER_ID`).

---

## Part 0 — Accounts you create (I can't; they need your identity + payment)
1. **Google Play Developer** — https://play.google.com/console — **$25 one-time**.
2. **Google AdMob** — https://admob.google.com — free. Create an **App** (Android) and a
   **Banner ad unit**. Copy two IDs:
   - App ID: `ca-app-pub-XXXX~XXXX`  → put in `capacitor.config.json` (`plugins.AdMob.applicationId`)
   - Banner unit ID: `ca-app-pub-XXXX/XXXX` → put in `.env` as `VITE_ADMOB_BANNER_ID`
3. Host the **privacy policy** (already at `/privacy.html` once deployed → `https://zhao-pengyou.vercel.app/privacy.html`). Edit the contact email in `public/privacy.html` first. AdMob + Play both require it.

## Part 1 — One-time native setup (on your computer; needs Android Studio)
Install Android Studio first (free). Then in the repo:
```bash
# install Capacitor + the AdMob plugin (these are NOT in the web build)
npm i @capacitor/core @capacitor/android @capacitor-community/admob
npm i -D @capacitor/cli

npm run build            # produce dist/
npx cap add android      # creates the android/ project (one time)
npx cap sync             # copies web build + plugins into android/
```
In `android/app/src/main/AndroidManifest.xml`, add your AdMob **App ID** meta-data (the Capacitor
AdMob plugin docs show the exact snippet) and ensure the INTERNET permission is present (it is by
default).

## Part 2 — Build & test
```bash
npx cap open android     # opens Android Studio
```
- Run on an emulator or a USB-connected phone. You should see the game with a **test banner** at
  the bottom (Google's test ad — don't click your own real ads ever, it gets you banned).
- Iterate on the web app as normal; after any web change: `npm run build && npx cap sync`.

## Part 3 — Sign & upload
1. In Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**. Create a
   keystore and **back it up safely** — losing it means you can never update the app.
2. In **Play Console**: create the app → fill the listing (use `docs/STORE_LISTING.md`), upload the
   `.aab`, set content rating, target audience, and the **privacy policy URL**.
3. Complete the **Data safety** form (declare: AdMob collects device identifiers for ads; no other
   personal data). Complete **Ads declaration** = yes, contains ads.
4. Submit for review (usually 1–3 days). Release to production (or start with internal/closed testing
   to try it with family first — recommended).

## Part 4 — Go live with real ads
- Replace the test IDs with your real AdMob App ID + banner unit ID (Part 0), rebuild, re-upload.
- Watch AdMob's dashboard. Realistic expectation at family/friends scale: **cents to a few dollars a
  month**. Ads pay off only at thousands of daily users — see `docs/ROADMAP.md`.

## iPhone later
Same Capacitor project also targets iOS (`npx cap add ios`), but Apple is **$99/yr**, stricter
review, and wants more than a wrapped site. Hold it until there's traction.

## Honest summary of effort
- Accounts + IDs: ~30 min (yours).
- Android Studio + first build: a couple of hours the first time.
- Listing + review: an afternoon + 1–3 day wait.
- The web app and engine carry over unchanged — the hard part is already built.
