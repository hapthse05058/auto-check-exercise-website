/**
 * Pure parsing helpers for extracting question/answer pairs from a Google Doc
 * tab.
 *
 * The exercise table is filled in by students, so the layout it is supposed to
 * follow ("N." for the question, "→" for the answer) is routinely broken: a
 * different arrow, no arrow at all, the answer typed on the next line, bold or
 * highlighted text splitting a line into several runs. Everything here is
 * built to still read the pair out of such a cell — and, when it genuinely
 * cannot, to say so (see `getUnreadableQuestions`) rather than guess.
 */

export const IS_CORRECT_ANSWER = "✅ Đúng";

/**
 * Số thứ tự mở đầu một câu hỏi. Cho phép khoảng trắng đứng trước và chấp nhận
 * cả "1)" / "1 ." vì học sinh hay gõ lệch. Nhóm capture chỉ chứa CHỮ SỐ, để
 * `extractQuestionIndex` và `docWriter` luôn so khớp trên cùng một giá trị.
 */
const QUESTION_NUMBER = /^\s*(\d{1,3})\s*[.)]/;

/**
 * Mọi biến thể dấu mũi tên / nhãn học sinh hay gõ thay cho "→".
 * `[-–—=]` bao cả gạch ngang dài (en-dash "–", em-dash "—") do Google Docs tự
 * autocorrect "-" thành "–", tạo ra "–>" thay vì "->". `\s*` ở cuối cho phép gõ
 * dính liền: "->I don't know".
 */
const ARROW = /[→⇒⟹⟶➔➜➞➡↦↔⇄»]+|[-–—=]{1,3}>{1,3}|>{1,2}/;
const ANSWER_LABEL =
  /(?:ans(?:wer)?|tl|tr[ảa]\s*l[ờo]i|đ[áa]p\s*[áa]n)\s*[:.\-–—]|:/;
const ANSWER_MARKER = new RegExp(
  `^\\s*(?:${ARROW.source}|${ANSWER_LABEL.source})\\s*`,
  "i",
);
// Bản dùng để XOÁ marker trước khi kiểm tra "ô này có chữ không". Neo đầu dòng
// (cờ `m`) nên không bao giờ đụng tới dấu ">" nằm giữa câu ("x > 2").
const ANSWER_MARKER_LINE_START = new RegExp(ANSWER_MARKER.source, "gim");

/**
 * Ký tự chỉ có trong tiếng Việt ⇒ dòng đó là đề bài, không phải câu trả lời
 * tiếng Anh. Cờ `i` phủ luôn chữ hoa nên không cần liệt kê Ă/Â/Đ/Ê/Ô/Ơ/Ư…
 */
const VIETNAMESE_CHARS =
  /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụỳýỷỹỵ]/i;

// Dòng "đề bài phụ" của buổi 15/16/17/22 — vẫn thuộc câu hỏi.
const QUESTION_LABEL = /^\s*câu\s+(đơn|phức|ghép)/i;
// Đề bài "ra lệnh" rồi mới đưa câu tiếng Anh xuống dòng dưới ⇒ dòng NGAY SAU
// vẫn là đề bài, dù viết bằng tiếng gì. (buổi 23: "Rút gọn DCN trong câu sau:")
const PROMPT_CONTINUES = /:\s*$/;
// Neo vào ĐẦU dòng (ngay sau số thứ tự) vì câu ra lệnh luôn mở đầu bằng động
// từ — nếu không, một câu tiếng Việt bình thường cần dịch ("3. Tôi đã sửa xe
// hôm qua.") sẽ bị nhận nhầm là câu ra lệnh và nuốt mất dòng trả lời sau nó.
// KHÔNG dùng `\b`: trong JS `\b` là ASCII, chữ có dấu (đ, ú, ề…) bị coi là
// "non-word" nên `\bđiền` sẽ khớp sai hoàn toàn.
const PROMPT_INSTRUCTION =
  /^\s*(?:\d{1,3}\s*[.)]\s*)?(?:rút gọn|viết lại|chuyển|kết hợp|nối|sửa|điền|hoàn thành|sử dụng|dùng|đặt câu|dịch)/i;

export function startsWithNumberDot(sentence) {
  return QUESTION_NUMBER.test(String(sentence ?? ""));
}

/** True khi dòng mở đầu bằng BẤT KỲ dấu hiệu trả lời nào (→, ->, "Trả lời:"…). */
export function startsWithArrow(sentence) {
  return ANSWER_MARKER.test(String(sentence ?? ""));
}

/**
 * Dòng này là câu LỆNH tiếng Việt ⇒ dòng ngay sau nó vẫn thuộc đề bài.
 * Bắt buộc có ký tự tiếng Việt: nếu không, một câu trả lời tiếng Anh của học
 * sinh ("Use a smartphone to…", "Rewrite the sentence…") có thể bị nuốt nhầm
 * vào đề bài. Mọi từ khoá trong PROMPT_INSTRUCTION đều có dấu nên đây là lớp
 * bọc lót thứ hai, phòng khi sau này thêm từ khoá không dấu.
 */
