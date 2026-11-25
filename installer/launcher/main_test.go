package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestHandler(t *testing.T) {
	files := fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte("offline")}}
	h := handler(files, "127.0.0.1:1234", func() {})
	for _, tt := range []struct {
		method, host, path string
		want               int
	}{
		{"GET", "127.0.0.1:1234", "/", http.StatusOK},
		{"HEAD", "127.0.0.1:1234", "/", http.StatusOK},
		{"POST", "127.0.0.1:1234", "/", http.StatusMethodNotAllowed},
		{"GET", "evil.example:1234", "/", http.StatusForbidden},
		{"GET", "127.0.0.1:1234", "/missing", http.StatusNotFound},
	} {
		req := httptest.NewRequest(tt.method, "http://"+tt.host+tt.path, nil)
		result := httptest.NewRecorder()
		h.ServeHTTP(result, req)
		if result.Code != tt.want {
			t.Errorf("%s %s %s: got %d, want %d", tt.method, tt.host, tt.path, result.Code, tt.want)
		}
		if result.Code == http.StatusOK && result.Header().Get("Content-Security-Policy") == "" {
			t.Error("missing Content-Security-Policy")
		}
	}
}

func TestLocalActionsRequireOriginAndHeader(t *testing.T) {
	stopped := false
	h := handler(fstest.MapFS{}, "127.0.0.1:1234", func() { stopped = true })
	for _, tt := range []struct {
		origin, header string
		want           int
	}{
		{"", "1", http.StatusForbidden},
		{"http://evil.example", "1", http.StatusForbidden},
		{"http://127.0.0.1:1234", "", http.StatusForbidden},
		{"http://127.0.0.1:1234", "1", http.StatusOK},
	} {
		req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:1234/local/stop", nil)
		req.Header.Set("Origin", tt.origin)
		req.Header.Set("X-Momentra-Request", tt.header)
		result := httptest.NewRecorder()
		h.ServeHTTP(result, req)
		if result.Code != tt.want {
			t.Errorf("origin %q header %q: got %d, want %d", tt.origin, tt.header, result.Code, tt.want)
		}
	}
	if !stopped {
		t.Fatal("authorized stop did not invoke shutdown")
	}
}

func TestClockTarget(t *testing.T) {
	for _, tt := range []struct {
		target string
		valid  bool
	}{
		{"momentra.local", true}, {" 192.168.1.12 ", true},
		{"10.0.0.1", true}, {"169.254.1.2", true},
		{"127.0.0.1", false}, {"8.8.8.8", false}, {"evil.local", false},
		{"192.168.1.1:80", false}, {"http://192.168.1.1", false}, {"::1", false},
	} {
		_, err := clockTarget(tt.target)
		if (err == nil) != tt.valid {
			t.Errorf("%q: got error %v", tt.target, err)
		}
	}
}

func TestOTARejectsOversize(t *testing.T) {
	h := handler(fstest.MapFS{}, "127.0.0.1:1234", func() {})
	req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:1234/local/ota", strings.NewReader("x"))
	req.ContentLength = maxOTABytes + 1
	req.Header.Set("Origin", "http://127.0.0.1:1234")
	req.Header.Set("X-Momentra-Request", "1")
	req.Header.Set("X-Momentra-Target", "192.168.1.1")
	result := httptest.NewRecorder()
	h.ServeHTTP(result, req)
	if result.Code != http.StatusBadRequest {
		t.Fatalf("got %d, want 400", result.Code)
	}
}

func TestProxyOTAForwardsRawApplicationAndClockErrors(t *testing.T) {
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		data, err := io.ReadAll(r.Body)
		if err != nil || string(data) != "application-image" || r.Method != http.MethodPost ||
			r.URL.String() != "http://192.168.1.12/api/ota" || r.Header.Get("Content-Type") != "application/octet-stream" {
			t.Errorf("unexpected forwarded request: %s %s %q, err=%v", r.Method, r.URL, data, err)
		}
		return &http.Response{StatusCode: http.StatusForbidden, Body: io.NopCloser(strings.NewReader(`{"error":"station only"}`)), Header: make(http.Header)}, nil
	})}
	req := httptest.NewRequest(http.MethodPost, "/local/ota", strings.NewReader("application-image"))
	req.Header.Set("X-Momentra-Target", "192.168.1.12")
	result := httptest.NewRecorder()
	proxyClockWithClient(result, req, "/api/ota", client)
	if result.Code != http.StatusForbidden || result.Body.String() != `{"error":"station only"}` {
		t.Fatalf("clock error not forwarded: %d %q", result.Code, result.Body.String())
	}
}
