// Pure validation for the teacher create/edit modals. No React/DOM here so it
// can be unit-tested directly (see tests/teacherForm.test.js).

const GMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates a teacher form. Returns `{ ok, errors }` where `errors` maps a
 * field name to an error key (resolved to a message by the caller via i18n).
 *
 * @param form       { name, gmail, phone, dob, username, password, ... }
 * @param opts.isCreate  when true, username + password are required
 */
export function validateTeacherForm(form = {}, { isCreate = false } = {}) {
  const errors = {};
  const str = (v) => String(v ?? "").trim();

  if (!str(form.name)) errors.name = "required";
  if (!str(form.phone)) errors.phone = "required";
  if (!str(form.dob)) errors.dob = "required";

  if (!str(form.gmail)) errors.gmail = "required";
  else if (!GMAIL_RE.test(str(form.gmail))) errors.gmail = "invalidGmail";

  if (isCreate) {
    if (!str(form.username)) errors.username = "required";
    if (!str(form.password)) errors.password = "required";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
