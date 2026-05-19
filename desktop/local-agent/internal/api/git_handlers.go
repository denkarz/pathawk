package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"postman/local-agent/internal/gitops"
)

type gitRepoDTO struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	RemoteURL       string `json:"remoteUrl"`
	LocalPath       string `json:"localPath"`
	Branch          string `json:"branch"`
	CollectionsPath string `json:"collectionsPath"`
	AuthMode        string `json:"authMode"`
	IsActive        bool   `json:"isActive"`
	SyncMode        string `json:"syncMode"`
	ConflictPolicy  string `json:"conflictPolicy"`
	SyncIntervalMin int    `json:"syncIntervalMinutes"`
	LastSyncedAt    string `json:"lastSyncedAt,omitempty"`
	LastSyncSource  string `json:"lastSyncSource,omitempty"`
	LastSeenHead    string `json:"lastSeenHead,omitempty"`
	HTTPSTokenSet   bool   `json:"httpsTokenSet"`
	GitCommitMode   string `json:"gitCommitMode"`
}

type gitWorkspaceDTO struct {
	Repos         []gitRepoDTO `json:"repos"`
	DefaultRepoID *string      `json:"defaultRepoId"`
	UpdatedAt     string       `json:"updatedAt"`
}

func (h *Handler) getGitSettings(w http.ResponseWriter, _ *http.Request) {
	raw, err := h.Store.GetGitWorkspaceJSON()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(raw) == 0 {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"repos":[],"defaultRepoId":null,"updatedAt":""}`))
		return
	}
	var ws gitWorkspaceDTO
	if err := json.Unmarshal(raw, &ws); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	for i := range ws.Repos {
		tok, _ := h.Store.GetHTTPSToken(ws.Repos[i].ID)
		ws.Repos[i].HTTPSTokenSet = strings.TrimSpace(tok) != ""
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(ws)
}

func (h *Handler) putGitSettings(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.Store.PutGitWorkspaceJSON(body); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type gitCredBody struct {
	RepoID     string `json:"repoId"`
	HTTPSToken string `json:"httpsToken"`
}

func (h *Handler) putGitCredentials(w http.ResponseWriter, r *http.Request) {
	var b gitCredBody
	if err := json.NewDecoder(r.Body).Decode(&b); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(b.RepoID) == "" {
		http.Error(w, "repoId required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(b.HTTPSToken) == "" {
		if err := h.Store.DeleteHTTPSToken(b.RepoID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		if err := h.Store.PutHTTPSToken(b.RepoID, b.HTTPSToken); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

type gitRepoIDBody struct {
	RepoID string `json:"repoId"`
}

func (h *Handler) postGitBranches(w http.ResponseWriter, r *http.Request) {
	repo, err := h.resolveGitRepo(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	tok, _ := h.Store.GetHTTPSToken(repo.ID)
	names, err := gitops.ListRemoteBranchNames(repo.RemoteURL, repo.AuthMode, tok)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"branches": names})
}

type gitSyncResponse struct {
	OK      bool   `json:"ok"`
	Head    string `json:"head,omitempty"`
	Message string `json:"message,omitempty"`
	Outcome string `json:"outcome,omitempty"`
}

func humanGitSyncMessage(outcome string) string {
	switch outcome {
	case "pushed":
		return "Изменения закоммичены и отправлены в remote."
	case "staged":
		return "Выполнен git add по каталогам данных. Commit и push сделайте вручную, когда удобно."
	case "files":
		return "Файлы в клоне обновлены; git add/commit/push не выполнялись — без лишних коммитов в репозитории с кодом."
	case "clean":
		return "Нет изменений в каталогах коллекций/окружений относительно текущего HEAD."
	default:
		return "Синхронизация завершена."
	}
}

func (h *Handler) postGitSync(w http.ResponseWriter, r *http.Request) {
	repo, err := h.resolveGitRepo(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	tok, _ := h.Store.GetHTTPSToken(repo.ID)
	p := gitops.SyncParams{
		RemoteURL:       repo.RemoteURL,
		LocalPath:       repo.LocalPath,
		Branch:          repo.Branch,
		CollectionsPath: repo.CollectionsPath,
		AuthMode:        repo.AuthMode,
		HTTPSToken:      tok,
		GitCommitMode:   repo.GitCommitMode,
	}
	head, outcome, err := gitops.FullSync(h.Store, p)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := h.patchGitRepoMeta(repo.ID, head); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(gitSyncResponse{
		OK:      true,
		Head:    head,
		Message: humanGitSyncMessage(outcome),
		Outcome: outcome,
	})
}

func (h *Handler) resolveGitRepo(r *http.Request) (*gitRepoDTO, error) {
	var body gitRepoIDBody
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	raw, err := h.Store.GetGitWorkspaceJSON()
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return nil, errGitNoSettings
	}
	var ws gitWorkspaceDTO
	if err := json.Unmarshal(raw, &ws); err != nil {
		return nil, err
	}
	if len(ws.Repos) == 0 {
		return nil, errGitNoRepos
	}
	want := strings.TrimSpace(body.RepoID)
	if want != "" {
		for i := range ws.Repos {
			if ws.Repos[i].ID == want {
				return &ws.Repos[i], nil
			}
		}
		return nil, errGitRepoNotFound
	}
	for i := range ws.Repos {
		if ws.Repos[i].IsActive {
			return &ws.Repos[i], nil
		}
	}
	if ws.DefaultRepoID != nil {
		for i := range ws.Repos {
			if ws.Repos[i].ID == *ws.DefaultRepoID {
				return &ws.Repos[i], nil
			}
		}
	}
	return &ws.Repos[0], nil
}

var (
	errGitNoSettings   = errString("git: настройки не сохранены")
	errGitNoRepos      = errString("git: нет репозиториев в настройках")
	errGitRepoNotFound = errString("git: репозиторий не найден")
)

type errString string

func (e errString) Error() string { return string(e) }

func (h *Handler) patchGitRepoMeta(repoID, head string) error {
	raw, err := h.Store.GetGitWorkspaceJSON()
	if err != nil {
		return err
	}
	if len(raw) == 0 {
		return nil
	}
	var doc map[string]any
	if err := json.Unmarshal(raw, &doc); err != nil {
		return err
	}
	reposAny, ok := doc["repos"].([]any)
	if !ok {
		return nil
	}
	now := time.Now().UTC().Format(time.RFC3339)
	doc["updatedAt"] = now
	for i, r := range reposAny {
		m, ok := r.(map[string]any)
		if !ok {
			continue
		}
		id, _ := m["id"].(string)
		if id != repoID {
			continue
		}
		m["lastSyncedAt"] = now
		m["lastSyncSource"] = "local"
		if head != "" {
			m["lastSeenHead"] = head
		}
		reposAny[i] = m
		break
	}
	doc["repos"] = reposAny
	out, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	return h.Store.PutGitWorkspaceJSON(out)
}
