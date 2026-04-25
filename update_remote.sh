#!/bin/bash

npm run build:ui
go build -o noterious ./cmd/noterious
ssh proteus killall -9 noterious
sleep 2
scp noterious proteus:~/
