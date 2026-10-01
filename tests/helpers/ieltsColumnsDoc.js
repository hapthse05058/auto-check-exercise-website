/**
 * A tiny Docs model for the IELTS 2-column tests: a tab of top-level
 * paragraphs and tables whose cells hold plain text. Unlike fakeDocs.js it
 * supports what ieltsDoc.js sends for that layout — an insertText carrying
 * "\n" (new paragraphs) and a delete spanning paragraphs — by keeping each
 * text unit (a paragraph, a cell) as one string and rebuilding the Docs JSON
 * after every request. Styles are recorded per character only for "bold".
 *
 * Spec: an array of blocks —
 *   "text"                      a paragraph
 *   { image: "id" }             a paragraph holding one inline image
 *   { table: [["cell", …], …] } a table, rows of cell texts ("\n" = paragraph)
 */

const TAB_ID = "t.w";

function unitsOf(spec) {
  return spec.map((block) => {
    if (typeof block === "string") return { kind: "p", text: `${block}\n` };
    if (block.image) return { kind: "img", id: block.image };
    // A cell's "**…**" spans are bold (the teachers' headings are).
    const cellOf = (spec) => {
      let text = "";
      const boldAt = [];
      const parts = `${spec}\n`.split(/\*\*/);
      parts.forEach((part, i) => {
        if (i % 2)
          for (let k = 0; k < part.length; k++) boldAt.push(text.length + k);
        text += part;
      });
      return { text, boldAt };
    };
    return { kind: "table", rows: block.table.map((row) => row.map(cellOf)) };
  });
}

/** Builds the Docs JSON of `state`, indexes from 1, like the API. */
function render(state) {
  let at = 1;
  /** `bold`: offsets into `text` that are bold. One run per stretch. */
  const paragraphsOf = (text, bold = []) => {
    const boldSet = new Set(bold);
    const out = [];
    let offset = 0;
    for (const line of text.split(/(?<=\n)/)) {
      const start = at;
      const isBold = (k) => boldSet.has(offset + k);
      const elements = [];
      let runStart = 0;
      for (let i = 1; i <= line.length; i++) {
        if (i === line.length || isBold(i) !== isBold(runStart)) {
          elements.push({
            startIndex: start + runStart,
            endIndex: start + i,
            textRun: {
              content: line.slice(runStart, i),
              textStyle: isBold(runStart) ? { bold: true } : {},
            },
          });
          runStart = i;
        }
      }
      at += line.length;
      offset += line.length;
      out.push({ startIndex: start, endIndex: at, paragraph: { elements } });
    }
    return out;
  };
  const content = [];
  state.offsets = [];
  for (const unit of state.units) {
    if (unit.kind === "p") {
      state.offsets.push({ unit, start: at });
      content.push(...paragraphsOf(unit.text, unit.boldAt || []));
    } else if (unit.kind === "img") {
      content.push({
        startIndex: at,
        endIndex: at + 2,
        paragraph: {
          elements: [
            {
              startIndex: at,
              endIndex: at + 1,
              inlineObjectElement: { inlineObjectId: unit.id },
            },
            {
              startIndex: at + 1,
              endIndex: at + 2,
              textRun: { content: "\n" },
            },
          ],
        },
      });
      at += 2;
    } else {
      const start = at;
      at += 1; // the table itself
      const tableRows = unit.rows.map((row) => {
        at += 1; // the row
        return {
          tableCells: row.map((cell) => {
            at += 1; // the cell
            state.offsets.push({ unit: cell, start: at });
            const cellStart = at;
            const paras = paragraphsOf(cell.text, cell.boldAt || []);
            return { startIndex: cellStart, endIndex: at, content: paras };
          }),
        };
      });
      content.push({
        startIndex: start,
        endIndex: at,
        table: {
          rows: unit.rows.length,
          columns: unit.rows[0].length,
          tableRows,
        },
      });
    }
  }
  return content;
}

function unitAt(state, index, end = index) {
  for (const o of state.offsets) {
    if (index >= o.start && end <= o.start + o.unit.text.length) return o;
  }
  throw new Error(`ieltsColumnsDoc: no text unit holds ${index}..${end}`);
}

