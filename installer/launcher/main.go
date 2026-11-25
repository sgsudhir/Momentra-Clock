package main

import (
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
	"runtime"
	"time"
)

//go:embed site
var assets embed.FS

func handler(files fs.FS, address string) http.Handler {
	static := http.FileServer(http.FS(files))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != address {
			http.Error(w, "Invalid host", http.StatusForbidden)
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
	server := &http.Server{Handler: handler(site, address), ReadHeaderTimeout: 5 * time.Second}
	fmt.Printf("Momentra ESP Flasher: %s\nKeep this window open. Press Ctrl+C to exit.\n", url)
	if !*noBrowser {
		if err := openBrowser(url); err != nil {
			fmt.Fprintf(os.Stderr, "Could not open a browser: %v\nOpen the URL above in Chrome or Edge.\n", err)
		}
	}
	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
