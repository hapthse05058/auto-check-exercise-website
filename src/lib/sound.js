/** Audio cues: finished runs, new notifications. */

/**
 * Chime marking a run that finished successfully (grading, clearing feedback).
 *
 * Never throws and never rejects: the work it celebrates is already done and
 * paid for, so a muted device or a browser blocking autoplay must not surface
 * as a failure.
 */
export function playSuccessSound() {
  try {
    new Audio("/successful_sound.mp3")
      .play()
      .catch((err) => console.error("Error playing sound:", err));
  } catch (err) {
    console.error("Error playing sound:", err);
  }
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
 * so the audio context is created (or resumed) on the first click or key
 * press. Before that, a chime is simply silent.
 */
export function unlockAudioOnFirstGesture() {
  const unlock = () => {
    try {
      context()?.resume?.();
    } catch {
      // No audio on this device.
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
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
