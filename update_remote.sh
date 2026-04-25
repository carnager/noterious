#!/bin/bash

npm run build:ui
go build -o noterious ./cmd/noterious
ssh proteus killall noterious
sleep 2
scp noterious proteus:~/
