/** Audio cues for finished runs. */

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
