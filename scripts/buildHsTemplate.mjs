/* global process, console */
/**
 * Generates src/lib/hsTemplate.js from the blank HS form (a Docs API dump,
 * slimmed: tests/fixtures/hs/blank.json.gz).
 *
 *   node scripts/buildHsTemplate.mjs            # write src/lib/hsTemplate.js
 *   node scripts/buildHsTemplate.mjs --check    # exit 1 when it is stale
 *
 * SPEC below is the hand-made catalogue of the TỰ LUẬN section: for every
 * lesson, its exercises in order — how to recognise the header, how the
 * exercise is laid out, what kind of grading it gets and how many items it
 * has. The script refuses to write anything unless the blank form matches the
 * catalogue exactly: every header found, no header left over, every item count
 * equal to `expected`, every item key unique.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

import * as prettier from "prettier";

import {
  ARROW_START,
  headerBody,
  blocksText,
  cellParagraphs,
  countSlots,
  normalizeKey,
  normalizeText,
  paragraphChars,
} from "../src/lib/hsDoc.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLANK = path.join(ROOT, "tests/fixtures/hs/blank.json.gz");
const OUT = path.join(ROOT, "src/lib/hsTemplate.js");

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

/** Exercise 1 of almost every lesson: the Vietnamese → English table. */
const VI_EN = {
  id: "ex1",
  match: /^exercise 1: cả lớp dựa vào/,
  layout: "vi_en",
  kind: "vi_en",
  expected: 5,
};

/**
 * layout — how items are laid out (see buildItems):
 *   vi_en, svo       tables with a "Chữa bài" column (feedback goes there)
 *   rows             a table whose rows hold [prompt, answer] column pairs
 *   cells            a table: every cell in `rows`×`cols` is an item
 *   columns          a table: every column is one item (a list of words)
 *   tense            the Buổi 04 translate-and-mark-the-tense tables
 *   cell_lines       a table whose cells hold "word →" lines, one item each
 *   lines            paragraphs: a question (+ its "→ ____" line) per item
 *   passage          paragraphs: every "____" is one item
 *   choose           paragraphs "… (is/am/are) …": the student marks one
 *   underline_translate  Buổi 09 Ex4: underline the head nouns + translate
 *   skip             not graded in writing (read aloud / pronunciation)
 * kind — how the grader treats the item (backend prompt_hs.txt).
 */
