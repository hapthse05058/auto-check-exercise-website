/**
 * Pulls the student's full name out of a Google Doc title.
 *
 * Teachers name their documents `fullname_phone_class`, e.g.
 * `Nguyễn Khắc Huy_0989664415_NHS87.docx`. Only that exact shape is trusted —
 * anything else returns "" so the caller leaves the name field empty rather
 * than guessing wrong.
 */

// Titles copied out of Drive/Windows often carry zero-width marks or a BOM
// (all category Cf) and non-breaking spaces; strip the former and let the
// `\s+` collapse below fold every flavour of space into a plain one.
const ZERO_WIDTH = /\p{Cf}/gu;
const FILE_EXT = /\.(docx?|pdf|rtf|odt|txt)$/i;
// Phone numbers get auto-formatted with EN/EM dashes, so accept those too.
const PHONE_CHARS = /^[+0-9\s\-–—().]+$/;

export function parseNameFromDocTitle(title) {
  const cleaned = String(title || "")
    .replace(ZERO_WIDTH, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(FILE_EXT, "");

  const parts = cleaned.split("_").map((p) => p.trim());
  // Exactly three parts: an underscore inside the name itself (Nguyen_Van_A_…)
  // makes the split ambiguous, so bail out instead of filling in a wrong name.
  if (parts.length !== 3) return "";

  const [name, phone, className] = parts;
  if (!name || !className) return "";
  if (!PHONE_CHARS.test(phone)) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";

  return name;
}
