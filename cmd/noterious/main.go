package main

import (
	"context"
	"flag"
	"log"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/carnager/noterious/internal/app"
	"github.com/carnager/noterious/internal/config"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	listenAddr := flag.String("listen-addr", "", "listen address override, e.g. :9090 or 127.0.0.1:9090")
	port := flag.Int("port", 0, "port override, e.g. 9090")
	flag.Parse()

	cfg, err := config.LoadFromEnv()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}
	cfg, err = config.ApplyCLIOverrides(cfg, *listenAddr, *port)
	if err != nil {
		log.Fatalf("apply cli overrides: %v", err)
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