const SPEC = {
  1: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: find the subject/,
      layout: "svo",
      kind: "svo",
      expected: 15,
    },
  ],
  2: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: form the 12/,
      layout: "cells",
      kind: "grid",
      expected: 12,
      rows: [1, 4],
      cols: [0, 2],
      label: "cell",
    },
  ],
  3: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: listen and fill/,
      layout: "passage",
      kind: "listening",
      expected: 9,
    },
  ],
  4: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: translate the vietnamese/,
      layout: "tense",
      kind: "tense",
      expected: 24,
    },
  ],
  5: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: rearrange the words to make correct comparative/,
      layout: "rows",
      kind: "line",
      expected: 10,
      groups: [[1, 2]],
    },
    {
      id: "ex3",
      match: /^exercise 3: rewrite the/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
    {
      id: "tc",
      match: /^bài tập tự chọn: change the adjectives/,
      layout: "cells",
      kind: "grid",
      expected: 24,
      optional: true,
      rows: [2, 5],
      cols: [1, 6],
      label: "comparative",
    },
  ],
  6: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: rearrange the words/,
      layout: "lines",
      kind: "line",
      expected: 3,
    },
    {
      id: "ex3",
      match: /^exercise 3: classify/,
      layout: "cells",
      kind: "grid",
      expected: 3,
      rows: [2, 2],
      cols: [0, 2],
      label: "classify",
    },
    {
      id: "ex4",
      match: /^exercise 4: change the following singular/,
      layout: "cell_lines",
      kind: "blank",
      expected: 10,
    },
  ],
  7: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: write the correct form of the verb\./,
      layout: "lines",
      kind: "blank",
      expected: 10,
    },
    {
      id: "ex3",
      match: /^exercise 3: rearrange the words/,
      layout: "lines",
      kind: "line",
      expected: 3,
    },
  ],
  8: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: write the correct form of the verb and explain/,
      layout: "lines",
      kind: "blank_reason",
      expected: 10,
    },
    {
      id: "ex3",
      match: /^exercise 3: rearrange the words/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
  ],
  9: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: ?change the singular nouns/,
      layout: "rows",
      kind: "blank",
      expected: 16,
      groups: [
        [1, 2],
        [4, 5],
      ],
    },
    {
      id: "ex3",
      match: /^exercise 3: identify the head nouns/,
      layout: "choose",
      kind: "choose",
      expected: 5,
    },
    {
      id: "ex4",
      match: /^exercise 4: read and translate/,
      layout: "underline_translate",
      kind: "underline_translate",
      expected: 1,
    },
  ],
  10: [VI_EN],
  11: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: fill in the blank with the suitable words/,
      layout: "passage",
      kind: "passage",
      expected: 10,
    },
  ],
  12: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: fill in the blank with the suitable personal/,
      layout: "lines",
      kind: "blank",
      expected: 8,
    },
    {
      id: "ex3",
      match: /^exercise 3: practice pronouncing/,
      layout: "skip",
      kind: "skip",
      expected: 0,
    },
    {
      id: "tc",
      match: /^bài tập tự chọn: choose the suitable personal/,
      layout: "choose",
      kind: "choose",
      expected: 7,
      optional: true,
    },
  ],
  13: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: complete the sentence with a personal/,
      layout: "lines",
      kind: "blank",
      expected: 7,
    },
    {
      id: "ex3",
      match: /^exercise 3: rewrite the sentences, using/,
      layout: "lines",
      kind: "blank",
      expected: 5,
    },
    {
      id: "tc",
      match: /^bài tập tự chọn: read the passage/,
      layout: "passage",
      kind: "passage",
      expected: 9,
      optional: true,
    },
  ],
  14: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: fill in the blanks with "a"/,
      layout: "lines",
      kind: "blank",
      expected: 10,
    },
  ],
  15: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: there is a mistake/,
      layout: "lines",
      kind: "line",
      expected: 9,
    },
    {
      id: "ex3",
      match: /^exercise 3: fill in the blank with much/,
      layout: "lines",
      kind: "blank",
      expected: 6,
    },
  ],
  16: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: complete the sentences with the correct form/,
      layout: "lines",
      kind: "blank",
      expected: 5,
    },
    {
      id: "ex3",
      match: /^exercise 3: use the words in brackets/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
    {
      id: "tc",
      match: /^bài tập tự chọn: complete the sentences with "is"/,
      layout: "lines",
      kind: "blank",
      expected: 5,
      optional: true,
    },
  ],
  17: [
    {
      id: "ex1",
      match: /^exercise 1: ?put the verbs/,
      layout: "lines",
      kind: "blank",
      expected: 10,
    },
    {
      id: "ex2",
      match: /^exercise 2: rewrite the sentence so that/,
      layout: "lines",
      kind: "line",
      expected: 6,
    },
    {
      id: "ex3",
      match: /^exercise 3: arrange the following words/,
      layout: "lines",
      kind: "line",
      expected: 9,
    },
    {
      id: "ex4",
      match: /^exercise 4: use the words in brackets/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
  ],
  18: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: answer the question/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
    {
      id: "ex3",
      match: /^exercise 3: put the words in the correct order/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
  ],
  19: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: there is a mistake/,
      layout: "lines",
      kind: "line",
      expected: 10,
    },
  ],
  20: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: ?arrange the following words/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
    {
      id: "ex3",
      match: /^exercise 3: there is a mistake/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
    {
      id: "ex4",
      match: /^exercise 4: fill in the blanks with at/,
      layout: "lines",
      kind: "blank",
      expected: 5,
    },
  ],
  21: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: điền "must"/,
      layout: "lines",
      kind: "blank",
      expected: 5,
    },
    {
      id: "ex3",
      match: /^exercise 3: viết lại câu với must/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
    {
      id: "ex4",
      match: /^exercise 4: ?use "might/,
      layout: "lines",
      kind: "blank",
      expected: 5,
    },
  ],
  22: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: fill in the auxiliary/,
      layout: "lines",
      kind: "blank",
      expected: 5,
    },
    {
      id: "ex3",
      match: /^exercise 3: rewrite the sentences in the negative/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
    {
      id: "ex4",
      match: /^exercise 4: make wh-questions/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
    {
      id: "tc1",
      match: /^exercise 1: fill in the blanks with the negative/,
      layout: "lines",
      kind: "blank",
      expected: 5,
      optional: true,
    },
    {
      id: "tc2",
      match: /^exercise 2: find and correct/,
      layout: "lines",
      kind: "line",
      expected: 5,
      optional: true,
    },
  ],
  23: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: make yes\/no questions/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
    {
      id: "ex3",
      match: /^exercise 3: rewrite the sentences as yes\/no/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
    {
      id: "ex4",
      match: /^exercise 4: make wh-questions/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
    {
      id: "ex5",
      match: /^exercise 5: find and correct/,
      layout: "lines",
      kind: "line",
      expected: 5,
    },
  ],
  24: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: for each sentence, complete/,
      layout: "lines",
      kind: "blank",
      expected: 4,
    },
    {
      id: "ex3",
      match: /^exercise 3: fill each blank/,
      layout: "lines",
      kind: "blank",
      expected: 6,
    },
    {
      id: "ex4",
      match: /^exercise 4: complete the sentence with the negative form/,
      layout: "lines",
      kind: "blank",
      expected: 5,
    },
    {
      id: "ex5",
      match: /^exercise 5: make questions and write short/,
      layout: "lines",
      kind: "line",
      expected: 3,
    },
  ],
  review1: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: sort the words into the correct sound\. \/ɪ\//,
      layout: "columns",
      kind: "sort",
      expected: 2,
    },
    {
      id: "ex3",
      match: /^exercise 3: sort the words into the correct sound \/s\//,
      layout: "columns",
      kind: "sort",
      expected: 2,
    },
    {
      id: "ex4",
      match: /^exercise 4: add "-s\/-es"/,
      layout: "columns",
      kind: "sort",
      expected: 3,
    },
    {
      id: "ex5",
      match: /^exercise 5: rewrite the sentence without/,
      layout: "lines",
      kind: "line",
      expected: 7,
    },
  ],
  review2: [
    VI_EN,
    {
      id: "ex2",
      match: /^exercise 2: chia động từ trong ngoặc/,
      layout: "lines",
      kind: "line",
      expected: 4,
    },
    {
      id: "ex3",
      match: /^exercise 3: writing\/viết lại câu/,
      layout: "lines",
      kind: "line",
      expected: 2,
    },
  ],
};

