package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestHandler(t *testing.T) {
	files := fstest.MapFS{"index.html": &fstest.MapFile{Data: []byte("offline")}}
	h := handler(files, "127.0.0.1:1234")
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
