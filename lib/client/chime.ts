const KEY = "traxio:sound";
let ctx: AudioContext | null = null;
let armed = false;

/** Browsers only let a page make sound after the person has used it once, so the audio engine is switched on by the first click or key. */
export function armChime() {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const start = () => {
    try {
      ctx ??= new AudioContext();
      void ctx.resume();
    } catch {
      /* no audio support: the chime is simply skipped */
    }
  };
  window.addEventListener("pointerdown", start, { once: true });
  window.addEventListener("keydown", start, { once: true });
}

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode: the choice lasts until the page closes */
  }
}

/** A short, soft two-note chime made in the browser (no sound file to load). */
export function playChime() {
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  [880, 1318.5].forEach((freq, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const t = now + i * 0.16;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}