// ---------------------------------------------------------------------------
// Reading the blank form
// ---------------------------------------------------------------------------

const lessonOf = (title) => {
  const t = normalizeKey(title);
  let m = /^bu[oổ]i\s*0*(\d+)$/.exec(t);
  if (m) {
    const n = Number(m[1]);
    return { spec: n, id: `hsLesson${String(n).padStart(2, "0")}`, number: n };
  }
  m = /^ôn tập thêm\s*(\d+)$/.exec(t);
  if (m) return { spec: `review${m[1]}`, id: `hsReview${m[1]}`, number: null };
  return null;
};

const SECTION_START = /^(ii|iii|iv)\s*[.,]\s*tự luận/;
const SECTION_END = /^v\s*\.\s*nghe và nói theo/;

const blockKey = (b) =>
  normalizeKey(
    b.paragraph
      ? paragraphChars(b).text
      : blocksText(b.table.tableRows[0].tableCells[0].content),
  );

/** A header block: a 1×1 box or a paragraph opening with "Exercise N" / "BÀI TẬP TỰ CHỌN". */
function headerKind(b) {
  const isBox = b.table && b.table.rows === 1 && b.table.columns === 1;
  if (!isBox && !b.paragraph) return null;
  const key = blockKey(b);
  if (/^exercise \d/.test(key)) return "exercise";
  if (/^bài tập tự chọn/.test(key))
    return key.length < 25 ? "marker" : "exercise";
  return null;
}

