import { describe, expect, it } from "vitest";

import {
  BELL_RECENT_MS,
  isShownInBell,
  pathOf,
} from "../src/lib/notificationView.js";

const NOW = Date.parse("2026-09-29T10:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();

describe("isShownInBell", () => {
  it("always keeps unread notifications, however old", () => {
    expect(
      isShownInBell({ read: false, createdAt: ago(20 * BELL_RECENT_MS) }, NOW),
    ).toBe(true);
  });

  it("keeps read ones only while they are recent", () => {
    expect(
      isShownInBell({ read: true, createdAt: ago(BELL_RECENT_MS - 1000) }, NOW),
    ).toBe(true);
    expect(
      isShownInBell({ read: true, createdAt: ago(BELL_RECENT_MS + 1000) }, NOW),
    ).toBe(false);
  });

  it("drops a read one with no usable date", () => {
    expect(isShownInBell({ read: true, createdAt: null }, NOW)).toBe(false);
  });
});

describe("pathOf", () => {
  it("follows in-app paths only", () => {
    expect(pathOf({ data: { path: "/grade?classId=A" } })).toBe(
      "/grade?classId=A",
    );
    expect(pathOf({ data: { path: "//evil.example" } })).toBe(null);
    expect(pathOf({ data: { path: "https://evil.example" } })).toBe(null);
    expect(pathOf({})).toBe(null);
  });
});
