/**
 * Pop-out floating mini player via the Document Picture-in-Picture API
 * (Chrome/Edge 116+). It floats above other tabs while you browse.
 * Built with vanilla DOM (no React portal) to keep it dependency-free.
 */

export interface PipState {
  title: string;
  artist: string;
  isPlaying: boolean;
  progress: number; // 0..100
  accent: string;
}

export interface PipCallbacks {
  getState(): PipState;
  onToggle(): void;
  onNext(): void;
  onPrev(): void;
  onClose(): void;
}

export function isPipSupported(): boolean {
  return typeof window !== "undefined" && "documentPictureInPicture" in window;
}

export async function openMiniPip(cb: PipCallbacks): Promise<() => void> {
  const pip = (
    window as unknown as {
      documentPictureInPicture: {
        requestWindow(options: { width: number; height: number }): Promise<Window>;
      };
    }
  ).documentPictureInPicture;

  const win = await pip.requestWindow({ width: 340, height: 210 });
  const doc = win.document;

  doc.title = "BeatFluid mini";
  const style = doc.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; margin: 0; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
    body { background: rgba(18,18,28,0.96); color: #fcfbfa; padding: 16px; }
    .t { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .a { font-size: 12px; color: #9c99a6; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar { height: 5px; background: rgba(255,255,255,0.12); border-radius: 5px; margin: 12px 0; overflow: hidden; }
    .fill { height: 100%; width: 0%; border-radius: 5px; background: var(--ac, #f3a6b2); transition: width 0.3s linear; }
    .row { display: flex; gap: 10px; justify-content: center; align-items: center; }
    button { border: none; background: rgba(255,255,255,0.08); color: #fff; font-size: 16px;
      width: 44px; height: 44px; border-radius: 50%; cursor: pointer; }
    button.main { background: var(--ac, #f3a6b2); color: #12121c; width: 52px; height: 52px; font-size: 19px; }
    .hint { text-align: center; font-size: 10px; color: #9c99a6; margin-top: 10px; }
  `;
  doc.head.appendChild(style);

  const wrap = doc.createElement("div");
  wrap.innerHTML = `
    <div class="t" id="t">Loading…</div>
    <div class="a" id="a"></div>
    <div class="bar"><div class="fill" id="f"></div></div>
    <div class="row">
      <button id="prev" title="Previous">⏮</button>
      <button id="tg" class="main" title="Play/Pause">▶</button>
      <button id="next" title="Next">⏭</button>
    </div>
    <div class="hint">BeatFluid floats above your tabs ✨</div>
  `;
  doc.body.appendChild(wrap);

  const elT = doc.getElementById("t")!;
  const elA = doc.getElementById("a")!;
  const elF = doc.getElementById("f")!;
  const elTg = doc.getElementById("tg")!;

  (doc.getElementById("prev") as HTMLButtonElement).onclick = () => cb.onPrev();
  (doc.getElementById("next") as HTMLButtonElement).onclick = () => cb.onNext();
  (elTg as HTMLButtonElement).onclick = () => cb.onToggle();

  const paint = () => {
    const s = cb.getState();
    elT.textContent = s.title;
    elA.textContent = s.artist;
    elF.style.width = `${Math.min(100, Math.max(0, s.progress))}%`;
    elTg.textContent = s.isPlaying ? "⏸" : "▶";
    doc.documentElement.style.setProperty("--ac", s.accent);
  };
  paint();
  const timer = window.setInterval(paint, 500);

  win.addEventListener(
    "pagehide",
    () => {
      window.clearInterval(timer);
      cb.onClose();
    },
    { once: true }
  );

  return () => win.close();
}