const cellText = (table, r, c) =>
  blocksText(table.tableRows[r]?.tableCells[c]?.content || []).trim();

const isNumber = (text) => /^\d{1,2}\.?$/.test(text.trim());

/** Question paragraphs that are examples or instructions, not items. */
const NOT_AN_ITEM =
  /^(vd|ví dụ|eg|e\.g\.|giải thích|dịch nghĩa)\b|^từ cho sẵn/i;

/** Items of one exercise region (see the layout list above SPEC). */
function buildItems(ex, region) {
  const { paras, tables } = region;
  const items = [];
  const table = tables[0];
  const add = (item) => items.push({ ...item, kind: item.kind || ex.kind });

  switch (ex.layout) {
    case "vi_en":
    case "svo": {
      const head = table.tableRows[0].tableCells.map((c) =>
        normalizeKey(blocksText(c.content)),
      );
      const col = (re) => head.findIndex((h) => re.test(h));
      const fb = col(/^chữa bài/);
      const vi = col(/^tiếng việt/);
      const en = col(/^câu tiếng anh/);
      if (fb < 0 || vi < 0 || en < 0)
        throw new Error(`${ex.id}: header ${head}`);
      for (let r = 1; r < table.rows; r++) {
        if (!isNumber(cellText(table, r, 0))) continue;
        if (ex.layout === "vi_en") {
          const hint = cellText(table, r, col(/^gợi ý/));
          add({
            prompt: cellText(table, r, vi),
            hint: normalizeText(hint),
            parts: [{ t: 0, r, c: en }],
            fb: { t: 0, r, c: fb },
          });
        } else {
          add({
            prompt: cellText(table, r, en),
            hint: cellText(table, r, vi),
            parts: [3, 4, 5].map((c) => ({ t: 0, r, c })),
            labels: ["S", "V", "O"],
            fb: { t: 0, r, c: fb },
          });
        }
      }
      break;
    }
    case "rows":
      for (let r = 1; r < table.rows; r++) {
        for (const [pc, ac] of ex.groups) {
          const prompt = cellText(table, r, pc);
          if (!prompt) continue;
          add({ prompt, parts: [{ t: 0, r, c: ac }] });
        }
      }
      break;
    case "cells": {
      const [r0, r1] = ex.rows;
      const [c0, c1] = ex.cols;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          let prompt;
          if (ex.label === "cell")
            prompt = `${cellText(table, 0, c)} – ${cellText(table, r, c)}`;
          else if (ex.label === "comparative")
            prompt = `${cellText(table, r, 0)}: ${cellText(table, 1, c).replace(/^\d+\.\s*/, "")}`;
          else if (ex.label === "classify")
            prompt =
              [cellText(table, 0, c), cellText(table, 1, c)]
                .filter(Boolean)
                .join(" – ") || "Không đếm được";
          add({
            prompt,
            parts: [{ t: 0, r, c }],
            formText: cellText(table, r, c),
          });
        }
      }
      break;
    }
    case "columns":
      for (let c = 0; c < table.columns; c++) {
        const parts = [];
        for (let r = 1; r < table.rows; r++) parts.push({ t: 0, r, c });
        add({ prompt: cellText(table, 0, c), parts });
      }
      break;
    case "tense":
      tables.forEach((tb, t) => {
        const labels = tb.tableRows[0].tableCells.map((c) =>
          normalizeText(blocksText(c.content)),
        );
        for (let r = 1; r < tb.rows; r++) {
          const prompt = cellText(tb, r, 0);
          if (!prompt) continue;
          const parts = [];
          for (let c = 1; c < tb.columns; c++) parts.push({ t, r, c });
          add({ prompt, parts, labels: labels.slice(1), group: labels[0] });
        }
      });
      break;
    case "cell_lines":
      for (let r = 0; r < table.rows; r++) {
        table.tableRows[r].tableCells.forEach((cell, c) => {
          cellParagraphs(cell).forEach((p, i) => {
            if (!p.text.trim() || countSlots(p.text) === 0) return;
            add({
              prompt: p.text.trim(),
              parts: [{ t: 0, r, c, p: i }],
              formText: p.text,
            });
          });
        });
      }
      break;
    case "lines":
      paras.forEach((p, i) => {
        if (p.role !== undefined) return; // already part of an item
        const text = p.text.trim();
        if (
          !text ||
          ARROW_START.test(text) ||
          NOT_AN_ITEM.test(normalizeKey(text))
        )
          return;
        const parts = [i];
        for (
          let j = i + 1;
          j < paras.length && ARROW_START.test(paras[j].text);
          j++
        )
          parts.push(j);
        const formText = parts.map((k) => paras[k].text).join("\n");
        if (countSlots(formText) === 0) return; // a word bank or a note
        parts.forEach((k) => (paras[k].role = items.length));
        add({
          prompt: normalizeText(formText),
          parts: parts.map((k) => ({ p: k })),
          formText,
        });
      });
      break;
    case "passage":
      paras.forEach((p, i) => {
        const slots = countSlots(p.text);
        for (let s = 0; s < slots; s++) {
          add({
            prompt: normalizeText(p.text),
            parts: [{ p: i }],
            slot: s,
            formText: p.text,
          });
        }
      });
      break;
    case "choose":
      paras.forEach((p, i) => {
        const group = /\(([^()]*\/[^()]*)\)/.exec(p.text);
        if (!group) return;
        const options = group[1].split("/").map((o) => o.trim());
        add({
          prompt: normalizeText(p.text),
          parts: [{ p: i }],
          options,
          group: group[0],
          formText: p.text,
        });
      });
      break;
    case "underline_translate":
      add({
        prompt: normalizeText(paras[0].text),
        parts: paras.map((_, i) => ({ p: i })),
        formText: paras.map((p) => p.text).join("\n"),
      });
      break;
    case "skip":
      break;
    default:
      throw new Error(`unknown layout ${ex.layout}`);
  }
  return items;
}

