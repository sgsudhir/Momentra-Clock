package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

const maxOTABytes = 0x1e0000

func resolveClock(ctx context.Context, host string) ([]netip.Addr, error) {
	if host == "momentra.local" && runtime.GOOS == "linux" {
		output, err := exec.CommandContext(ctx, "getent", "ahostsv4", host).Output()
		if err == nil {
			var addresses []netip.Addr
			for _, line := range strings.Split(string(output), "\n") {
				fields := strings.Fields(line)
				if len(fields) > 0 {
					if ip, err := netip.ParseAddr(fields[0]); err == nil && ip.Is4() {
						addresses = append(addresses, ip)
					}
				}
			}
			if len(addresses) > 0 {
				return addresses, nil
			}
		}
	}
	return net.DefaultResolver.LookupNetIP(ctx, "ip4", host)
}

func clockClient() *http.Client {
	dialer := &net.Dialer{Timeout: 4 * time.Second}
	transport := &http.Transport{
		Proxy:           nil,
		MaxIdleConns:    4,
		IdleConnTimeout: 30 * time.Second,
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil {
				return nil, err
			}
			addresses, err := resolveClock(ctx, host)
			if err != nil {
				return nil, err
			}
			var lastErr error
			for _, ip := range addresses {
				if !ip.IsPrivate() && !ip.IsLinkLocalUnicast() {
					continue
				}
				conn, err := dialer.DialContext(ctx, "tcp4", net.JoinHostPort(ip.String(), port))
				if err == nil {
					return conn, nil
				}
				lastErr = err
			}
			if lastErr != nil {
				return nil, lastErr
			}
			return nil, fmt.Errorf("clock address is not a private or link-local IPv4 address")
		},
	}
	return &http.Client{
		Transport: transport,
		Timeout:   120 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func clockTarget(target string) (string, error) {
	target = strings.TrimSpace(target)
	if target == "momentra.local" {
		return target, nil
	}
	ip, err := netip.ParseAddr(target)
	if err != nil || !ip.Is4() || (!ip.IsPrivate() && !ip.IsLinkLocalUnicast()) {
		return "", fmt.Errorf("enter momentra.local or a private IPv4 address")
	}
	return ip.String(), nil
}

var sharedClockClient = clockClient()

func proxyClock(w http.ResponseWriter, r *http.Request, path string) {
	proxyClockWithClient(w, r, path, sharedClockClient)
}

func proxyClockWithClient(w http.ResponseWriter, r *http.Request, path string, client *http.Client) {
	target, err := clockTarget(r.Header.Get("X-Momentra-Target"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	method := http.MethodGet
	var body io.Reader
	if path == "/api/ota" {
		if r.ContentLength <= 0 || r.ContentLength > maxOTABytes {
			http.Error(w, "Application image must fit the 1.875 MiB OTA slot", http.StatusBadRequest)
			return
		}
		data, err := io.ReadAll(io.LimitReader(r.Body, maxOTABytes+1))
		if err != nil || int64(len(data)) != r.ContentLength {
			http.Error(w, "Firmware upload was interrupted", http.StatusBadRequest)
			return
		}
		method, body = http.MethodPost, bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(r.Context(), method, "http://"+target+path, body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/octet-stream")
	}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "Clock request failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 32769))
	if err != nil || len(data) > 32768 {
		http.Error(w, "Clock response could not be read", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(resp.StatusCode)
	_, _ = w.Write(data)
}
