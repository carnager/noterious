import { describe, expect, it } from "vitest";

import { mergeText, TextMergeConflictError } from "./textMerge";

describe("mergeText", function () {
  it("combines disjoint line edits", function () {
    const base = "# Note\nalpha\nbeta\n";
    const local = "# Note\nalpha changed\nbeta\n";
    const remote = "# Note\nalpha\nbeta changed\n";

    expect(mergeText(base, local, remote)).toBe("# Note\nalpha changed\nbeta changed\n");
  });

  it("rejects overlapping line edits", function () {
    const base = "# Note\nalpha\nbeta\n";
    const local = "# Note\nalpha from local\nbeta\n";
    const remote = "# Note\nalpha from remote\nbeta\n";

    expect(function () {
      mergeText(base, local, remote);
    }).toThrow(TextMergeConflictError);
  });

  it("keeps insertions around unrelated changes", function () {
    const base = "# Note\nalpha\nbeta\n";
    const local = "# Note\nalpha\nlocal insert\nbeta\n";
    const remote = "# Note\nalpha changed\nbeta\n";

    expect(mergeText(base, local, remote)).toBe("# Note\nalpha changed\nlocal insert\nbeta\n");
  });
});
