#!/bin/bash

set -e

echo "Building UI"
npm run build:ui >/dev/null 2>&1
npm run typecheck >/dev/null 2>&1
npm run build:ui:app >/dev/null 2>&1
npm run build:ui:editor >/dev/null 2>&1

echo "Building Backend"
go build -o noterious ./cmd/noterious >/dev/null 2>&1

echo "Stopping Remote Instance"
ssh proteus killall noterious >/dev/null 2>&1 || true
sleep 2

echo "Uplading Binary"
scp noterious proteus:~/ >/dev/null 2>&1
