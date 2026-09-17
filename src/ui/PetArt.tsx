/**
 * Drawn (pure CSS) pet characters for Pet 2.0: Bloop the blob (evolves),
 * plus full-body cat & dog in sitting pose. No emoji, no assets.
 */

export type PetMood = "love" | "happy" | "sad" | "angry" | "tired" | "hungry" | "sleep";

interface ArtProps {
  mood: PetMood;
  blink: boolean;
  asleep: boolean;
  dancing: boolean;
  /** Seconds per beat (tempo-synced dance). */
  tempo: number;
  /** Beat-pulse scale. */
  scale: number;
  look: { x: number; y: number };
}

interface BlobProps extends ArtProps {
  stage: 0 | 1 | 2 | 3;
}

export function BlobArt({ stage, mood, blink, asleep, dancing, tempo, scale, look }: BlobProps) {
  const mouthSad = mood === "sad" || mood === "hungry" || mood === "tired";
  return (
    <div
      className={`pet-body stage-${stage}${dancing ? " dancing" : ""}`}
      style={{
        transform: `scale(${scale}) translate(${look.x * 8}px, ${-Math.abs(look.y) * 5}px)`,
        animationDuration: `${tempo}s`,
      }}
    >
      <div className={`pet-eyes${blink || asleep ? " blink" : ""}${mood === "angry" ? " angry" : ""}`}>
        <div className="pet-eye">
          <div
            className="pet-pupil"
            style={{ transform: `translate(${look.x * 4}px, ${look.y * 4}px)` }}
          />
        </div>
        <div className="pet-eye">
          <div
            className="pet-pupil"
            style={{ transform: `translate(${look.x * 4}px, ${look.y * 4}px)` }}
          />
        </div>
      </div>
      <div className={`pet-mouth${mouthSad ? " sad" : ""}`} />
    </div>
  );
}

export function CatArt({ mood, blink, asleep, dancing, tempo, scale, look }: ArtProps) {
  const closed = blink || asleep || mood === "sleep";
  const mouthSad = mood === "sad" || mood === "hungry" || mood === "tired";
  const pupil = { transform: `translate(${look.x * 3}px, ${look.y * 3}px)` };
  return (
    <div
      className={`pet-art cat-art mood-${mood}${dancing ? " dancing" : ""}`}
      style={{
        transform: `scale(${scale}) translate(${look.x * 6}px, ${-Math.abs(look.y) * 4}px)`,
        animationDuration: `${tempo}s`,
      }}
    >
      <div className="cat-tail" />
      <div className="cat-body">
        <div className="cat-body-stripe b1" />
        <div className="cat-body-stripe b2" />
        <div className="cat-belly" />
        <div className="cat-paw left" />
        <div className="cat-paw right" />
      </div>
      <div className="cat-ear left">
        <div className="cat-ear-in" />
      </div>
      <div className="cat-ear right">
        <div className="cat-ear-in" />
      </div>
      <div className="cat-head">
        <div className="cat-stripe s1" />
        <div className="cat-stripe s2" />
        <div className="cat-stripe s3" />
        <div className="cat-brow left" />
        <div className="cat-brow right" />
        <div className={`cat-eyes${closed ? " closed" : ""}`}>
          <div className="cat-eye">
            <div className="cat-pupil" style={pupil} />
          </div>
          <div className="cat-eye">
            <div className="cat-pupil" style={pupil} />
          </div>
        </div>
        <div className="cat-muzzle" />
        <div className="cat-nose" />
        <div className={`cat-mouth${mouthSad ? " sad" : ""}`} />
        <div className="cat-whiskers left" />
        <div className="cat-whiskers right" />
      </div>
    </div>
  );
}

export function DogArt({ mood, blink, asleep, dancing, tempo, scale, look }: ArtProps) {
  const closed = blink || asleep || mood === "sleep";
  const mouthSad = mood === "sad" || mood === "hungry" || mood === "tired";
  const pupil = { transform: `translate(${look.x * 3}px, ${look.y * 3}px)` };
  return (
    <div
      className={`pet-art dog-art mood-${mood}${dancing ? " dancing" : ""}`}
      style={{
        transform: `scale(${scale}) translate(${look.x * 6}px, ${-Math.abs(look.y) * 4}px)`,
        animationDuration: `${tempo}s`,
      }}
    >
      <div className="dog-tail" />
      <div className="dog-body">
        <div className="dog-body-spot" />
        <div className="dog-belly" />
        <div className="dog-paw-back left" />
        <div className="dog-paw-back right" />
        <div className="dog-paw left" />
        <div className="dog-paw right" />
      </div>
      <div className="dog-ear left" />
      <div className="dog-ear right" />
      <div className="dog-head">
        <div className="dog-spot" />
        <div className="dog-brow left" />
        <div className="dog-brow right" />
        <div className={`dog-eyes${closed ? " closed" : ""}`}>
          <div className="dog-eye">
            <div className="dog-pupil" style={pupil} />
          </div>
          <div className="dog-eye">
            <div className="dog-pupil" style={pupil} />
          </div>
        </div>
        <div className="dog-snout">
          <div className="dog-nose" />
          <div className={`dog-mouth${mouthSad ? " sad" : ""}`} />
          <div className="dog-tongue" />
        </div>
      </div>
    </div>
  );
}