export function makeColumnsTab(spec, title = "Writing buổi 4") {
  const state = { units: unitsOf(spec), named: {} };
  const tab = {
    tabProperties: { title, tabId: TAB_ID },
    documentTab: {
      body: { content: [] },
      inlineObjects: {},
      namedRanges: state.named,
    },
  };
  const refresh = () => {
    tab.documentTab.body.content = render(state);
    for (const unit of state.units) {
      if (unit.kind === "img") {
        tab.documentTab.inlineObjects[unit.id] = {
          inlineObjectProperties: {
            embeddedObject: {
              imageProperties: { contentUri: `https://img/${unit.id}` },
            },
          },
        };
      }
    }
  };
  const shiftRanges = (from, delta) => {
    for (const group of Object.values(state.named)) {
      for (const nr of group.namedRanges) {
        for (const r of nr.ranges) {
          if (r.startIndex >= from) {
            r.startIndex += delta;
            r.endIndex += delta;
          } else if (r.endIndex > from) {
            r.endIndex += delta;
          }
        }
      }
    }
  };
  const boldShift = (unit, local, delta) => {
    unit.boldAt = (unit.boldAt || [])
      .filter((k) => delta > 0 || k < local || k >= local - delta)
      .map((k) => (k >= local ? k + delta : k));
  };
  let seq = 0;
  const apply = (requests) => {
    for (const request of requests) {
      const [kind, body] = Object.entries(request)[0];
      if (kind === "insertText") {
        const { index } = body.location;
        const o = unitAt(state, index);
        const local = index - o.start;
        o.unit.text =
          o.unit.text.slice(0, local) + body.text + o.unit.text.slice(local);
        boldShift(o.unit, local, body.text.length);
        shiftRanges(index, body.text.length);
      } else if (kind === "deleteContentRange") {
        const { startIndex, endIndex } = body.range;
        const o = unitAt(state, startIndex, endIndex);
        const local = startIndex - o.start;
        const len = endIndex - startIndex;
        o.unit.text =
          o.unit.text.slice(0, local) + o.unit.text.slice(local + len);
        boldShift(o.unit, local, -len);
        for (const group of Object.values(state.named)) {
          for (const nr of group.namedRanges) {
            for (const r of nr.ranges) {
              if (r.startIndex >= endIndex) {
                r.startIndex -= len;
                r.endIndex -= len;
              } else if (r.endIndex > startIndex) {
                r.startIndex = Math.min(r.startIndex, startIndex);
                r.endIndex = Math.max(r.startIndex, r.endIndex - len);
              }
            }
          }
        }
      } else if (kind === "updateTextStyle") {
        if (!("bold" in body.textStyle)) continue;
        const { startIndex, endIndex } = body.range;
        const o = unitAt(state, startIndex, endIndex);
        const set = new Set(o.unit.boldAt || []);
        for (let i = startIndex; i < endIndex; i++) {
          if (body.textStyle.bold) set.add(i - o.start);
          else set.delete(i - o.start);
        }
        o.unit.boldAt = [...set];
      } else if (kind === "createNamedRange") {
        const group = (state.named[body.name] ||= {
          name: body.name,
          namedRanges: [],
        });
        group.namedRanges.push({
          namedRangeId: `nr.${++seq}`,
          name: body.name,
          ranges: [
            {
              startIndex: body.range.startIndex,
              endIndex: body.range.endIndex,
              tabId: TAB_ID,
            },
          ],
        });
      } else if (kind === "deleteNamedRange") {
        delete state.named[body.name];
      } else {
        throw new Error(`ieltsColumnsDoc: unsupported ${kind}`);
      }
      refresh();
    }
  };
  refresh();
  return {
    tab,
    apply,
    /** Cell text of table `t`, row `r`, cell `c` (final "\n" dropped). */
    cell: (t, r, c) =>
      state.units
        .filter((u) => u.kind === "table")
        [t].rows[r][c].text.replace(/\n$/, ""),
    /** Bold characters of a cell, as the text they spell. */
    boldOf: (t, r, c) => {
      const cell = state.units.filter((u) => u.kind === "table")[t].rows[r][c];
      return [...(cell.boldAt || [])]
        .sort((a, b) => a - b)
        .map((k) => cell.text[k])
        .join("");
    },
    /** Types `text` into a cell at its end (a teacher, a student). */
    type: (t, r, c, text) => {
      const cell = state.units.filter((u) => u.kind === "table")[t].rows[r][c];
      const o = state.offsets.find((x) => x.unit === cell);
      const index = o.start + cell.text.length - 1;
      apply([{ insertText: { location: { index, tabId: TAB_ID }, text } }]);
    },
    /** Replaces the first `find` in a cell with `replace` (an edit). */
    edit: (t, r, c, find, replace) => {
      const cell = state.units.filter((u) => u.kind === "table")[t].rows[r][c];
      const o = state.offsets.find((x) => x.unit === cell);
      const at = cell.text.indexOf(find);
      if (at < 0) throw new Error(`no "${find}" in cell`);
      apply([
        {
          deleteContentRange: {
            range: {
              startIndex: o.start + at,
              endIndex: o.start + at + find.length,
              tabId: TAB_ID,
            },
          },
        },
        {
          insertText: {
            location: { index: o.start + at, tabId: TAB_ID },
            text: replace,
          },
        },
      ]);
    },
  };
}
