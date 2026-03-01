"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnOrderState,
  type ColumnSizingState,
  type Row,
  type RowData,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { useWorldViewStore } from "../../../store";
import { featureFlags } from "../../../config/featureFlags";
import InlineFilter from "../controls/InlineFilter";
import Sparkline from "../charts/Sparkline";
import { scaleValue } from "../../../lib/dashboard/format";

type RowActionHandler<TData> = (row: TData) => void;

interface DataTableProps<TData extends RowData> {
  tableId: string;
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  getRowId?: (originalRow: TData, index: number) => string;
  bodyHeight?: number | string;
  stickyFirstColumn?: boolean;
  searchPlaceholder?: string;
  searchHelpText?: string;
  enableColumnFilters?: boolean;
  onRowClick?: RowActionHandler<TData>;
  /** When set, onRowClick is only fired when this column index (e.g. 0 for first column) is clicked. */
  rowActionColumnIndex?: number;
  onRowPin?: RowActionHandler<TData>;
  onRowOpenDetail?: RowActionHandler<TData>;
  emptyMessage?: string;
}

interface ColumnMetaLike<TData> {
  numeric?: boolean;
  align?: "left" | "right";
  heatAccessor?: (row: TData) => number;
  heatRange?: [number, number];
  deltaAccessor?: (row: TData) => number;
  sparkAccessor?: (row: TData) => number[];
}

function SortableHeaderCell({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="wv-col-drag-wrap">
      {children}
    </div>
  );
}

function dataCellStyle<TData>(meta: ColumnMetaLike<TData> | undefined, row: TData): React.CSSProperties {
  if (!meta?.heatAccessor || !meta?.heatRange) return {};
  const value = meta.heatAccessor(row);
  const strength = scaleValue(value, meta.heatRange[0], meta.heatRange[1]);
  return {
    background: `rgba(109, 156, 186, ${Math.min(0.38, strength * 0.42)})`,
  };
}

function deltaLabel(delta: number | undefined): string | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  if (delta > 0) return `UP ${delta.toFixed(1)}`;
  if (delta < 0) return `DN ${Math.abs(delta).toFixed(1)}`;
  return `EQ ${delta.toFixed(1)}`;
}

