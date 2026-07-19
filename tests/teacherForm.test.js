import { describe, expect, it } from "vitest";
import { validateTeacherForm } from "../src/lib/teacherForm.js";

const full = {
  name: "An Nguyen",
  gmail: "an@example.com",
  phone: "0900000000",
  dob: "1990-01-01",
  username: "an",
  password: "secret",
};

describe("validateTeacherForm", () => {
  it("passes a complete create form", () => {
    expect(validateTeacherForm(full, { isCreate: true })).toEqual({
      ok: true,
      errors: {},
    });
  });

  it("requires name, phone, dob, gmail", () => {
    const { ok, errors } = validateTeacherForm({}, { isCreate: false });
    expect(ok).toBe(false);
    expect(errors).toMatchObject({
      name: "required",
      phone: "required",
      dob: "required",
      gmail: "required",
    });
  });

  it("requires username+password only when creating", () => {
    const noCreds = { ...full, username: "", password: "" };
    expect(validateTeacherForm(noCreds, { isCreate: false }).ok).toBe(true);
    const r = validateTeacherForm(noCreds, { isCreate: true });
    expect(r.ok).toBe(false);
    expect(r.errors).toMatchObject({
      username: "required",
      password: "required",
    });
  });

  it("rejects a malformed gmail", () => {
    const r = validateTeacherForm(
      { ...full, gmail: "not-an-email" },
      { isCreate: true },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.gmail).toBe("invalidGmail");
  });

  it("treats whitespace-only values as missing", () => {
    const r = validateTeacherForm({ ...full, name: "   " }, { isCreate: true });
    expect(r.errors.name).toBe("required");
  });
});
