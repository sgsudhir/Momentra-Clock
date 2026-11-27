package main

import (
	"context"
	"embed"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"sync"
	"syscall"
	"time"
)

//go:embed site
var assets embed.FS

func handler(files fs.FS, address string, stop func()) http.Handler {
	static := http.FileServer(http.FS(files))
	var otaLock sync.Mutex
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != address {
			http.Error(w, "Invalid host", http.StatusForbidden)
			return
		}
		if r.URL.Path == "/local/status" || r.URL.Path == "/local/ota" || r.URL.Path == "/local/stop" {
			if r.Header.Get("Origin") != "http://"+address || r.Header.Get("X-Momentra-Request") != "1" {
				http.Error(w, "Invalid request origin", http.StatusForbidden)
				return
			}
			switch r.URL.Path {
			case "/local/status":
				if r.Method != http.MethodPost {
					http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
					return
				}
				proxyClock(w, r, "/api/status")
			case "/local/ota":
				if r.Method != http.MethodPost {
					http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
					return
				}
				if !otaLock.TryLock() {
					http.Error(w, "An OTA update is already in progress", http.StatusConflict)
					return
				}
				defer otaLock.Unlock()
				proxyClock(w, r, "/api/ota")
			case "/local/stop":
				if r.Method != http.MethodPost {
					http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
					return
				}
				if !otaLock.TryLock() {
					http.Error(w, "Cannot stop while an OTA update is in progress", http.StatusConflict)
					return
				}
				defer otaLock.Unlock()
				w.WriteHeader(http.StatusOK)
				fmt.Fprint(w, "Server stopping")
				if f, ok := w.(http.Flusher); ok {
					f.Flush()
				}
				stop()
			}
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Security-Policy", "default-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		static.ServeHTTP(w, r)
	})
}

func openBrowser(url string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		return exec.Command("open", url).Start()
	case "linux":
		return exec.Command("xdg-open", url).Start()
	default:
		return fmt.Errorf("automatic browser launch is not supported on %s", runtime.GOOS)
	}
}

func main() {
	noBrowser := flag.Bool("no-browser", false, "print the local URL without opening a browser")
	flag.Parse()
	site, err := fs.Sub(assets, "site")
	if err != nil {
		log.Fatal(err)
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		log.Fatalf("Cannot start local server: %v", err)
	}
	address := listener.Addr().String()
	url := "http://" + address + "/"
	server := &http.Server{ReadHeaderTimeout: 5 * time.Second}
	shutdownDone := make(chan struct{})
	var shutdownOnce sync.Once
	triggerShutdown := func() {
		shutdownOnce.Do(func() {
			go func() {
				defer close(shutdownDone)
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if err := server.Shutdown(ctx); err != nil {
					log.Printf("Could not stop local server: %v", err)
				}
			}()
		})
	}
	server.Handler = handler(site, address, triggerShutdown)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(sigCh)
	go func() {
		select {
		case <-sigCh:
			triggerShutdown()
		case <-shutdownDone:
		}
	}()

	fmt.Printf("Momentra ESP Flasher: %s\nKeep this window open. Press Ctrl+C to exit.\n", url)
	if !*noBrowser {
		if err := openBrowser(url); err != nil {
			fmt.Fprintf(os.Stderr, "Could not open a browser: %v\nOpen the URL above in Chrome or Edge.\n", err)
		}
	}
	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	<-shutdownDone
}