export default function DataTable<TData extends RowData>({
  tableId,
  data,
  columns,
  getRowId,
  bodyHeight = "100%",
  stickyFirstColumn = false,
  searchPlaceholder = "Search rows",
  searchHelpText,
  enableColumnFilters = true,
  onRowClick,
  rowActionColumnIndex,
  onRowPin,
  onRowOpenDetail,
  emptyMessage = "No rows",
}: DataTableProps<TData>) {
  const tablePrefs = useWorldViewStore((s) => s.dashboard.tablePrefs[tableId]);
  const setTablePreference = useWorldViewStore((s) => s.setTablePreference);

  const defaultOrder = useMemo(
    () =>
      columns.map((column, index) =>
        column.id ?? String((column as { accessorKey?: string }).accessorKey ?? index)
      ),
    [columns]
  );

  const [sorting, setSorting] = useState<SortingState>(tablePrefs?.sorting ?? []);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(tablePrefs?.filters ?? []);
  const [globalFilter, setGlobalFilter] = useState<string>(tablePrefs?.globalFilter ?? "");
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(
    tablePrefs?.columnOrder?.length ? tablePrefs.columnOrder : defaultOrder
  );
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(tablePrefs?.columnSizing ?? {});

  useEffect(() => {
    if (!tablePrefs?.columnOrder?.length) {
      setColumnOrder(defaultOrder);
    }
  }, [defaultOrder, tablePrefs?.columnOrder?.length]);

  useEffect(() => {
    setTablePreference(tableId, {
      sorting,
      filters: columnFilters,
      globalFilter,
      columnOrder,
      columnSizing,
    });
  }, [tableId, sorting, columnFilters, globalFilter, columnOrder, columnSizing, setTablePreference]);

  const globalFilterFn = (row: Row<TData>, _columnId: string, filterValue: unknown) => {
    const query = String(filterValue ?? "").trim().toLowerCase();
    if (!query) return true;

    return row.getAllCells().some((cell) => {
      const value = cell.getValue();
      if (value == null) return false;
      const text =
        typeof value === "string"
          ? value
          : typeof value === "number"
            ? value.toString()
            : Array.isArray(value)
              ? value.join(" ")
              : "";
      return text.toLowerCase().includes(query);
    });
  };

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnOrder,
      columnSizing,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    globalFilterFn,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const rowHeight = 22;

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setColumnOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const focusCell = (rowIndex: number, colIndex: number) => {
    const root = bodyRef.current;
    if (!root) return;
    const next = root.querySelector<HTMLElement>(
      `[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`
    );
    next?.focus();
  };

  const visibleColumns = table.getVisibleLeafColumns();

  return (
    <div className="wv-data-table" role="table" aria-label={tableId}>
      <div className="wv-data-search-row">
        <div className="wv-data-search-main">
          <InlineFilter
            value={globalFilter}
            placeholder={searchPlaceholder}
            onChange={setGlobalFilter}
          />
          {globalFilter ? (
            <button
              type="button"
              className="wv-data-search-clear"
              onClick={() => setGlobalFilter("")}
              title="Clear table search"
            >
              CLEAR
            </button>
          ) : null}
        </div>
        {searchHelpText ? <div className="wv-data-search-help">{searchHelpText}</div> : null}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={visibleColumns.map((column) => column.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="wv-data-head" role="rowgroup">
            <div className="wv-data-row wv-data-row-head" role="row">
              {table.getHeaderGroups().map((headerGroup) =>
                headerGroup.headers.map((header, index) => {
                  const canSort = header.column.getCanSort();
                  const sort = header.column.getIsSorted();
                  const colWidth = header.getSize();
                  const first = stickyFirstColumn && index === 0;

                  return (
                    <SortableHeaderCell key={header.id} id={header.id}>
                      <div
                        className={`wv-data-cell wv-data-head-cell ${first ? "is-sticky-col" : ""}`}
                        style={{ width: colWidth, minWidth: colWidth, maxWidth: colWidth }}
                        role="columnheader"
                      >
                        <button
                          type="button"
                          className="wv-data-head-label"
                          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                          title={String(header.column.columnDef.header ?? "")}
                        >
                          <span className="wv-data-head-text">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          {sort ? (
                            <span className="wv-data-head-sort">{sort === "desc" ? "v" : "^"}</span>
                          ) : null}
                        </button>

                        {enableColumnFilters && header.column.getCanFilter() ? (
                          <InlineFilter
                            value={String(header.column.getFilterValue() ?? "")}
                            placeholder="Filter"
                            onChange={(value) => header.column.setFilterValue(value)}
                          />
                        ) : null}

                        {header.column.getCanResize() ? (
                          <span
                            className="wv-col-resizer"
                            onDoubleClick={() => header.column.resetSize()}
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                          />
                        ) : null}
                      </div>
                    </SortableHeaderCell>
                  );
                })
              )}
            </div>
          </div>
        </SortableContext>
      </DndContext>

      <div
        className="wv-data-body"
        ref={bodyRef}
        style={{ height: bodyHeight }}
        role="rowgroup"
      >
        {!rows.length ? (
          <div className="wv-table-empty">{emptyMessage}</div>
        ) : (
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];

            return (
              <div
                key={row.id}
                className="wv-data-row"
                role="row"
                style={{
                  position: "absolute",
                  top: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  width: "100%",
                  height: rowHeight,
                }}
                onClick={
                  rowActionColumnIndex === undefined ? () => onRowClick?.(row.original) : undefined
                }
              >
                {row.getVisibleCells().map((cell, colIndex) => {
                  const meta = cell.column.columnDef.meta as ColumnMetaLike<TData> | undefined;
                  const numeric = meta?.numeric || meta?.align === "right";
                  const sparkValues = meta?.sparkAccessor?.(row.original);
                  const delta = meta?.deltaAccessor?.(row.original);
                  const colWidth = cell.column.getSize();
                  const first = stickyFirstColumn && colIndex === 0;
                  const showDelta = delta != null && colWidth >= 148;
                  const showSpark = Boolean(sparkValues?.length) && colWidth >= 176;
                  const sparkWidth = Math.max(30, Math.min(58, colWidth - 62));
                  const isActionColumn =
                    onRowClick != null && rowActionColumnIndex === colIndex;

                  return (
                    <div
                      key={cell.id}
                      className={`wv-data-cell ${numeric ? "is-numeric" : ""} ${first ? "is-sticky-col" : ""} ${isActionColumn ? "wv-data-cell-action" : ""}`}
                      role="cell"
                      title={typeof cell.getValue() === "string" ? String(cell.getValue()) : undefined}
                      style={{
                        width: colWidth,
                        minWidth: colWidth,
                        maxWidth: colWidth,
                        ...dataCellStyle(meta, row.original),
                      }}
                      tabIndex={0}
                      data-row-index={virtualRow.index}
                      data-col-index={colIndex}
                      onClick={
                        isActionColumn
                          ? (e) => {
                              e.stopPropagation();
                              onRowClick(row.original);
                            }
                          : undefined
                      }
                      onKeyDown={(event) => {
                        if (!featureFlags.enableTableArrowNav) return;
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          focusCell(Math.min(rows.length - 1, virtualRow.index + 1), colIndex);
                        } else if (event.key === "ArrowUp") {
                          event.preventDefault();
                          focusCell(Math.max(0, virtualRow.index - 1), colIndex);
                        } else if (event.key === "ArrowRight") {
                          event.preventDefault();
                          focusCell(
                            virtualRow.index,
                            Math.min(visibleColumns.length - 1, colIndex + 1)
                          );
                        } else if (event.key === "ArrowLeft") {
                          event.preventDefault();
                          focusCell(virtualRow.index, Math.max(0, colIndex - 1));
                        }
                      }}
                    >
                      <span className="wv-data-text">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </span>
                      {showDelta ? <span className="wv-data-delta">{deltaLabel(delta)}</span> : null}
                      {showSpark ? <Sparkline values={sparkValues ?? []} width={sparkWidth} height={14} /> : null}
                    </div>
                  );
                })}

                {(onRowPin || onRowOpenDetail) ? (
                  <div className="wv-row-actions">
                    {onRowPin ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRowPin(row.original);
                        }}
                      >
                        PIN
                      </button>
                    ) : null}
                    {onRowOpenDetail ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRowOpenDetail(row.original);
                        }}
                      >
                        DETAIL
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          </div>
        )}
      </div>
    </div>
  );
}
