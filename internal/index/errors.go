package index

import "errors"

var ErrPageNotFound = errors.New("page not found")
var ErrTaskNotFound = errors.New("task not found")
var ErrSavedQueryNotFound = errors.New("saved query not found")
