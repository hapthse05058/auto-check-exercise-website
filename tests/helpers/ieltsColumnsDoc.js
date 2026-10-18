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
    return {
      kind: "table",
      rows: block.table.map((row) => row.map(cellOf)),
      widths: block.widths || null,
      spans: (block.spans || []).map((s) => [...s]),
    };
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
    unit.start = at;
    if (unit.kind === "p") {
      state.offsets.push({ unit, start: at });
      content.push(...paragraphsOf(unit.text, unit.boldAt || []));
      unit.end = at;
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
      unit.end = at;
    } else {
      const start = at;
      at += 1; // the table itself
      const tableRows = unit.rows.map((row, r) => {
        const rowStart = at;
        at += 1; // the row
        const tableCells = row.map((cell, c) => {
          const cellStart = at;
          at += 1; // the cell
          state.offsets.push({ unit: cell, start: at });
          const paras = paragraphsOf(cell.text, cell.boldAt || []);
          // [row, column, rowSpan]: a cell merged down over the rows below.
          const span = (unit.spans || []).find((s) => s[0] === r && s[1] === c);
          return {
            startIndex: cellStart,
            endIndex: at,
            content: paras,
            ...(span ? { tableCellStyle: { rowSpan: span[2] } } : {}),
          };
        });
        return { startIndex: rowStart, endIndex: at, tableCells };
      });
      at += 1; // the table's end, as in the Docs API
      unit.end = at;
      content.push({
        startIndex: start,
        endIndex: at,
        table: {
          rows: unit.rows.length,
          columns: unit.rows[0].length,
          tableRows,
          ...(unit.widths
            ? {
                tableStyle: {
                  tableColumnProperties: unit.widths.map((w) => ({
                    widthType: "FIXED_WIDTH",
                    width: { magnitude: w, unit: "PT" },
                  })),
                },
              }
            : {}),
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
    for (const key of ["boldAt", "italicAt"]) {
      unit[key] = (unit[key] || [])
        .filter((k) => delta > 0 || k < local || k >= local - delta)
        .map((k) => (k >= local ? k + delta : k));
    }
  };
  /** The table unit starting at Docs index `index`, with its rendered block. */
  const tableAt = (index) => {
    const blocks = tab.documentTab.body.content.filter((b) => b.table);
    const units = state.units.filter((u) => u.kind === "table");
    const k = blocks.findIndex((b) => b.startIndex === index);
    if (k < 0) throw new Error(`ieltsColumnsDoc: no table starts at ${index}`);
    return { unit: units[k], block: blocks[k] };
  };
  const emptyCell = () => ({ text: "\n", boldAt: [] });
  const totalLength = () => tab.documentTab.body.content.at(-1)?.endIndex ?? 1;
  /**
   * Table structure, as the Docs API does it (measured on a real doc): a new
   * table goes after an empty paragraph inserted at its location; rows and
   * columns come with one empty paragraph per cell. Named ranges after the
   * change move with it; one inside a table being reshaped is not modelled.
   */
  const structural = (kind, body) => {
    const before = totalLength();
    let from;
    if (kind === "insertTable") {
      const { index } = body.location;
      const o = unitAt(state, index);
      if (o.unit.kind !== "p")
        throw new Error("insertTable outside a paragraph");
      const local = index - o.start;
      const bold = o.unit.boldAt || [];
      const left = {
        kind: "p",
        text: `${o.unit.text.slice(0, local)}\n`,
        boldAt: bold.filter((k) => k < local),
      };
      const right = {
        kind: "p",
        text: o.unit.text.slice(local),
        boldAt: bold.filter((k) => k >= local).map((k) => k - local),
      };
      const table = {
        kind: "table",
        widths: null,
        rows: Array.from({ length: body.rows }, () =>
          Array.from({ length: body.columns }, emptyCell),
        ),
      };
      state.units.splice(state.units.indexOf(o.unit), 1, left, table, right);
      from = index;
    } else {
      const location = body.tableCellLocation ||
        body.tableRange?.tableCellLocation || {
          tableStartLocation: body.tableStartLocation,
        };
      const { unit, block } = tableAt(location.tableStartLocation.index);
      from = block.endIndex;
      const insideTable = Object.values(state.named).some((g) =>
        g.namedRanges.some((nr) =>
          nr.ranges.some(
            (r) =>
              r.startIndex >= block.startIndex && r.startIndex < block.endIndex,
          ),
        ),
      );
      if (insideTable && kind !== "updateTableColumnProperties") {
        throw new Error(
          "ieltsColumnsDoc: reshaping a table holding a named range",
        );
      }
      const { rowIndex, columnIndex } = location;
      unit.spans ||= [];
      if (kind === "insertTableColumn") {
        const at = columnIndex + (body.insertRight ? 1 : 0);
        for (const row of unit.rows) row.splice(at, 0, emptyCell());
        if (unit.widths) unit.widths.splice(at, 0, unit.widths[columnIndex]);
        // As Docs does: the new cell beside a cell merged down is merged too.
        const beside = unit.spans.filter((s) => s[1] === columnIndex);
        for (const s of unit.spans) if (s[1] >= at) s[1] += 1;
        if (body.insertRight) {
          for (const [r, , span] of beside) unit.spans.push([r, at, span]);
        }
      } else if (kind === "unmergeTableCells") {
        unit.spans = unit.spans.filter((s) => s[1] !== columnIndex);
      } else if (kind === "insertTableRow") {
        const at = rowIndex + (body.insertBelow ? 1 : 0);
        unit.rows.splice(at, 0, unit.rows[0].map(emptyCell));
        for (const s of unit.spans) if (s[0] >= at) s[0] += 1;
      } else if (kind === "deleteTableRow") {
        unit.rows.splice(rowIndex, 1);
      } else if (kind === "deleteTableColumn") {
        for (const row of unit.rows) row.splice(columnIndex, 1);
        if (unit.widths) unit.widths.splice(columnIndex, 1);
      } else if (kind === "updateTableColumnProperties") {
        unit.widths ||= unit.rows[0].map(() => null);
        for (const k of body.columnIndices) {
          unit.widths[k] = body.tableColumnProperties.width.magnitude;
        }
      }
    }
    refresh();
    shiftRanges(from, totalLength() - before);
  };
  const STRUCTURAL = [
    "insertTable",
    "insertTableColumn",
    "insertTableRow",
    "deleteTableRow",
    "deleteTableColumn",
    "updateTableColumnProperties",
    "unmergeTableCells",
  ];

  /**
   * Deletes [startIndex, endIndex) across top-level blocks: blocks wholly
   * inside go, a paragraph cut at either end keeps the rest (Docs merges
   * what is left of the two). A table may only go whole.
   */
  const deleteBlocks = (startIndex, endIndex) => {
    const len = endIndex - startIndex;
    const keep = [];
    let head = null;
    let tail = null;
    for (const unit of state.units) {
      if (unit.end <= startIndex || unit.start >= endIndex) {
        keep.push(unit);
        continue;
      }
      const whole = unit.start >= startIndex && unit.end <= endIndex;
      if (whole) {
        if (!head) keep.push((head = { marker: true }));
        continue;
      }
      if (unit.kind !== "p") {
        throw new Error("ieltsColumnsDoc: a delete cutting into a table");
      }
      const from = Math.max(startIndex, unit.start) - unit.start;
      const to = Math.min(endIndex, unit.end) - unit.start;
      const rest = unit.text.slice(0, from) + unit.text.slice(to);
      if (unit.start < startIndex) {
        head = { kind: "p", text: rest };
        keep.push(head);
      } else {
        tail = { kind: "p", text: rest };
        keep.push(tail);
      }
    }
    state.units = keep.filter((u) => !u.marker);
    if (head && tail && !head.marker) {
      head.text = head.text.replace(/\n$/, "") + tail.text;
      state.units.splice(state.units.indexOf(tail), 1);
    }
    for (const group of Object.values(state.named)) {
      for (const nr of group.namedRanges) {
        for (const r of nr.ranges) {
          if (r.startIndex >= endIndex) {
            r.startIndex -= len;
            r.endIndex -= len;
          }
        }
      }
    }
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
        const inOne = state.offsets.some(
          (x) =>
            startIndex >= x.start && endIndex <= x.start + x.unit.text.length,
        );
        if (!inOne) {
          deleteBlocks(startIndex, endIndex);
          refresh();
          continue;
        }
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
        const { startIndex, endIndex } = body.range;
        const o = unitAt(state, startIndex, endIndex);
        for (const [style, key] of [
          ["bold", "boldAt"],
          ["italic", "italicAt"],
        ]) {
          if (!(style in body.textStyle)) continue;
          const set = new Set(o.unit[key] || []);
          for (let i = startIndex; i < endIndex; i++) {
            if (body.textStyle[style]) set.add(i - o.start);
            else set.delete(i - o.start);
          }
          o.unit[key] = [...set];
        }
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
      } else if (STRUCTURAL.includes(kind)) {
        structural(kind, body);
      } else if (
        kind === "updateParagraphStyle" ||
        kind === "deleteParagraphBullets"
      ) {
        // Paragraph looks are not modelled; the range must still exist.
        unitAt(state, body.range.startIndex, body.range.endIndex);
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
    /** The tab as text: "¶ line" per paragraph, "[a | b]" per table row. */
    outline: () =>
      state.units.flatMap((u) =>
        u.kind === "p"
          ? u.text
              .replace(/\n$/, "")
              .split("\n")
              .map((line) => `¶ ${line}`)
          : u.kind === "img"
            ? ["¶ [image]"]
            : u.rows.map(
                (row) =>
                  `[${row.map((c) => c.text.replace(/\n$/, "").replace(/\n/g, "⏎")).join(" | ")}]`,
              ),
      ),
    /** Column widths of table `t` (null when not fixed). */
    widths: (t) => state.units.filter((u) => u.kind === "table")[t].widths,
    /** Bold characters of the top-level paragraphs, as the text they spell. */
    boldParagraphs: () =>
      state.units
        .filter((u) => u.kind === "p")
        .map((u) =>
          [...(u.boldAt || [])]
            .sort((a, b) => a - b)
            .map((k) => u.text[k])
            .join(""),
        )
        .join(""),
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
    /** Italic characters of a cell, as the text they spell. */
    italicOf: (t, r, c) => {
      const cell = state.units.filter((u) => u.kind === "table")[t].rows[r][c];
      return [...(cell.italicAt || [])]
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