/** Style flags of the form's own text, per paragraph (for choose/underline). */
const formFlags = (p) => p.flags.join(",");

function readLesson(tab) {
  const lesson = lessonOf(tab.tabProperties.title);
  const specs = SPEC[lesson.spec];
  if (!specs) throw new Error(`no spec for ${tab.tabProperties.title}`);
  const content = tab.documentTab.body.content;
  let start = content.findIndex(
    (b) =>
      b.paragraph && SECTION_START.test(normalizeKey(paragraphChars(b).text)),
  );
  if (start < 0) throw new Error(`${lesson.id}: no TỰ LUẬN section`);
  let end = content.findIndex(
    (b, i) =>
      i > start &&
      b.paragraph &&
      SECTION_END.test(normalizeKey(paragraphChars(b).text)),
  );
  if (end < 0) end = content.length;

  const headers = [];
  for (let i = start + 1; i < end; i++) {
    const kind = headerKind(content[i]);
    if (kind === "exercise") headers.push(i);
  }
  if (headers.length !== specs.length) {
    throw new Error(
      `${lesson.id}: ${headers.length} headers, spec has ${specs.length}: ${headers.map((i) => blockKey(content[i]).slice(0, 50)).join(" || ")}`,
    );
  }

  const exercises = specs.map((ex, n) => {
    const at = headers[n];
    const header = blockKey(content[at]);
    if (!ex.match.test(header))
      throw new Error(`${lesson.id} ${ex.id}: header "${header.slice(0, 80)}"`);
    const stop = n + 1 < headers.length ? headers[n + 1] : end;
    const blocks = content
      .slice(at + 1, stop)
      .filter((b) => b.table || (b.paragraph && paragraphChars(b).text.trim()));
    // A bare "BÀI TẬP TỰ CHỌN" marker ends the region.
    const cut = blocks.findIndex((b) => headerKind(b) === "marker");
    const region = cut >= 0 ? blocks.slice(0, cut) : blocks;
    const paras = region
      .filter((b) => b.paragraph)
      .map((b) => ({ ...paragraphChars(b) }));
    const tables = region.filter((b) => b.table).map((b) => b.table);
    const items = buildItems(ex, { paras, tables });
    if (items.length !== ex.expected) {
      throw new Error(
        `${lesson.id} ${ex.id}: ${items.length} items, expected ${ex.expected}: ${items.map((i) => i.prompt.slice(0, 30)).join(" | ")}`,
      );
    }
    const instruction = normalizeText(
      [
        content[at].paragraph
          ? paragraphChars(content[at]).text
          : blocksText(content[at].table.tableRows[0].tableCells[0].content),
        ...paras
          .filter(
            (p) =>
              p.role === undefined &&
              !items.some((it) =>
                it.parts.some(
                  (pt) =>
                    pt.p !== undefined &&
                    pt.t === undefined &&
                    paras[pt.p] === p,
                ),
              ),
          )
          .map((p) => p.text),
      ].join("\n"),
    );
    return {
      id: ex.id,
      header: headerBody(header).slice(0, 50),
      layout: ex.layout,
      kind: ex.kind,
      optional: Boolean(ex.optional),
      expected: ex.expected,
      instruction,
      paras: paras.map((p) => ({
        text: p.text,
        ...(ex.layout === "choose" || ex.layout === "underline_translate"
          ? { flags: formFlags(p) }
          : {}),
      })),
      tables: tables.map((tb) => ({
        rows: tb.rows,
        columns: tb.columns,
        cells: tb.tableRows.map((r) =>
          r.tableCells.map((c) => cellParagraphs(c).map((p) => p.text)),
        ),
      })),
      items: items.map((it, i) => ({
        key: `${lesson.id}|${ex.id}|${normalizeKey(it.prompt)}${it.slot !== undefined ? `|${it.slot}` : ""}`,
        n: i + 1,
        ...it,
      })),
    };
  });
  return {
    id: lesson.id,
    number: lesson.number,
    title: normalizeText(tab.tabProperties.title),
    exercises,
  };
}

