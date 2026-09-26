/**
 * The header's point badge listens for this event, so a screen that has just
 * read a fresh balance (after grading, say) can update it without the badge
 * polling the backend again.
 */
export const POINTS_CHANGED = "teacher-points-changed";

export function announcePoints(point) {
  window.dispatchEvent(new CustomEvent(POINTS_CHANGED, { detail: { point } }));
}
