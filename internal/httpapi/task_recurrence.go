package httpapi

import (
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/carnager/noterious/internal/index"
)

var repeatIntervalPattern = regexp.MustCompile(`^(\d+)\s*([dwmy])$`)

const (
	taskDueLayout    = "2006-01-02"
	taskRemindLayout = "2006-01-02 15:04"
)

// parseRepeatInterval understands the repeat field values: the words daily,
// weekly, monthly, yearly/annually, or compact offsets like 2d, 3w, 6m, 1y.
func parseRepeatInterval(raw string) (years int, months int, days int, ok bool) {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case "daily":
		return 0, 0, 1, true
	case "weekly":
		return 0, 0, 7, true
	case "monthly":
		return 0, 1, 0, true
	case "yearly", "annually":
		return 1, 0, 0, true
	}
	match := repeatIntervalPattern.FindStringSubmatch(value)
	if match == nil {
		return 0, 0, 0, false
	}
	amount, err := strconv.Atoi(match[1])
	if err != nil || amount <= 0 {
		return 0, 0, 0, false
	}
	switch match[2] {
	case "d":
		return 0, 0, amount, true
	case "w":
		return 0, 0, 7 * amount, true
	case "m":
		return 0, amount, 0, true
	case "y":
		return amount, 0, 0, true
	}
	return 0, 0, 0, false
}

// nextRecurrence computes the next due/remind values for a repeating task
// being completed. Dates advance by the interval, catching up past `now` for
// overdue tasks. A nil pointer in the result means "leave the field as is".
func nextRecurrence(task index.Task, now time.Time) (*string, *string, bool) {
	if task.Repeat == nil {
		return nil, nil, false
	}
	years, months, days, ok := parseRepeatInterval(*task.Repeat)
	if !ok {
		return nil, nil, false
	}

	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	advance := func(from time.Time, until time.Time) time.Time {
		next := from.AddDate(years, months, days)
		for !next.After(until) {
			next = next.AddDate(years, months, days)
		}
		return next
	}

	var nextDue *string
	var nextRemind *string

	if task.Due != nil {
		if due, err := time.ParseInLocation(taskDueLayout, strings.TrimSpace(*task.Due), now.Location()); err == nil {
			formatted := advance(due, today).Format(taskDueLayout)
			nextDue = &formatted
		}
	}
	if task.Remind != nil {
		if remind, err := time.ParseInLocation(taskRemindLayout, strings.TrimSpace(*task.Remind), now.Location()); err == nil {
			formatted := advance(remind, now).Format(taskRemindLayout)
			nextRemind = &formatted
		}
	}
	if nextDue == nil && nextRemind == nil {
		formatted := advance(today, today).Format(taskDueLayout)
		nextDue = &formatted
	}
	return nextDue, nextRemind, true
}
