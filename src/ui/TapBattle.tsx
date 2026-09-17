import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { fireBlast } from "../shared/blast";
import "./tap-battle.css";

type Phase = "count" | "play" | "done";

const RED: [number, number, number] = [1, 0.25, 0.3];
const BLUE: [number, number, number] = [0.25, 0.55, 1];
const GAME_SECONDS = 15;

interface TapBattleProps {
  onClose: () => void;
}

export function TapBattle({ onClose }: TapBattleProps) {
  const [phase, setPhase] = useState<Phase>("count");
  const [count, setCount] = useState(3);
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(0);
  const [time, setTime] = useState(GAME_SECONDS);

  // 3-2-1 countdown
  useEffect(() => {
    if (phase !== "count") return;
    if (count <= 0) {
      setPhase("play");
      return;
    }
    const timer = window.setTimeout(() => setCount((c) => c - 1), 800);
    return () => window.clearTimeout(timer);
  }, [phase, count]);

  // Game clock (100ms ticks for a smooth bar)
  useEffect(() => {
    if (phase !== "play") return;
    if (time <= 0) {
      setPhase("done");
      // Confetti cannons in the winner's colour
      const winner = left === right ? null : left > right ? RED : BLUE;
      if (winner) {
        for (let i = 0; i < 8; i++) {
          window.setTimeout(
            () =>
              fireBlast(
                0.15 + Math.random() * 0.7,
                0.15 + Math.random() * 0.7,
                1,
                winner
              ),
            i * 120
          );
        }
      }
      return;
    }
    const timer = window.setTimeout(
      () => setTime((s) => Math.max(0, Math.round((s - 0.1) * 10) / 10)),
      100
    );
    return () => window.clearTimeout(timer);
  }, [phase, time, left, right]);

  const tap = (side: "L" | "R") => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase !== "play") return;
    const x = event.clientX / window.innerWidth;
    const y = 1 - event.clientY / window.innerHeight;
    if (side === "L") {
      setLeft((s) => s + 1);
      fireBlast(x, y, 0.9, RED);
    } else {
      setRight((s) => s + 1);
      fireBlast(x, y, 0.9, BLUE);
    }
  };

  const rematch = () => {
    setLeft(0);
    setRight(0);
    setTime(GAME_SECONDS);
    setCount(3);
    setPhase("count");
  };

  return (
    <div className="battle-overlay">
      <button className="battle-close" onClick={onClose} aria-label="Close battle">
        ✕
      </button>

      {phase === "count" && (
        <div className="battle-center">
          <div className="battle-title">⚔️ TAP BATTLE</div>
          <div key={count} className="battle-count pop">
            {count > 0 ? count : "GO!"}
          </div>
          <p className="battle-sub">Left = 🔥 &nbsp;•&nbsp; Right = 🌊 — tap fastest!</p>
        </div>
      )}

      {phase === "play" && (
        <>
          <div className="battle-half left" onPointerDown={tap("L")}>
            <span className="battle-emoji">🔥</span>
            <div key={left} className="battle-score pop">
              {left}
            </div>
            <span className="battle-tag">TAP!</span>
          </div>
          <div className="battle-mid">
            <div className="battle-time">{time.toFixed(1)}</div>
            <div className="battle-bar">
              <div
                className="battle-fill"
                style={{ width: `${(time / GAME_SECONDS) * 100}%` }}
              />
            </div>
          </div>
          <div className="battle-half right" onPointerDown={tap("R")}>
            <span className="battle-emoji">🌊</span>
            <div key={right} className="battle-score pop">
              {right}
            </div>
            <span className="battle-tag">TAP!</span>
          </div>
        </>
      )}

      {phase === "done" && (
        <div className="battle-center">
          <div className="battle-winner">
            {left === right ? "🤝 Draw!" : left > right ? "🔥 Left wins!" : "🌊 Right wins!"}
          </div>
          <div className="battle-final">
            {left} — {right}
          </div>
          <div className="battle-btns">
            <button onClick={rematch}>🔁 Rematch</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TapBattle;
