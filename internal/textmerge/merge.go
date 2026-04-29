package textmerge

import "errors"

var ErrConflict = errors.New("automatic merge found overlapping edits")

type edit struct {
	BaseStart int
	BaseEnd   int
	NewLines  []string
}

func Merge(base string, local string, remote string) (string, error) {
	if local == remote {
		return local, nil
	}
	if remote == base {
		return local, nil
	}
	if local == base {
		return remote, nil
	}

	baseLines := splitLines(base)
	localEdits := diffEdits(baseLines, splitLines(local))
	remoteEdits := diffEdits(baseLines, splitLines(remote))

	if len(localEdits) == 0 {
		return remote, nil
	}
	if len(remoteEdits) == 0 {
		return local, nil
	}

	mergedLines, err := mergeEdits(baseLines, localEdits, remoteEdits)
	if err != nil {
		return "", err
	}
	return joinLines(mergedLines), nil
}

func splitLines(text string) []string {
	lines := make([]string, 0, 8)
	start := 0
	for index := 0; index < len(text); index += 1 {
		if text[index] != '\n' {
			continue
		}
		lines = append(lines, text[start:index])
		start = index + 1
	}
	lines = append(lines, text[start:])
	return lines
}

func joinLines(lines []string) string {
	if len(lines) == 0 {
		return ""
	}
	length := 0
	for _, line := range lines {
		length += len(line)
	}
	length += len(lines) - 1
	buffer := make([]byte, 0, length)
	for index, line := range lines {
		if index > 0 {
			buffer = append(buffer, '\n')
		}
		buffer = append(buffer, line...)
	}
	return string(buffer)
}

func diffEdits(base []string, variant []string) []edit {
	n := len(base)
	m := len(variant)
	lcs := make([][]int, n+1)
	for index := range lcs {
		lcs[index] = make([]int, m+1)
	}
	for i := n - 1; i >= 0; i -= 1 {
		for j := m - 1; j >= 0; j -= 1 {
			if base[i] == variant[j] {
				lcs[i][j] = lcs[i+1][j+1] + 1
				continue
			}
			if lcs[i+1][j] >= lcs[i][j+1] {
				lcs[i][j] = lcs[i+1][j]
			} else {
				lcs[i][j] = lcs[i][j+1]
			}
		}
	}

	edits := make([]edit, 0, 8)
	i := 0
	j := 0
	active := false
	start := 0
	replacement := make([]string, 0, 4)
	flush := func(baseEnd int) {
		if !active {
			return
		}
		nextLines := append([]string(nil), replacement...)
		edits = append(edits, edit{
			BaseStart: start,
			BaseEnd:   baseEnd,
			NewLines:  nextLines,
		})
		active = false
		replacement = replacement[:0]
	}

	for i < n || j < m {
		if i < n && j < m && base[i] == variant[j] {
			flush(i)
			i += 1
			j += 1
			continue
		}
		if !active {
			active = true
			start = i
		}
		if j < m && (i == n || lcs[i][j+1] >= lcs[i+1][j]) {
			replacement = append(replacement, variant[j])
			j += 1
			continue
		}
		if i < n {
			i += 1
		}
	}
	flush(i)

	return edits
}

func mergeEdits(base []string, localEdits []edit, remoteEdits []edit) ([]string, error) {
	merged := make([]string, 0, len(base)+8)
	cursor := 0
	localIndex := 0
	remoteIndex := 0

	for cursor < len(base) || localIndex < len(localEdits) || remoteIndex < len(remoteEdits) {
		nextStart := len(base)
		if localIndex < len(localEdits) && localEdits[localIndex].BaseStart < nextStart {
			nextStart = localEdits[localIndex].BaseStart
		}
		if remoteIndex < len(remoteEdits) && remoteEdits[remoteIndex].BaseStart < nextStart {
			nextStart = remoteEdits[remoteIndex].BaseStart
		}

		if cursor < nextStart {
			merged = append(merged, base[cursor:nextStart]...)
			cursor = nextStart
		}

		var localEdit *edit
		if localIndex < len(localEdits) && localEdits[localIndex].BaseStart == cursor {
			localEdit = &localEdits[localIndex]
		}
		var remoteEdit *edit
		if remoteIndex < len(remoteEdits) && remoteEdits[remoteIndex].BaseStart == cursor {
			remoteEdit = &remoteEdits[remoteIndex]
		}

		switch {
		case localEdit == nil && remoteEdit == nil:
			if cursor < len(base) {
				merged = append(merged, base[cursor:]...)
				cursor = len(base)
				continue
			}
			return merged, nil
		case localEdit != nil && remoteEdit != nil:
			if editsEqual(*localEdit, *remoteEdit) {
				merged = append(merged, localEdit.NewLines...)
				cursor = maxInt(cursor, maxInt(localEdit.BaseEnd, remoteEdit.BaseEnd))
				localIndex += 1
				remoteIndex += 1
				continue
			}
			if localEdit.BaseStart == localEdit.BaseEnd && remoteEdit.BaseStart < remoteEdit.BaseEnd {
				merged = append(merged, localEdit.NewLines...)
				merged = append(merged, remoteEdit.NewLines...)
				cursor = remoteEdit.BaseEnd
				localIndex += 1
				remoteIndex += 1
				continue
			}
			if remoteEdit.BaseStart == remoteEdit.BaseEnd && localEdit.BaseStart < localEdit.BaseEnd {
				merged = append(merged, remoteEdit.NewLines...)
				merged = append(merged, localEdit.NewLines...)
				cursor = localEdit.BaseEnd
				localIndex += 1
				remoteIndex += 1
				continue
			}
			return nil, ErrConflict
		case localEdit != nil:
			if remoteIndex < len(remoteEdits) && remoteEdits[remoteIndex].BaseStart < localEdit.BaseEnd {
				return nil, ErrConflict
			}
			merged = append(merged, localEdit.NewLines...)
			cursor = localEdit.BaseEnd
			localIndex += 1
		case remoteEdit != nil:
			if localIndex < len(localEdits) && localEdits[localIndex].BaseStart < remoteEdit.BaseEnd {
				return nil, ErrConflict
			}
			merged = append(merged, remoteEdit.NewLines...)
			cursor = remoteEdit.BaseEnd
			remoteIndex += 1
		}
	}

	return merged, nil
}

func editsEqual(left edit, right edit) bool {
	if left.BaseStart != right.BaseStart || left.BaseEnd != right.BaseEnd || len(left.NewLines) != len(right.NewLines) {
		return false
	}
	for index := range left.NewLines {
		if left.NewLines[index] != right.NewLines[index] {
			return false
		}
	}
	return true
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}
