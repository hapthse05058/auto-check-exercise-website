/**
 * Pure parsing helpers for extracting question/answer pairs from a Google Doc
 * tab. Direct port of the extension logic (extension/popup.js) — behavior is
 * intentionally identical so grading results do not change.
 */

export const IS_CORRECT_ANSWER = "✅ Đúng";

export function startsWithNumberDot(sentence) {
  return /^\d+\./.test(sentence);
}

export function startsWithArrow(sentence) {
  return /^→/.test(sentence);
}

export function containsCorrectMark(str) {
  return str.includes(IS_CORRECT_ANSWER);
}

/** Normalizes a string for keying: collapse whitespace + trim. */
export function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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
  const match = String(question ?? "").match(/^\s*(\d+)\./);
  return match ? match[1] : null;
}

/** True when the answer cell contains anything besides arrows/whitespace. */
export function hasAnswer(val) {
  if (val === null || val === undefined) {
    return false;
  }
  const str = String(val);
  if (str === "") {
    return false;
  }
  // Match any character that is NOT an arrow (→) or whitespace.
  const invalidCharRegex = /[^→\s]/;
  return invalidCharRegex.test(str);
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
  const exercisePart4 = [];
  tableIndex.forEach((index) => {
    exercisePart4.push(
      ...(targetTab.documentTab.body?.content || []).flatMap(
        (block) => block.table || [],
      )[index].tableRows,
    );
  });
  return exercisePart4;
}

function getNormalSentence(qna) {
  const qnaObj = {};
  for (let j = 0; j < qna.length; j++) {
    const qnaChild = qna[j].content;
    const question = startsWithNumberDot(qnaChild) ? qnaChild : null;
    const answer = startsWithArrow(qnaChild) ? qnaChild : null;
    if (question) {
      qnaObj.question = question;
    }
    if (answer) {
      qnaObj.answer = answer;
    }
  }
  if (qnaObj.question) return qnaObj;
}

function getComplexSentence(qna) {
  const qnaObj = { question: "", answer: "" };
  for (let j = 0; j < qna.length; j++) {
    const qnaChild = qna[j];
    if (startsWithNumberDot(qnaChild)) {
      qnaObj.question = qnaChild;
    } else if (startsWithArrow(qnaChild)) {
      if (!qnaObj.answer) {
        qnaObj.answer = qnaChild;
      } else {
        qnaObj.answer += "\n" + qnaChild;
      }
    } else {
      if (qnaObj.question) {
        qnaObj.question += "\n" + qnaChild;
      }
    }
  }
  return qnaObj;
}

function getQuesAndAnsForLesson23(exercisePart4) {
  const quesAndAnsArrPartIV = [];
  for (let i = 0; i < exercisePart4.length; i++) {
    if (![0, 1].includes(i)) {
      const item = exercisePart4[i];
      let qna = item.tableCells[0].content.map(
        (cell) => cell.paragraph.elements[0].textRun,
      );

      if (qna.length < 3) {
        let qnaObj = getNormalSentence(qna);
        if (qnaObj?.question && qnaObj?.answer) {
          quesAndAnsArrPartIV.push(qnaObj);
          qnaObj = {};
        }
      } else if (qna.length === 3) {
        qna = qna.map((run) => run.content);
        const ques = [qna[0], qna[1]].join("");
        const ans = qna[2];
        let qnaObj = { question: ques, answer: ans };
        if (qnaObj?.question && qnaObj?.answer) {
          quesAndAnsArrPartIV.push(qnaObj);
          qnaObj = {};
        }
      }
    }
  }

  return quesAndAnsArrPartIV;
}

// Special lessons (Buổi 15, 16, 17, 22): part III contains complex sentences.
function getQuesAndAnsForSpecialLesson(exercisePart4) {
  const quesAndAnsArrPartIV = [];
  for (let i = 0; i < exercisePart4.length; i++) {
    if (![0, 1].includes(i)) {
      const item = exercisePart4[i];
      let qna = item.tableCells[0].content.map(
        (cell) => cell.paragraph.elements[0].textRun,
      );
      if (qna.length < 4) {
        let qnaObj = getNormalSentence(qna);
        if (qnaObj?.question && qnaObj?.answer) {
          quesAndAnsArrPartIV.push(qnaObj);
          qnaObj = {};
        }
      } else {
        qna = item.tableCells[0].content.map((cell) => {
          if (cell.paragraph.elements.length === 1) {
            return cell.paragraph.elements[0].textRun.content;
          }
          const content = cell.paragraph.elements
            .map((el) => el.textRun?.content)
            .join("");
          return content;
        });
        let qnaObj = getComplexSentence(qna);
        if (qnaObj?.question && qnaObj?.answer) {
          quesAndAnsArrPartIV.push(qnaObj);
          qnaObj = {};
        }
      }
    }
  }

  return quesAndAnsArrPartIV;
}

function getQuesAndAnsForNormalLession(exercisePart4) {
  const quesAndAnsArrPartIV = [];
  for (let i = 0; i < exercisePart4.length; i++) {
    if (![0, 1].includes(i)) {
      const item = exercisePart4[i];
      const qna = item.tableCells[0].content.map((c) => c.paragraph?.elements);
      let qnaObj = {};
      for (let j = 0; j < qna.length; j++) {
        const qnaChild = qna[j];
        if (qnaChild.length > 0) {
          const question = qnaChild.find((qa) =>
            startsWithNumberDot(qa.textRun.content),
          );
          if (question) {
            qnaObj.question = question.textRun.content;
            continue;
          }
          const answer = qnaChild.find((qa) =>
            startsWithArrow(qa.textRun.content),
          );
          if (answer) {
            qnaObj.answer = qnaChild.map((ans) => ans.textRun.content).join("");
          }
          if (qnaObj?.question && qnaObj?.answer) {
            quesAndAnsArrPartIV.push(qnaObj);
            qnaObj = {};
          }
        }
      }
    }
  }
  // Only keep the result when the student actually answered something.
  if (quesAndAnsArrPartIV.some((qna) => !!qna.answer)) {
    return quesAndAnsArrPartIV;
  }

  return [];
}

export function isSpecialLesson(tabTitle) {
  return ["BUỔI 15", "BUỔI 16", "BUỔI 17", "BUỔI 22"].find((tabName) =>
    tabTitle.includes(tabName),
  );
}

/**
 * Extracts the part-IV question/answer pairs of a tab, keeping only the
 * entries the student answered.
 */
export function getQesAndAnsFromPartIVOfTheTargetTab(targetTab, tableIndex) {
  if (!tableIndex) return;
  const exercisePart4 = getTablesWhichContainStudentExercise(
    targetTab,
    tableIndex,
  );
  let quesAndAnsArrPartIV = [];
  if (targetTab.tabProperties.title === "BUỔI 23") {
    quesAndAnsArrPartIV = getQuesAndAnsForLesson23(exercisePart4);
  } else if (isSpecialLesson(targetTab.tabProperties.title)) {
    quesAndAnsArrPartIV = getQuesAndAnsForSpecialLesson(exercisePart4);
  } else {
    quesAndAnsArrPartIV = getQuesAndAnsForNormalLession(exercisePart4);
  }

  const finalArr = [];
  quesAndAnsArrPartIV.forEach((item) => {
    const answer = item.answer?.trim();
    if (hasAnswer(answer)) {
      finalArr.push(item);
    }
  });
  return finalArr;
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
            p?.paragraph?.elements?.map((e) => e.textRun?.content || "").join(""),
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
