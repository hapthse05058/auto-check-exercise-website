/**
 * IELTS Writing page helpers (backend lib/ieltsWriting.js does the grading).
 *
 * The feedback comes back with "**bold**" markers — the same text the backend
 * writes into a doc's "GV chữa" cell. Here it is turned into bold runs for the
 * screen and into HTML for the clipboard, so pasting into Google Docs keeps
 * the bold. Pure, except `compressImage` (browser canvas).
 */

export const TASKS = ["task1", "task2", "paragraph"];
/** IELTS minimum length; a paragraph has none. */
export const MIN_WORDS = { task1: 150, task2: 250, paragraph: 0 };
export const MAX_IMAGES = 3;
/** Per chart, after compression — the backend refuses anything larger. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1600;

/** Same rule as the backend's countWords. */
export function countWords(text) {
  return String(text ?? "")
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/**
 * One line of feedback as runs: [{text, bold}]. An unpaired "**" is shown as
 * is rather than bolding the rest of the line.
 */
export function boldRuns(line) {
  const runs = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) {
      runs.push({ text: line.slice(last, match.index), bold: false });
    }
    runs.push({ text: match[1], bold: true });
    last = pattern.lastIndex;
  }
  if (last < line.length) runs.push({ text: line.slice(last), bold: false });
  return runs;
}

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The feedback as HTML (bold kept, one <br> per line) for the clipboard. */
export function feedbackToHtml(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) =>
      boldRuns(line)
        .map((run) =>
          run.bold ? `<b>${escapeHtml(run.text)}</b>` : escapeHtml(run.text),
        )
        .join(""),
    )
    .join("<br>");
}

/** The feedback without markers, for plain-text paste targets. */
export function feedbackToPlain(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) =>
      boldRuns(line)
        .map((run) => run.text)
        .join(""),
    )
    .join("\n");
}

/**
 * The chart data the AI read, for display: markdown emphasis ("**", a line
 * in "*italics*", "#" headings) and table rule rows ("| :--- |") are dropped; the "| a | b |"
 * rows and "-" bullets stay, which read fine in a monospace box.
 */
export function chartDataToPlain(text) {
  return String(text ?? "")
    .split("\n")
    .filter((line) => !/^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*$/.test(line))
    .filter((line) => !/^\s*-{3,}\s*$/.test(line))
    .map((line) =>
      line
        .replace(/\*\*/g, "")
        .replace(/^\s*#{1,6}\s*/, "")
        .replace(/^(\s*)\*(\S.*\S)\*\s*$/, "$1$2"),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Bytes a data URL decodes to. */
export function dataUrlBytes(dataUrl) {
  const base64 = String(dataUrl).split(",")[1] || "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Text for an Error thrown by gradeIeltsWriting. */
export function ieltsErrorText(error, t) {
  const code = error?.message || "ielts_grade_failed";
  const params = error?.params || {};
  const key = `ielts.error.${code}`;
  const text = t(key, {
    point: params.point ?? 0,
    max: params.max ?? "",
  });
  return text === key ? t("ielts.error.ielts_grade_failed") : text;
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("invalid_image"));
    image.src = src;
  });
}

/**
 * A chart file as a data URL the backend accepts: kept as is when it is small
 * enough, otherwise scaled to ≤1600px and re-encoded (PNG keeps chart lines
 * sharp; JPEG only when PNG is still too big).
 *
 * @throws {Error} "invalid_image" | "image_too_large"
 */
export async function compressImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("invalid_image");
  const original = await readAsDataUrl(file);
  const image = await loadImage(original);
  const side = Math.max(image.naturalWidth, image.naturalHeight);
  if (
    side <= MAX_IMAGE_SIDE &&
    dataUrlBytes(original) <= MAX_IMAGE_BYTES &&
    /^data:image\/(png|jpe?g|webp|gif);/.test(original)
  ) {
    return original;
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / side);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  for (const [type, quality] of [
    ["image/png", undefined],
    ["image/jpeg", 0.9],
    ["image/jpeg", 0.75],
  ]) {
    const url = canvas.toDataURL(type, quality);
    if (dataUrlBytes(url) <= MAX_IMAGE_BYTES) return url;
  }
  throw new Error("image_too_large");
}
