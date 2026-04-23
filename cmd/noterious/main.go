package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/carnager/noterious/internal/app"
	"github.com/carnager/noterious/internal/config"
)

func main() {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	application, err := app.New(cfg)
	if err != nil {
		log.Fatalf("init app: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	signals := make(chan os.Signal, 2)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)

	go func() {
		<-signals
		cancel()
		<-signals
		os.Exit(130)
	}()

	if err := application.Run(ctx); err != nil {
		log.Fatalf("run app: %v", err)
	}
}
