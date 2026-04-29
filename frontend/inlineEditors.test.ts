import { describe, expect, it } from "vitest";

import {
  canDeleteInlineTableEditorColumn,
  canDeleteInlineTableEditorRow,
  deleteInlineTableEditorColumn,
  deleteInlineTableEditorRow,
  type TableEditorState,
} from "./inlineEditors";

function tableEditorState(rows: string[][], row: number, col: number): TableEditorState {
  return {
    startLine: 1,
    row,
    col,
    rows: rows.map(function (currentRow) {
      return currentRow.slice();
    }),
    dirty: false,
    left: 0,
    top: 0,
    width: 0,
    bodyFontFamily: "",
    bodyFontSize: "",
    bodyLineHeight: "",
    bodyLetterSpacing: "",
    bodyColor: "",
    bodyFontWeight: "",
    headerColor: "",
    headerFontWeight: "",
  };
}

describe("inline table editor helpers", function () {
  it("only allows deleting body rows when more than one exists", function () {
    const withSingleBodyRow = tableEditorState([
      ["Name", "Value"],
      ["Alpha", "1"],
    ], 1, 0);
    const withTwoBodyRows = tableEditorState([
      ["Name", "Value"],
      ["Alpha", "1"],
      ["Beta", "2"],
    ], 2, 0);

    expect(canDeleteInlineTableEditorRow(withSingleBodyRow)).toBe(false);
    expect(canDeleteInlineTableEditorRow(tableEditorState(withTwoBodyRows.rows, 0, 0))).toBe(false);
    expect(canDeleteInlineTableEditorRow(withTwoBodyRows)).toBe(true);
  });

  it("deletes the current body row and keeps focus on a valid body row", function () {
    const state = tableEditorState([
      ["Name", "Value"],
      ["Alpha", "1"],
      ["Beta", "2"],
    ], 2, 1);

    expect(deleteInlineTableEditorRow(state)).toBe(true);
    expect(state.rows).toEqual([
      ["Name", "Value"],
      ["Alpha", "1"],
    ]);
    expect(state.row).toBe(1);
    expect(state.col).toBe(1);
    expect(state.dirty).toBe(true);
  });

  it("only allows deleting columns when more than two exist", function () {
    const twoCols = tableEditorState([
      ["One", "Two"],
      ["A", "B"],
    ], 1, 1);
    const threeCols = tableEditorState([
      ["One", "Two", "Three"],
      ["A", "B", "C"],
    ], 1, 2);

    expect(canDeleteInlineTableEditorColumn(twoCols)).toBe(false);
    expect(canDeleteInlineTableEditorColumn(threeCols)).toBe(true);
  });

  it("deletes the current column and clamps focus to the surviving cells", function () {
    const state = tableEditorState([
      ["One", "Two", "Three"],
      ["A", "B", "C"],
      ["D", "E", "F"],
    ], 2, 2);

    expect(deleteInlineTableEditorColumn(state)).toBe(true);
    expect(state.rows).toEqual([
      ["One", "Two"],
      ["A", "B"],
      ["D", "E"],
    ]);
    expect(state.col).toBe(1);
    expect(state.row).toBe(2);
    expect(state.dirty).toBe(true);
  });
});
