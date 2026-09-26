import { describe, expect, it } from "vitest";

import { translations } from "../src/i18n/translations.js";
import { describeJob, isJobFinished } from "../src/lib/grading.js";

/** The real dictionary, resolved the way LanguageContext does it. */
function makeT(lang) {
  const resolve = (obj, key) =>
    key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  return (key, vars = {}) => {
    let str = resolve(translations[lang], key) ?? resolve(translations.en, key);
    if (str == null) return key;
    for (const [k, v] of Object.entries(vars)) {
      str = str.split(`{${k}}`).join(String(v));
    }
    return str;
  };
}

const job = (overrides = {}) => ({
  status: "done",
  total: 4,
  written: 2,
  skipped: 2,
  failed: 0,
  warnings: [],
  error: null,
  errorParams: null,
  notice: null,
  noticeParams: null,
  reauthRequired: false,
  ...overrides,
});

describe("describeJob", () => {
  for (const lang of ["en", "vi"]) {
    const t = makeT(lang);

    it(`[${lang}] every message a job can produce exists and is filled in`, () => {
      const views = [
        describeJob(job({ status: "queued" }), t),
        describeJob(job({ status: "writing", written: 1 }), t),
        describeJob(job(), t),
        describeJob(job({ written: 0, notice: "allChecked" }), t),
        describeJob(
          job({
            written: 0,
            notice: "allSkippedOldFeedback",
            noticeParams: { count: 3 },
          }),
          t,
        ),
        describeJob(job({ written: 0 }), t),
        describeJob(job({ reauthRequired: true }), t),
        ...[
          ["not_enough_points", { need: 3, have: 1, teacher: "Cô Hà" }],
          ["google_reauth_required", null],
          ["prepare_failed", { msg: "boom" }],
          ["abandoned", null],
          ["enqueue_failed", null],
        ].map(([error, errorParams]) =>
          describeJob(job({ status: "failed", error, errorParams }), t),
        ),
        describeJob(
          job({
            warnings: [
              { code: "tabMissing", params: { docId: "d1" } },
              { code: "noTable", params: { docId: "d1" } },
              { code: "unclassifiedTable", params: { docId: "d1", list: "3" } },
              {
                code: "unreadableAnswers",
                params: { docId: "d1", refs: [{ table: 2, question: "4" }] },
              },
              {
                code: "skippedHasOldFeedback",
                params: { docId: "d1", count: 1 },
              },
              { code: "noMatch", params: { docId: "d1" } },
              { code: "failedDoc", params: { docId: "d1", msg: "403" } },
              { code: "failedWrite", params: { docId: "d1", msg: "400" } },
              { code: "ownershipUnclear", params: { docId: "d1" } },
              { code: "gradedMeanwhile", params: { docId: "d1" } },
              { code: "unsettled", params: { list: "d1" } },
              { code: "stoppedNoPoints", params: {} },
            ],
          }),
          t,
        ),
      ];
      for (const view of views) {
        for (const line of [view.text, ...view.warnings]) {
          expect(line, line).not.toMatch(/^grading\./); // a missing key
          expect(line, line).not.toMatch(/\{[a-zA-Z]\w*\}/); // an unfilled slot
        }
      }
    });
  }

  const t = makeT("en");

  it("tells the teacher they may close the tab while it runs", () => {
    const view = describeJob(
      job({ status: "writing", written: 1, skipped: 1 }),
      t,
    );
    expect(view.phase).toBe("running");
    expect(view.text).toContain("2/4");
    expect(view.text).toMatch(/close this tab/);
  });

  it("reports how many students were written", () => {
    expect(describeJob(job(), t)).toMatchObject({
      phase: "done",
      text: expect.stringContaining("2 student(s)"),
    });
  });

  it("says why nothing was written instead of '0 students'", () => {
    expect(describeJob(job({ written: 0, notice: "allChecked" }), t).text).toBe(
      t("grading.allChecked"),
    );
  });

  it("points at signing in again when Google access ran out mid-job", () => {
    const view = describeJob(job({ reauthRequired: true, written: 1 }), t);
    expect(view.phase).toBe("error");
    expect(view.text).toContain("1/4");
  });

  it("explains a point shortfall with the numbers", () => {
    const view = describeJob(
      job({
        status: "failed",
        error: "not_enough_points",
        errorParams: { need: 3, have: 1, teacher: "Cô Hà" },
      }),
      t,
    );
    expect(view.phase).toBe("error");
    expect(view.text).toContain("3");
    expect(view.text).toContain("Cô Hà");
  });

  it("builds the unreadable-answer list from table/question refs", () => {
    const view = describeJob(
      job({
        warnings: [
          {
            code: "unreadableAnswers",
            params: {
              docId: "d1",
              refs: [
                { table: 2, question: "4" },
                { table: 3, question: "1" },
              ],
            },
          },
        ],
      }),
      t,
    );
    expect(view.warnings[0]).toContain(
      "table 2 question 4, table 3 question 1",
    );
  });
});

describe("isJobFinished", () => {
  it("is true only for done and failed", () => {
    expect(isJobFinished({ status: "done" })).toBe(true);
    expect(isJobFinished({ status: "failed" })).toBe(true);
    for (const status of ["queued", "preparing", "writing"]) {
      expect(isJobFinished({ status })).toBe(false);
    }
  });
});
