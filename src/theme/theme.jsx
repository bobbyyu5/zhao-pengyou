import React, { createContext, useContext, useEffect, useState } from "react";

/**
 * Card-back theme system. Backs are swappable and the catalog is extensible at runtime:
 * built-in designs ship in the bundle, and an optional remote manifest (public/card-backs.json
 * or VITE_CARD_BACKS_URL) can add NEW designs over time without an app redeploy. Each remote
 * design supplies a `css` background string injected into a <style> tag.
 */

export const BUILTIN_BACKS = [
  { id: "cinnabar-seal", name: "印章", en: "Cinnabar Seal", seal: true },
  { id: "pine-lattice", name: "松格", en: "Pine Lattice" },
  { id: "brass-medallion", name: "铜章", en: "Brass Medallion" },
  { id: "plum-blossom", name: "梅花", en: "Plum Blossom" },
  { id: "cloud-thunder", name: "回纹", en: "Cloud & Thunder" },
  { id: "wave-seigaiha", name: "青海波", en: "Seigaiha Waves" },
];

const STORE_KEY = "zhao.cardBack";
const REMOTE_URL = import.meta.env?.VITE_CARD_BACKS_URL || "./card-backs.json";

function load() { try { return localStorage.getItem(STORE_KEY) || "cinnabar-seal"; } catch { return "cinnabar-seal"; } }
function save(id) { try { localStorage.setItem(STORE_KEY, id); } catch {} }

const ThemeContext = createContext(null);
export function useTheme() { return useContext(ThemeContext); }

export function ThemeProvider({ children }) {
  const [cardBack, setCardBackState] = useState(load);
  const [remote, setRemote] = useState([]); // [{ id, name, en, css }]

  // fetch the remote manifest once; new designs appear automatically when it's updated
  useEffect(() => {
    let alive = true;
    fetch(REMOTE_URL, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data?.designs) return;
        const styleEl = document.createElement("style");
        styleEl.id = "remote-card-backs";
        styleEl.textContent = data.designs
          .filter((d) => d.id && d.css)
          .map((d) => `.cb-${cssSafe(d.id)}{background:${d.css} !important;}`)
          .join("\n");
        document.head.appendChild(styleEl);
        setRemote(data.designs.filter((d) => d.id && d.name));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  function setCardBack(id) { setCardBackState(id); save(id); }

  const designs = [...BUILTIN_BACKS, ...remote.filter((r) => !BUILTIN_BACKS.some((b) => b.id === r.id))];
  return (
    <ThemeContext.Provider value={{ cardBack, setCardBack, designs }}>
      {children}
    </ThemeContext.Provider>
  );
}

function cssSafe(s) { return String(s).replace(/[^a-z0-9_-]/gi, ""); }
