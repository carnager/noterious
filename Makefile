.PHONY: ui verify-ui test build

UI_ASSETS = internal/httpapi/static/app.js internal/httpapi/static/editor.bundle.js

ui:
	npm run build:ui

verify-ui: ui
	git diff --exit-code -- $(UI_ASSETS)

test: verify-ui
	npm test
	go test ./...

build: verify-ui
	go build -o noterious ./cmd/noterious
