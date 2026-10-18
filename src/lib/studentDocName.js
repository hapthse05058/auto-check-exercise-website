/**
 * Pulls the student's full name out of a Google Doc title.
 *
 * Teachers name their documents `fullname_phone_class`, e.g.
 * `Nguyễn Khắc Huy_0989664415_NHS87.docx`, or just the student's name, e.g.
 * `Thu Hà`. Only those two shapes are trusted — anything else returns "" so
 * the caller leaves the name field empty rather than guessing wrong.
 */

// Titles copied out of Drive/Windows often carry zero-width marks or a BOM
// (all category Cf) and non-breaking spaces; strip the former and let the
// `\s+` collapse below fold every flavour of space into a plain one.
const ZERO_WIDTH = /\p{Cf}/gu;
const FILE_EXT = /\.(docx?|pdf|rtf|odt|txt)$/i;
// Phone numbers get auto-formatted with EN/EM dashes, so accept those too.
const PHONE_CHARS = /^[+0-9\s\-–—().]+$/;
// A bare name: letters (any script, with their accents), spaces, and the odd
// apostrophe, dot or hyphen — no digits, underscores or other punctuation, so
// "Bài tập buổi 5" or "Copy of HS1_template" are not taken for a name.
const NAME_ONLY = /^\p{L}[\p{L}\p{M}' .-]*$/u;
const MAX_NAME_WORDS = 6;
// Google's name for a doc nobody has named yet, and for a copy.
const DEFAULT_TITLE =
  /^(untitled document|tài liệu không có tiêu đề)$|^(copy of|bản sao của) /i;

export function parseNameFromDocTitle(title) {
  const cleaned = String(title || "")
    .replace(ZERO_WIDTH, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(FILE_EXT, "")
    .trim();

  if (!cleaned.includes("_")) {
    // The title is the name itself.
    const words = cleaned.split(" ").length;
    return NAME_ONLY.test(cleaned) &&
      words <= MAX_NAME_WORDS &&
      !DEFAULT_TITLE.test(cleaned)
      ? cleaned
      : "";
  }

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
