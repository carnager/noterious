// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  defaultTaskPickerState,
  isValidTaskRepeatValue,
  renderTaskPicker,
  type InlineEditorElements,
  type TaskPickerState,
} from "./inlineEditors";
import type { TaskRecord } from "./types";

function pickerElements(): InlineEditorElements {
  return {
    inlineTaskPicker: document.createElement("div"),
  } as unknown as InlineEditorElements;
}

function task(overrides?: Partial<TaskRecord>): TaskRecord {
  return {
    ref: "notes/today:5",
    page: "notes/today",
    line: 5,
    text: "Water plants",
    state: "todo",
    done: false,
    ...overrides,
  };
}

function duePickerState(): TaskPickerState {
  const state = defaultTaskPickerState();
  state.mode = "due";
  state.ref = "notes/today:5";
  state.year = 2026;
  state.month = 6;
  state.day = 12;
  return state;
}

interface RenderedPicker {
  picker: HTMLDivElement;
  saveTaskDateField: ReturnType<typeof vi.fn>;
  setNoteStatus: ReturnType<typeof vi.fn>;
}

function renderDuePicker(currentTask: TaskRecord): RenderedPicker {
  const els = pickerElements();
  const saveTaskDateField = vi.fn(function () {
    return Promise.resolve();
  });
  const setNoteStatus = vi.fn();
  renderTaskPicker(duePickerState(), els, {
    currentPickerTask: function () {
      return currentTask;
    },
    saveTaskDateField: saveTaskDateField as unknown as (task: TaskRecord, field: "due" | "remind" | "repeat", value: string) => Promise<void>,
    closeTaskPickers: function () {},
    setNoteStatus,
    errorMessage: function (error) {
      return String(error);
    },
  });
  return {
    picker: (els as unknown as { inlineTaskPicker: HTMLDivElement }).inlineTaskPicker,
    saveTaskDateField,
    setNoteStatus,
  };
}

describe("isValidTaskRepeatValue", function () {
  it("accepts the preset words and interval shorthand", function () {
    expect(isValidTaskRepeatValue("daily")).toBe(true);
    expect(isValidTaskRepeatValue("Weekly")).toBe(true);
    expect(isValidTaskRepeatValue("2w")).toBe(true);
    expect(isValidTaskRepeatValue("10 d")).toBe(true);
    expect(isValidTaskRepeatValue("1y")).toBe(true);
  });

  it("rejects everything else", function () {
    expect(isValidTaskRepeatValue("")).toBe(false);
    expect(isValidTaskRepeatValue("fortnightly")).toBe(false);
    expect(isValidTaskRepeatValue("w2")).toBe(false);
    expect(isValidTaskRepeatValue("2x")).toBe(false);
  });
});

describe("task picker repeat row", function () {
  it("renders a repeat select defaulting to no repeat", function () {
    const rendered = renderDuePicker(task());
    const select = rendered.picker.querySelector(".task-picker-repeat select") as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    expect(select?.value).toBe("");
    expect(rendered.picker.querySelector(".task-picker-repeat-custom")?.classList.contains("hidden")).toBe(true);
  });

  it("applies a preset interval on selection", function () {
    const rendered = renderDuePicker(task());
    const select = rendered.picker.querySelector(".task-picker-repeat select") as HTMLSelectElement;
    select.value = "weekly";
    select.dispatchEvent(new window.Event("change", {bubbles: true}));

    expect(rendered.saveTaskDateField).toHaveBeenCalledTimes(1);
    expect(rendered.saveTaskDateField.mock.calls[0][1]).toBe("repeat");
    expect(rendered.saveTaskDateField.mock.calls[0][2]).toBe("weekly");
  });

  it("shows a custom interval with its current value and a recurrence note", function () {
    const rendered = renderDuePicker(task({repeat: "2w"}));
    const select = rendered.picker.querySelector(".task-picker-repeat select") as HTMLSelectElement;
    const custom = rendered.picker.querySelector(".task-picker-repeat-custom") as HTMLInputElement;

    expect(select.value).toBe("custom");
    expect(custom.classList.contains("hidden")).toBe(false);
    expect(custom.value).toBe("2w");
    expect(rendered.picker.textContent).toContain("rolls its dates forward");
  });

  it("commits a valid custom interval and rejects invalid ones", function () {
    const rendered = renderDuePicker(task({repeat: "2w"}));
    const custom = rendered.picker.querySelector(".task-picker-repeat-custom") as HTMLInputElement;
    const apply = rendered.picker.querySelector(".task-picker-repeat-apply") as HTMLButtonElement;

    custom.value = "fortnightly";
    apply.click();
    expect(rendered.saveTaskDateField).not.toHaveBeenCalled();
    expect(rendered.setNoteStatus).toHaveBeenCalledTimes(1);

    custom.value = "3 d";
    apply.click();
    expect(rendered.saveTaskDateField).toHaveBeenCalledTimes(1);
    expect(rendered.saveTaskDateField.mock.calls[0][1]).toBe("repeat");
    expect(rendered.saveTaskDateField.mock.calls[0][2]).toBe("3d");
  });

  it("clears the repeat when selecting no repeat", function () {
    const rendered = renderDuePicker(task({repeat: "weekly"}));
    const select = rendered.picker.querySelector(".task-picker-repeat select") as HTMLSelectElement;
    expect(select.value).toBe("weekly");

    select.value = "";
    select.dispatchEvent(new window.Event("change", {bubbles: true}));
    expect(rendered.saveTaskDateField).toHaveBeenCalledTimes(1);
    expect(rendered.saveTaskDateField.mock.calls[0][2]).toBe("");
  });
});
