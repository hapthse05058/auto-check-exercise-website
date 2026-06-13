/**
 * End-to-end grading pipeline: fetch each student's doc tab, extract the
 * answered part-IV questions, send them to the AI grader, and write the
 * feedback back into the doc. Port of processDocs/autoCheckExercises from
 * extension/popup.js.
 */
import { fetchStudentDocRefs, gradeExercise } from "../api/backend.js";
import { getTabContent } from "../api/googleDocs.js";
import {
  ensureValidGoogleToken,
  ensureValidToken,
} from "../auth/tokens.js";
import {
  getQesAndAnsFromPartIVOfTheTargetTab,
  parseDocLinks,
  wasExerciseReviewedByAI,
} from "./docParser.js";
import { getTableIndexOfExercise } from "./docTables.js";
import { writeToGGDocFile } from "./docWriter.js";
import { fakeApiResponse } from "../asset/mockData.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chunkArray = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

/**
 * Processes all docs for a lesson.
 *
 * @param {object} params
 * @param {string} params.docLinksText  Raw textarea content (may be empty).
 * @param {string} params.classId       Selected class id.
 * @param {string} params.classType     Selected class type code.
 * @param {string} params.lessonName    Selected lesson name ("BUỔI XX ...").
 * @param {object} params.onStatus      {set(text), append(text)} UI reporter.
 * @returns {boolean} false when there was nothing to process.
 */
export async function processDocs({
  docLinksText,
  classId,
  classType,
  lessonName,
  onStatus,
}) {
  let links = [];
  const trimmed = (docLinksText || "").trim();
  if (trimmed) {
    links = parseDocLinks(trimmed);
  } else {
    links = await fetchStudentDocRefs(classId);
  }
  if (!links.length) {
    alert("No student documents found for this class.");
    return false;
  }

  let accessToken;
  let tableIndex = [];
  const studentsExerciseList = [];
  for (const student of links) {
    onStatus.set(`Processing Doc: ${student.docId}...`);
    try {
      // The Google Docs API needs a REAL Google token, not the backend JWT.
      // Re-check before every call: long doc lists can outlive a token.
      accessToken = await ensureValidGoogleToken();

      const doc = await getTabContent(
        student.docId,
        accessToken,
        lessonName,
        onStatus,
      );
      if (!doc) continue;
      student.exercise = doc;
      student.tabId = doc.tabProperties.tabId;
      if (!tableIndex.length) {
        tableIndex = getTableIndexOfExercise(doc.tabProperties.title, classType);
      }
      const quesAndAnsArr = getQesAndAnsFromPartIVOfTheTargetTab(doc, tableIndex);
      if (quesAndAnsArr && quesAndAnsArr.length > 0) {
        studentsExerciseList.push({
          quesAndAnsArr: quesAndAnsArr,
          student: student,
        });
      }
    } catch (err) {
      console.error(err);
      onStatus.set(`Failed ${student.docId}: ${err.message}`);
    }
  }
  if (studentsExerciseList.length) {
    onStatus.set(
      "Finished fetching content from all docs. Starting auto-check...",
    );
  }

  await autoCheckExercises(studentsExerciseList, tableIndex, onStatus);
  return true;
}

async function autoCheckExercises(studentsExerciseList, tableIndex, onStatus) {
  if (!studentsExerciseList.length) return;

  const CONCURRENCY_LIMIT = 5;
  const chunks = chunkArray(studentsExerciseList, CONCURRENCY_LIMIT);

  try {
    for (const chunk of chunks) {
      await Promise.all(
        chunk.map(async (stuExercise, index) => {
          // Stagger requests so the AI backend isn't hit all at once.
          await sleep(index * 25000);

          // Re-validate: waiting for the AI can take a long time (25s * index).
          await ensureValidToken();

          const { quesAndAnsArr, student } = stuExercise;
          if (wasExerciseReviewedByAI(student.exercise, tableIndex)) {
            onStatus.append(
              `\n This exercise has been checked: ${student.docId}. Skip checking it again...`,
            );
          } else {
            try {
              const result = await gradeExercise(quesAndAnsArr);
              // const result = fakeApiResponse;//fake data from asset/mockData.js
              
              if (result.assistantText) {
                // Writing to the doc needs a REAL Google token, not the JWT.
                const googleToken = await ensureValidGoogleToken();
                await writeToGGDocFile(
                  result.assistantText,
                  student,
                  googleToken,
                  tableIndex,
                );
              }
            } catch (err) {
              console.log(err);
              onStatus.append(`\n Failed grading ${student.docId}: ${err.message}`);
            }
          }
        }),
      );
      onStatus.append(`\n Complete handling ${chunk.length} doc, continue...`);
    }
    // Celebrate!
    const sound = new Audio("/successful_sound.mp3");
    await sound.play().catch((err) => console.error("Error playing sound:", err));
  } catch (err) {
    console.error("AutoCheck Error:", err);
  }
  onStatus.append(
    `\n Processing complete!\nGrading student's exercises completed! You can review the result!!`,
  );
}
