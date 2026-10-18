import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState } from "react";

import { useLanguage } from "../i18n/LanguageContext.jsx";

// Vietnamese order, accents ignored, digits by value ("BUỔI 4" < "BUỔI 10").
const collator = new Intl.Collator("vi", {
  numeric: true,
  sensitivity: "base",
});

function compareValues(rowA, rowB, columnId) {
  const a = rowA.getValue(columnId);
  const b = rowB.getValue(columnId);
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

// A column's accessor returns `undefined` for "no value": those rows go last
// in both directions instead of bunching at the top of a descending sort.
// Every column sorts ascending on the first click (TanStack would start
// number columns descending).
const DEFAULT_COLUMN = {
  sortingFn: compareValues,
  sortUndefined: "last",
  sortDescFirst: false,
};

const SORT_ICON = {
  asc: "ti-chevron-up",
  desc: "ti-chevron-down",
  false: "ti-selector",
};

/**
 * The app's one table: a TanStack Table styled as `.cache-table`.
 *
 * Columns are TanStack column defs. A column sorts when it has an accessor
 * (display-only columns like actions don't). `meta.className` goes on its
 * cells, `meta.headerClassName` on its header, `meta.label` names it in the
 * column picker when its header is not a string, and `meta.cellProps(row)`
 * returns extra props for its cells (a `title` for clipped text, ...).
 *
 * Pass `enableSorting={false}` for server-paginated lists, where sorting one
 * page would look like sorting all of them.
 */
export default function DataTable({
  data,
  columns,
  getRowId,
  enableSorting = true,
  columnVisibility,
  onColumnVisibilityChange,
  rowClassName,
  initialSorting = [],
}) {
  const { t } = useLanguage();
  const [sorting, setSorting] = useState(initialSorting);

  const table = useReactTable({
    data,
    columns,
    getRowId,
    defaultColumn: DEFAULT_COLUMN,
    enableSorting,
    state: {
      sorting,
      ...(columnVisibility ? { columnVisibility } : {}),
    },
    onSortingChange: setSorting,
    ...(onColumnVisibilityChange ? { onColumnVisibilityChange } : {}),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="cache-table-wrap">
      <table className="cache-table data-table">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const { column } = header;
                const meta = column.columnDef.meta || {};
                const content = header.isPlaceholder
                  ? null
                  : flexRender(column.columnDef.header, header.getContext());
                if (!column.getCanSort()) {
                  return (
                    <th key={header.id} className={meta.headerClassName}>
                      {content}
                    </th>
                  );
                }
                const dir = column.getIsSorted();
                const label =
                  meta.label ||
                  (typeof column.columnDef.header === "string"
                    ? column.columnDef.header
                    : column.id);
                return (
                  <th
                    key={header.id}
                    className={[meta.headerClassName, dir ? "is-sorted" : ""]
                      .filter(Boolean)
                      .join(" ")}
                    aria-sort={
                      dir === "asc"
                        ? "ascending"
                        : dir === "desc"
                          ? "descending"
                          : "none"
                    }
                  >
                    <button
                      type="button"
                      className="th-sort"
                      onClick={column.getToggleSortingHandler()}
                      title={t("common.sortBy", { col: label })}
                    >
                      <span>{content}</span>
                      <i
                        className={`ti ${SORT_ICON[dir]} th-sort-icon`}
                        aria-hidden="true"
                      />
                    </button>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className={rowClassName?.(row.original)}>
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta || {};
                return (
                  <td
                    key={cell.id}
                    className={meta.className}
                    {...meta.cellProps?.(row.original)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
