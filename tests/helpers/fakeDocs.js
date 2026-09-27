/**
 * A small Google Docs simulator for tests: applies batchUpdate requests to a
 * Docs API document JSON (tabs, paragraphs, tables, named ranges) the way the
 * real API does for the requests hsDoc.js sends — every index after an edit
 * shifts, runs split where a style changes, named ranges move with the text.
 *
 * Supported: insertText (no "\n" — hsDoc never inserts paragraphs),
 * updateTextStyle, createNamedRange, deleteContentRange (within one
 * paragraph), deleteNamedRange. Anything else throws.
 */
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A fixture doc (tests/fixtures/hs/<name>.json.gz), freshly parsed. */
export function loadHsFixture(name) {
  const file = path.join(HERE, "..", "fixtures", "hs", `${name}.json.gz`);
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
}

function allTabs(tabs, out = []) {
  for (const t of tabs || []) {
    out.push(t);
    allTabs(t.childTabs, out);
  }
  return out;
}

export const tabById = (doc, tabId) =>
  allTabs(doc.tabs).find((t) => t.tabProperties.tabId === tabId);

export const tabByTitle = (doc, title) =>
  allTabs(doc.tabs).find((t) => t.tabProperties.title === title);

/** Every structural node that carries start/end indexes, in one tab. */
function indexedNodes(tab) {
  const out = [];
  const walk = (content) => {
    for (const b of content || []) {
      out.push(b);
      if (b.paragraph) out.push(...(b.paragraph.elements || []));
      if (b.table) {
        for (const row of b.table.tableRows) {
          out.push(row);
          for (const cell of row.tableCells) {
            out.push(cell);
            walk(cell.content);
          }
        }
      }
    }
  };
  walk(tab.documentTab.body.content);
  return out;
}

function paragraphs(tab) {
  const out = [];
  const walk = (content) => {
    for (const b of content || []) {
      if (b.paragraph) out.push(b);
      if (b.table) {
        for (const row of b.table.tableRows) {
          for (const cell of row.tableCells) walk(cell.content);
        }
      }
    }
  };
  walk(tab.documentTab.body.content);
  return out;
}

function namedRangeList(tab) {
  const out = [];
  for (const group of Object.values(tab.documentTab.namedRanges || {})) {
    for (const nr of group.namedRanges || []) out.push(...(nr.ranges || []));
  }
  return out;
}

/** Splits the run holding `index` so that a run starts exactly there. */
function splitAt(para, index) {
  const els = para.paragraph.elements;
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (!el.textRun) continue;
    if (index > el.startIndex && index < el.endIndex) {
      const cut = index - el.startIndex;
      const left = {
        ...el,
        endIndex: index,
        textRun: { ...el.textRun, content: el.textRun.content.slice(0, cut) },
      };
      const right = {
        ...el,
        startIndex: index,
        textRun: {
          ...el.textRun,
          textStyle: el.textRun.textStyle
            ? { ...el.textRun.textStyle }
            : undefined,
          content: el.textRun.content.slice(cut),
        },
      };
      els.splice(i, 1, left, right);
      return;
    }
  }
}

function paragraphAt(tab, index) {
  return paragraphs(tab).find(
    (p) => index >= p.startIndex && index < p.endIndex,
  );
}

function insertText(tab, { location: { index }, text }) {
  if (text.includes("\n")) throw new Error("fakeDocs: \\n insert unsupported");
  const para = paragraphAt(tab, index);
  if (!para) throw new Error(`fakeDocs: no paragraph at ${index}`);
  const len = text.length;
  splitAt(para, index);
  // Shift everything at or after the index; containers holding it grow.
  for (const node of indexedNodes(tab)) {
    if (node.startIndex === undefined) continue;
    if (node.startIndex >= index && node !== para) {
      node.startIndex += len;
      node.endIndex += len;
    } else if (node.endIndex > index) {
      node.endIndex += len;
    }
  }
  for (const r of namedRangeList(tab)) {
    if (r.startIndex >= index) {
      r.startIndex += len;
      r.endIndex += len;
    } else if (r.endIndex > index) {
      r.endIndex += len; // typed inside a range: it grows
    }
  }
  // The new text takes the style of the character before it (like Docs).
  const els = para.paragraph.elements;
  let at = els.findIndex((el) => el.startIndex === index + len);
  if (at < 0) at = els.length;
  const prev = els[at - 1];
  const style = prev?.textRun?.textStyle
    ? { ...prev.textRun.textStyle }
    : undefined;
  els.splice(at, 0, {
    startIndex: index,
    endIndex: index + len,
    textRun: { content: text, ...(style ? { textStyle: style } : {}) },
  });
}