export function isPromptInstruction(line) {
  const str = String(line ?? "");
  return VIETNAMESE_CHARS.test(str) && PROMPT_INSTRUCTION.test(str);
}

export function containsCorrectMark(str) {
  return str.includes(IS_CORRECT_ANSWER);
}

/** Normalizes a string for keying: collapse whitespace + trim. */
export function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Stable key uniquely identifying a graded item by its (question, answer)
 * pair. Two students who answered the SAME question DIFFERENTLY get different
 * keys, so they never share feedback.
 */
export function makeAnswerKey(question, answer) {
  return `${normalizeText(question)}${normalizeText(answer)}`;
}

/**
 * Extracts the leading question index (e.g. "13" from "13. Bài tập...").
 * This index locates the correct row inside a student's own doc. Returns null
 * when the question has no leading number (then we must not guess a row).
 */
export function extractQuestionIndex(question) {
  const match = String(question ?? "").match(QUESTION_NUMBER);
  return match ? match[1] : null;
}

/** True when the answer cell contains anything besides markers/whitespace. */
export function hasAnswer(val) {
  if (val === null || val === undefined) {
    return false;
  }
  const str = String(val);
  if (str === "") {
    return false;
  }
  // Strip the marker at the START of each line ("→", "->", "Trả lời:"…), then
  // look for real content. Anchoring per line keeps a ">" inside the answer
  // itself ("x > 2") intact.
  return /\S/.test(str.replace(ANSWER_MARKER_LINE_START, " "));
}

/**
 * Parses pasted Google Doc URLs (one per line) into {docId, tabId} refs.
 * (Fixes an extension bug: a link without `tab=` no longer throws.)
 */