// ---------------------------------------------------------------------------

const doc = JSON.parse(zlib.gunzipSync(fs.readFileSync(BLANK)));
const lessons = doc.tabs.map(readLesson);
if (lessons.length !== 26)
  throw new Error(`${lessons.length} lessons, expected 26`);
const keys = new Set();
for (const lesson of lessons) {
  for (const ex of lesson.exercises) {
    for (const item of ex.items) {
      if (keys.has(item.key)) throw new Error(`duplicate key ${item.key}`);
      keys.add(item.key);
    }
  }
}

const raw = `/**
 * GENERATED by scripts/buildHsTemplate.mjs from the blank HS form — do not
 * edit by hand. The catalogue of the TỰ LUẬN section of every lesson: see
 * hsDoc.js for how it is used.
 */
export const HS_LESSONS = ${JSON.stringify(lessons)};
`;
// Formatted like the rest of src/ — lint-staged runs prettier on commit, and
// --check must agree with what gets committed.
const body = await prettier.format(raw, {
  ...(await prettier.resolveConfig(OUT)),
  filepath: OUT,
});
const total = lessons.reduce(
  (n, l) => n + l.exercises.reduce((m, e) => m + e.items.length, 0),
  0,
);
if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current.replace(/\r\n/g, "\n") !== body) {
    console.error(
      "src/lib/hsTemplate.js is stale — run node scripts/buildHsTemplate.mjs",
    );
    process.exit(1);
  }
  console.log(
    `hsTemplate.js up to date (${lessons.length} lessons, ${total} items)`,
  );
} else {
  fs.writeFileSync(OUT, body);
  console.log(
    `wrote ${path.relative(ROOT, OUT)}: ${lessons.length} lessons, ${total} items, ${(body.length / 1024).toFixed(0)} KB`,
  );
}