function updateTextStyle(tab, { range, textStyle, fields }) {
  const names = fields.split(",").map((f) => f.trim());
  for (const para of paragraphs(tab)) {
    if (
      para.endIndex <= range.startIndex ||
      para.startIndex >= range.endIndex
    ) {
      continue;
    }
    splitAt(para, range.startIndex);
    splitAt(para, range.endIndex);
    for (const el of para.paragraph.elements) {
      if (!el.textRun) continue;
      if (el.startIndex >= range.startIndex && el.endIndex <= range.endIndex) {
        const style = { ...(el.textRun.textStyle || {}) };
        for (const f of names) {
          if (textStyle[f] === undefined || textStyle[f] === false)
            delete style[f];
          else style[f] = textStyle[f];
        }
        el.textRun.textStyle = style;
      }
    }
  }
}

let rangeSeq = 0;
function createNamedRange(tab, { name, range }) {
  const named = (tab.documentTab.namedRanges ||= {});
  const group = (named[name] ||= { name, namedRanges: [] });
  group.namedRanges.push({
    namedRangeId: `nr.${++rangeSeq}`,
    name,
    ranges: [
      {
        startIndex: range.startIndex,
        endIndex: range.endIndex,
        tabId: range.tabId,
      },
    ],
  });
}

function deleteContentRange(tab, { range }) {
  const para = paragraphAt(tab, range.startIndex);
  if (!para || range.endIndex > para.endIndex - 1) {
    throw new Error("fakeDocs: delete must stay inside one paragraph");
  }
  const len = range.endIndex - range.startIndex;
  splitAt(para, range.startIndex);
  splitAt(para, range.endIndex);
  para.paragraph.elements = para.paragraph.elements.filter(
    (el) =>
      !(el.startIndex >= range.startIndex && el.endIndex <= range.endIndex),
  );
  for (const node of indexedNodes(tab)) {
    if (node.startIndex === undefined) continue;
    if (node.startIndex >= range.endIndex) {
      node.startIndex -= len;
      node.endIndex -= len;
    } else if (node.endIndex > range.startIndex) {
      node.endIndex -= len;
    }
  }
  for (const group of Object.values(tab.documentTab.namedRanges || {})) {
    for (const nr of group.namedRanges || []) {
      for (const r of nr.ranges) {
        if (r.startIndex >= range.endIndex) {
          r.startIndex -= len;
          r.endIndex -= len;
        } else if (r.endIndex > range.startIndex) {
          r.startIndex = Math.min(r.startIndex, range.startIndex);
          r.endIndex = Math.max(r.startIndex, r.endIndex - len);
        }
      }
      nr.ranges = nr.ranges.filter((r) => r.endIndex > r.startIndex);
    }
    group.namedRanges = group.namedRanges.filter((nr) => nr.ranges.length);
  }
}

function deleteNamedRange(tab, { name }) {
  delete tab.documentTab.namedRanges?.[name];
}

/** Applies batchUpdate requests to `doc` in place, like the Docs API. */
export function applyRequests(doc, requests) {
  for (const request of requests) {
    const [kind, body] = Object.entries(request)[0];
    const tabId =
      body.location?.tabId ??
      body.range?.tabId ??
      body.tabsCriteria?.tabIds?.[0];
    const tab = tabById(doc, tabId);
    if (!tab) throw new Error(`fakeDocs: no tab ${tabId}`);
    if (kind === "insertText") insertText(tab, body);
    else if (kind === "updateTextStyle") updateTextStyle(tab, body);
    else if (kind === "createNamedRange") createNamedRange(tab, body);
    else if (kind === "deleteContentRange") deleteContentRange(tab, body);
    else if (kind === "deleteNamedRange") deleteNamedRange(tab, body);
    else throw new Error(`fakeDocs: unsupported request ${kind}`);
  }
  return doc;
}