export function parseDocLinks(text) {
  const lines = text.split("\n").filter((line) => line.trim() !== "");
  const docObjects = [];

  lines.forEach((link) => {
    // The ID sits between /d/ and the next slash.
    const docIdMatch = link.match(/\/d\/(.+?)\//);
    // The tab ID follows `tab=` when present.
    const tabIdMatch = link.match(/tab=(.+?)(&|$)/);

    if (docIdMatch) {
      docObjects.push({
        docId: docIdMatch[1],
        tabId: tabIdMatch ? tabIdMatch[1] : "t.0", // default to first tab
      });
    }
  });

  return docObjects;
}

/** Recursively finds a tab (or child tab) by its title. */
export function findTabByTitle(tabs, title) {
  for (const tab of tabs) {
    if (tab.tabProperties.title === title) return tab;
    if (tab.childTabs) {
      const found = findTabByTitle(tab.childTabs, title);
      if (found) return found;
    }
  }
  return null;
}

/** Collects the rows of the exercise tables referenced by `tableIndex`. */
export function getTablesWhichContainStudentExercise(targetTab, tableIndex) {
  if (!tableIndex) return;
  const tables = (targetTab.documentTab.body?.content || []).flatMap(
    (block) => block.table || [],
  );
  const exercisePart4 = [];
  tableIndex.forEach((index) => {
    // A doc missing a table must not blow up the whole student's grading.
    exercisePart4.push(...(tables[index]?.tableRows || []));
  });
  return exercisePart4;
}

/**
 * Flattens one table cell into its non-empty text lines.
 *
 * Joins EVERY text run of every paragraph, so bold/highlight/link — which make
 * Google Docs split a line into several runs — can no longer hide the answer
 * marker. Never throws on an empty paragraph or on a cell entry that is not a
 * paragraph (nested table, section break).
 */
export function getCellLines(cell) {
  return (cell?.content || [])
    .flatMap((entry) =>
      (entry?.paragraph?.elements || [])
        .map(
          (el) =>
            el?.textRun?.content ??
            // smart chips carry their text outside of textRun
            el?.richLink?.richLinkProperties?.title ??
            el?.person?.personProperties?.name ??
            "",
        )
        .join("")
        // \v (U+000B) is the soft line break Google Docs writes for Shift+Enter.
        .split(/\r?\n|\v/),
    )
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");
}

/**
 * Turns one cell's lines into question/answer pairs.
 *
 * Classifies each line from the most reliable signal to the most speculative,
 * so a prompt line is never mistaken for the student's answer:
 *   1. leading number   → question (starts a new pair)
 *   2. answer marker    → answer   (wins over every language rule below, so an
 *                                   answer written in Vietnamese still counts)
 *   3. "Câu phức:" label→ question
 *   4. previous line gives an order (ends with ":" or holds a Vietnamese
 *      instruction verb) → question, whatever language THIS line is in. This is
 *      what keeps "I don't know where I should live." — the English sentence a
 *      buổi 23 question asks the student to reduce — out of the answer.
 *   5. language: Vietnamese is the prompt, anything else is the answer. Only
 *      reached when nothing above decided; marks the pair `guessed`.
 *
 * @returns {Array<{question: string, answer: string, guessed: boolean}>}
 */
function buildQnaPairs(lines) {
  const pairs = [];
  let current = null;
  let inAnswer = false;
  let previousLine = "";

  const startPair = () => {
    current = { questionLines: [], answerLines: [], guessed: false };
    pairs.push(current);
  };

  for (const line of lines) {
    const previous = previousLine;
    previousLine = line;

    if (startsWithNumberDot(line)) {
      // A new numbered line only starts a new pair once the current one is
      // complete; buổi 15/16/17/22 keep "câu đơn" + "câu phức" in one pair.
      if (!current || current.answerLines.length) startPair();
      current.questionLines.push(line);
      inAnswer = false;
      continue;
    }
    // Lines before the first numbered one are section headers ("TTQH: Where").
    if (!current) continue;

    if (startsWithArrow(line)) {
      current.answerLines.push(line);
      inAnswer = true;
      continue;
    }
    if (QUESTION_LABEL.test(line)) {
      current.questionLines.push(line);
      inAnswer = false;
      continue;
    }
    if (PROMPT_CONTINUES.test(previous) || isPromptInstruction(previous)) {
      current.questionLines.push(line);
      continue;
    }
    if (VIETNAMESE_CHARS.test(line)) {
      current.questionLines.push(line);
    } else {
      current.answerLines.push(line);
    }
    // Outside answer mode we had no marker to lean on — flag the guess so the
    // teacher can be warned when it did not produce a usable answer.
    if (!inAnswer) current.guessed = true;
  }

  return pairs.map(({ questionLines, answerLines, guessed }) => ({
    question: questionLines.join("\n"),
    answer: answerLines.join("\n"),
    guessed,
  }));
}

/** Reads the question/answer pairs of every exercise row (rows 0-1 are headers). */
function extractPairsFromRows(exerciseRows) {
  const pairs = [];
  for (let i = 2; i < exerciseRows.length; i++) {
    pairs.push(
      ...buildQnaPairs(getCellLines(exerciseRows[i]?.tableCells?.[0])),
    );
  }
  return pairs;
}

// Buổi 23 mixes plain questions with ones whose prompt already holds an English
// sentence ("Rút gọn DCN trong câu sau:"). Kept as its own entry point so that
// format can be tuned without touching every other lesson — telling the two
// apart is done per LINE (rule 4), not per lesson.
function getQuesAndAnsForLesson23(exercisePart4) {
  return extractPairsFromRows(exercisePart4);
}

function getQuesAndAnsForNormalLession(exercisePart4) {
  return extractPairsFromRows(exercisePart4);
}

/** Every part-IV pair of a tab, answered or not. */
function parseExercisePairs(targetTab, tableIndex) {
  const exercisePart4 = getTablesWhichContainStudentExercise(
    targetTab,
    tableIndex,
  );
  if (targetTab.tabProperties.title === "BUỔI 23") {
    return getQuesAndAnsForLesson23(exercisePart4);
  }
  return getQuesAndAnsForNormalLession(exercisePart4);
}

/**
 * Extracts the part-IV question/answer pairs of a tab, keeping only the
 * entries the student answered.
 */
export function getQesAndAnsFromPartIVOfTheTargetTab(targetTab, tableIndex) {
  if (!tableIndex) return;

  const finalArr = [];
  parseExercisePairs(targetTab, tableIndex).forEach(({ question, answer }) => {
    if (hasAnswer(answer?.trim())) {
      // Only {question, answer} goes out: both are sent verbatim to the AI.
      finalArr.push({ question, answer });
    }
  });
  return finalArr;
}

/**
 * Question numbers whose row holds text the parser had to guess about and
 * still could not turn into an answer — e.g. the student removed the "→" AND
 * answered in Vietnamese. The teacher is told to check those by hand instead
 * of the row being dropped silently. An untouched exercise reports nothing.
 */
export function getUnreadableQuestions(targetTab, tableIndex) {
  if (!tableIndex) return [];
  return parseExercisePairs(targetTab, tableIndex)
    .filter(({ answer, guessed }) => guessed && !hasAnswer(answer?.trim()))
    .map(({ question }) => extractQuestionIndex(question))
    .filter((index) => index !== null);
}

/**
 * True when the "Chữa bài" column already contains feedback for at least one
 * answered question (the doc was graded before).
 */
export function wasExerciseReviewedByAI(exercise, tableIndex) {
  const contentContainer = getTablesWhichContainStudentExercise(
    exercise,
    tableIndex,
  );
  for (let j = 0; j < contentContainer.length; j++) {
    if (j > 1) {
      const row = contentContainer[j];
      const firstCellText = row.tableCells[0].content
        .map((p) =>
          p?.paragraph?.elements?.map((e) => e.textRun?.content || "").join(""),
        )
        .join("")
        .trim();

      if (firstCellText && startsWithNumberDot(firstCellText)) {
        const cellIndex = row.tableCells.length - 1;
        const targetCell = row.tableCells[cellIndex];
        const targetCellContent = targetCell.content
          .map((p) =>
            p?.paragraph?.elements
              ?.map((e) => e.textRun?.content || "")
              .join(""),
          )
          .join("")
          .trim();
        if (targetCellContent) {
          return true;
        }
      }
    }
  }
  return false;
}
