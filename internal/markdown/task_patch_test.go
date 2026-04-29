package markdown

import "testing"

func TestApplyTaskPatchUpdatesKnownFields(t *testing.T) {
	t.Parallel()

	state := "done"
	due := "2026-05-02"
	remind := ""
	who := []string{"Ralf", "Mina"}

	raw := "# Title\n\n- [ ] Follow up due:: 2026-05-01 remind:: 2026-04-30 who:: [\"Old\"] click:: myapp://follow-up\n"

	updated, task, err := ApplyTaskPatch(raw, 3, TaskPatch{
		State:  &state,
		Due:    &due,
		Remind: &remind,
		Who:    &who,
	})
	if err != nil {
		t.Fatalf("ApplyTaskPatch() error = %v", err)
	}

	expected := "# Title\n\n- [x] Follow up [due: 2026-05-02] who:: [\"Ralf\", \"Mina\"] click:: myapp://follow-up\n"
	if updated != expected {
		t.Fatalf("updated markdown = %q, want %q", updated, expected)
	}
	if !task.Done || task.Text != "Follow up [due: 2026-05-02] who:: [\"Ralf\", \"Mina\"] click:: myapp://follow-up" {
		t.Fatalf("updated task = %#v", task)
	}
}

func TestApplyTaskPatchSetsAndClearsClickField(t *testing.T) {
	t.Parallel()

	click := "noteriousshopping://shopping?list=weekly"
	raw := "# Title\n\n- [ ] Follow up\n"

	updated, task, err := ApplyTaskPatch(raw, 3, TaskPatch{Click: &click})
	if err != nil {
		t.Fatalf("ApplyTaskPatch(set click) error = %v", err)
	}

	expected := "# Title\n\n- [ ] Follow up click:: noteriousshopping://shopping?list=weekly\n"
	if updated != expected {
		t.Fatalf("updated markdown = %q, want %q", updated, expected)
	}
	if task.Text != "Follow up click:: noteriousshopping://shopping?list=weekly" {
		t.Fatalf("updated task = %#v", task)
	}

	clear := ""
	cleared, clearedTask, err := ApplyTaskPatch(updated, 3, TaskPatch{Click: &clear})
	if err != nil {
		t.Fatalf("ApplyTaskPatch(clear click) error = %v", err)
	}
	if cleared != raw {
		t.Fatalf("cleared markdown = %q, want %q", cleared, raw)
	}
	if clearedTask.Text != "Follow up" {
		t.Fatalf("cleared task = %#v", clearedTask)
	}
}

func TestApplyTaskPatchNormalizesLegacyBracketFields(t *testing.T) {
	t.Parallel()

	state := "todo"
	due := ""
	remind := ""
	who := []string{}

	raw := "# Title\n\n- [x] Legacy task [remind: \"2026-04-19 12:10\"] #remind [completed: \"2026-04-19T12:19:47\"]\n"

	updated, task, err := ApplyTaskPatch(raw, 3, TaskPatch{
		State:  &state,
		Due:    &due,
		Remind: &remind,
		Who:    &who,
	})
	if err != nil {
		t.Fatalf("ApplyTaskPatch() error = %v", err)
	}

	expected := "# Title\n\n- [ ] Legacy task\n"
	if updated != expected {
		t.Fatalf("updated markdown = %q, want %q", updated, expected)
	}
	if task.Done || task.Text != "Legacy task" {
		t.Fatalf("updated task = %#v", task)
	}
}