/** The text of a paragraph element list (final "\n" kept). */
export const paraText = (para) =>
  para.paragraph.elements.map((e) => e.textRun?.content ?? "").join("");

/**
 * The first paragraph of a tab (tables included) whose text starts with
 * `prefix` — after `from` paragraphs matching it have been skipped.
 */
export function findParagraph(tab, prefix, nth = 0) {
  const hits = paragraphs(tab).filter((p) => paraText(p).startsWith(prefix));
  if (!hits[nth]) throw new Error(`fakeDocs: no paragraph "${prefix}" #${nth}`);
  return hits[nth];
}

/**
 * A student typing: inserts `text` into the paragraph starting with `prefix`,
 * right after the first occurrence of `after` in it (or at its end).
 */
export function typeInto(
  doc,
  tab,
  prefix,
  text,
  { after = null, nth = 0, style } = {},
) {
  const para = findParagraph(tab, prefix, nth);
  const content = paraText(para);
  const offset =
    after === null ? content.length - 1 : content.indexOf(after) + after.length;
  if (after !== null && content.indexOf(after) < 0) {
    throw new Error(`fakeDocs: "${after}" not in "${content}"`);
  }
  const index = para.startIndex + offset;
  const tabId = tab.tabProperties.tabId;
  const requests = [{ insertText: { location: { index, tabId }, text } }];
  requests.push({
    updateTextStyle: {
      range: { startIndex: index, endIndex: index + text.length, tabId },
      textStyle: style || {},
      fields: "foregroundColor,bold,underline,strikethrough,backgroundColor",
    },
  });
  applyRequests(doc, requests);
  return index;
}

/** Formats `word` (first occurrence at/after `after`) in a paragraph. */
export function styleWord(
  doc,
  tab,
  prefix,
  word,
  textStyle,
  { after = "" } = {},
) {
  const para = findParagraph(tab, prefix);
  const content = paraText(para);
  const at = content.indexOf(word, after ? content.indexOf(after) : 0);
  if (at < 0) throw new Error(`fakeDocs: "${word}" not in "${content}"`);
  const start = para.startIndex + at;
  applyRequests(doc, [
    {
      updateTextStyle: {
        range: {
          startIndex: start,
          endIndex: start + word.length,
          tabId: tab.tabProperties.tabId,
        },
        textStyle,
        fields: Object.keys(textStyle).join(","),
      },
    },
  ]);
}

/** Cell (r, c) of the n-th table of a tab whose first cell starts with `head`. */
export function findCell(tab, head, r, c) {
  const tables = [];
  const walk = (content) => {
    for (const b of content || []) if (b.table) tables.push(b.table);
  };
  walk(tab.documentTab.body.content);
  const table = tables.find((t) =>
    t.tableRows[0].tableCells[0].content
      .map((b) => (b.paragraph ? paraText(b) : ""))
      .join("")
      .startsWith(head),
  );
  if (!table) throw new Error(`fakeDocs: no table "${head}"`);
  return table.tableRows[r].tableCells[c];
}

/** Types `text` at the end of a cell's last paragraph. */
export function typeInCell(doc, tab, cell, text, style) {
  const last = cell.content.filter((b) => b.paragraph).at(-1);
  const index = last.endIndex - 1;
  const tabId = tab.tabProperties.tabId;
  applyRequests(doc, [
    { insertText: { location: { index, tabId }, text } },
    {
      updateTextStyle: {
        range: { startIndex: index, endIndex: index + text.length, tabId },
        textStyle: style || {},
        fields: "foregroundColor,bold,underline,strikethrough,backgroundColor",
      },
    },
  ]);
}

export const RED = { foregroundColor: { color: { rgbColor: { red: 1 } } } };
