package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"

	"postman/local-agent/internal/storage"
)

// Handler обслуживает REST API local-agent.
type Handler struct {
	Store *storage.Store
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /health", h.health)
	mux.HandleFunc("GET /api/v1/collections", h.listCollections)
	mux.HandleFunc("GET /api/v1/collections/{id}", h.getCollection)
	mux.HandleFunc("PUT /api/v1/collections/{id}", h.putCollection)
	mux.HandleFunc("DELETE /api/v1/collections/{id}", h.deleteCollection)
	mux.HandleFunc("GET /api/v1/environments", h.listEnvironments)
	mux.HandleFunc("GET /api/v1/environments/{id}", h.getEnvironment)
	mux.HandleFunc("PUT /api/v1/environments/{id}", h.putEnvironment)
	mux.HandleFunc("DELETE /api/v1/environments/{id}", h.deleteEnvironment)
	mux.HandleFunc("GET /api/v1/git/settings", h.getGitSettings)
	mux.HandleFunc("PUT /api/v1/git/settings", h.putGitSettings)
	mux.HandleFunc("PUT /api/v1/git/credentials", h.putGitCredentials)
	mux.HandleFunc("POST /api/v1/git/branches", h.postGitBranches)
	mux.HandleFunc("POST /api/v1/git/sync", h.postGitSync)
}

func (h *Handler) health(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"status":"ok"}`))
}

type collectionListItem struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (h *Handler) listCollections(w http.ResponseWriter, _ *http.Request) {
	ids, err := h.Store.ListCollectionIDs()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	out := make([]collectionListItem, 0, len(ids))
	for _, id := range ids {
		item := collectionListItem{ID: id, Name: id}
		raw, err := h.Store.GetCollection(id)
		if err == nil {
			var doc struct {
				Name string `json:"name"`
			}
			if json.Unmarshal(raw, &doc) == nil && doc.Name != "" {
				item.Name = doc.Name
			}
		}
		out = append(out, item)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func (h *Handler) getCollection(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	raw, err := h.Store.GetCollection(id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(raw)
}

func (h *Handler) putCollection(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.Store.PutCollection(id, body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) deleteCollection(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.Store.DeleteCollection(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type environmentListItem struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

func (h *Handler) listEnvironments(w http.ResponseWriter, _ *http.Request) {
	ids, err := h.Store.ListEnvironmentIDs()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	out := make([]environmentListItem, 0, len(ids))
	for _, id := range ids {
		item := environmentListItem{ID: id, Name: id}
		raw, err := h.Store.GetEnvironment(id)
		if err == nil {
			var doc struct {
				Name string `json:"name"`
			}
			if json.Unmarshal(raw, &doc) == nil && doc.Name != "" {
				item.Name = doc.Name
			}
		}
		out = append(out, item)
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func (h *Handler) getEnvironment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	raw, err := h.Store.GetEnvironment(id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(raw)
}

func (h *Handler) putEnvironment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.Store.PutEnvironment(id, body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) deleteEnvironment(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.Store.DeleteEnvironment(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// LogRequests — простой middleware для отладки.
func LogRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}
