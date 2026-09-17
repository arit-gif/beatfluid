import { useEffect, useRef } from "react";
import { createRenderer } from "./renderer";
import "./fluid.css";

interface FluidBackgroundProps {
  /** Hides the bottom-center "move to stir" hint (e.g. while a panel covers that spot). */
  hideHint?: boolean;
}

export function FluidBackground({ hideHint = false }: FluidBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer({ canvas });
    void renderer.ready;
    return () => renderer.dispose();
  }, []);

  return (
    <div className="fluid-container">
      <canvas ref={canvasRef} className="fluid-canvas" />
      {!hideHint && <div className="fluid-hint">move to stir</div>}
    </div>
  );
}

export default FluidBackground;
