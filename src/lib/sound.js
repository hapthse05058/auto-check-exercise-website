/** Audio cues: finished runs, new notifications. */

const SUCCESS_SOUND_URL = "/successful_sound.mp3";
let successBuffer = null; // Promise<AudioBuffer>, decoded once
// Louder than the file itself; a compressor keeps the boost from clipping.
const SUCCESS_GAIN = 2.5;
// The grading screen and the bell can both announce one finished run (the
// bell up to a poll later): one chime per run, not two.
const SUCCESS_DEDUPE_MS = 2 * 60 * 1000;
let lastSuccessAt = 0;

function playSuccessWithElement() {
  try {
    new Audio(SUCCESS_SOUND_URL)
      .play()
      .catch((err) => console.error("Error playing sound:", err));
  } catch (err) {
    console.error("Error playing sound:", err);
  }
}

/** Fetches and decodes the chime once, for the (unlocked) audio context. */
function loadSuccessBuffer(ctx) {
  if (successBuffer) return successBuffer;
  successBuffer = fetch(SUCCESS_SOUND_URL)
    .then((res) => res.arrayBuffer())
    // Callback form: older Safari has no promise-returning decodeAudioData.
    .then(
      (bytes) =>
        new Promise((resolve, reject) =>
          ctx.decodeAudioData(bytes, resolve, reject),
        ),
    )
    .catch((err) => {
      successBuffer = null;
      throw err;
    });
  return successBuffer;
}

/**
 * Chime marking a run that finished successfully (grading, clearing feedback).
 *
 * Played through the audio context a tap unlocked: a grading run ends long
 * after the click that started it, and Safari (iOS above all) blocks an
 * <audio> play() that no tap just preceded — clearing feedback ends soon
 * after its click, which is why only that one used to be heard.
 *
 * Never throws and never rejects: the work it celebrates is already done and
 * paid for, so a muted device or a browser blocking autoplay must not surface
 * as a failure.
 */
export function playSuccessSound() {
  const at = Date.now();
  if (at - lastSuccessAt < SUCCESS_DEDUPE_MS) return;
  lastSuccessAt = at;
  let ctx = null;
  try {
    ctx = context();
  } catch {
    ctx = null;
  }
  if (!ctx || ctx.state !== "running") {
    playSuccessWithElement();
    return;
  }
  loadSuccessBuffer(ctx)
    .then((buffer) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = SUCCESS_GAIN;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      source.connect(gain).connect(limiter).connect(ctx.destination);
      source.start();
    })
    .catch((err) => {
      console.error("Error playing sound:", err);
      playSuccessWithElement();
    });
}

// ---------------------------------------------------------------------------
// New-notification chime
// ---------------------------------------------------------------------------

const SOUND_PREF_KEY = "ace_notifSound";
let audioContext = null;

/** Whether the viewer wants the chime (on unless switched off here). */
export function notificationSoundEnabled() {
  try {
    return localStorage.getItem(SOUND_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setNotificationSoundEnabled(on) {
  try {
    localStorage.setItem(SOUND_PREF_KEY, on ? "on" : "off");
  } catch {
    // A blocked storage just means the choice is not remembered.
  }
}

function context() {
  if (audioContext) return audioContext;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  audioContext = new Ctor();
  return audioContext;
}

/**
 * Browsers only let a page make sound after the user has interacted with it,
 * so the audio context is created (or resumed) on a click or key press —
 * every one, not only the first: iOS suspends the context again when the tab
 * goes to the background. Before the first, a chime is simply silent.
 */
export function unlockAudioOnFirstGesture() {
  const unlock = () => {
    try {
      const ctx = context();
      if (ctx && ctx.state !== "running") ctx.resume?.();
      // Decoded ahead, so the end of a run chimes at once.
      if (ctx) loadSuccessBuffer(ctx).catch(() => {});
    } catch {
      // No audio on this device.
    }
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return unlock;
}

/**
 * A short two-note chime, synthesized (no audio file to load). Never throws:
 * a muted device or a blocked context just stays quiet.
 */
export function playNotificationSound() {
  if (!notificationSoundEnabled()) return;
  try {
    const ctx = context();
    if (!ctx || ctx.state !== "running") return;
    const start = ctx.currentTime;
    [
      [880, 0],
      [1318.5, 0.13],
    ].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.4);
    });
  } catch (err) {
    console.error("Error playing notification sound:", err);
  }
}
