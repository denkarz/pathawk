package gitops

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"postman/local-agent/internal/storage"
)

const commitUserName = "Pathawk Local Agent"
const commitUserEmail = "pathawk@local.agent"

// SyncParams — параметры одной синхронизации активного репо.
type SyncParams struct {
	RemoteURL       string
	LocalPath       string
	Branch          string
	CollectionsPath string
	AuthMode        string
	HTTPSToken      string
	// GitCommitMode: autoPush | stage | files (пусто = files).
	GitCommitMode string
}

// NormalizeGitCommitMode: autoPush — add+commit+push; stage — только git add; files — только запись файлов на диск.
func NormalizeGitCommitMode(s string) string {
	m := strings.ToLower(strings.TrimSpace(s))
	switch m {
	case "autopush", "auto_push", "auto":
		return "autoPush"
	case "stage", "stageonly", "stage_only":
		return "stage"
	case "files", "filesonly", "workingtree", "export":
		return "files"
	default:
		return "files"
	}
}

func cleanRemoteURL(u string) string {
	return strings.TrimSpace(u)
}

// SetOriginURL sets remote.origin.url (used to swap credentialed URL).
func SetOriginURL(localPath, remoteURL string) error {
	_, stderr, err := runGitInRepo(localPath, nil, "remote", "set-url", "origin", remoteURL)
	return combinedGitError(stderr, err)
}

// EnsureRepoCloneOrOpen: если нет .git — clone; иначе обновляет origin на effective (для fetch).
func EnsureRepoCloneOrOpen(p SyncParams) error {
	local := filepath.Clean(strings.TrimSpace(p.LocalPath))
	if local == "" || local == "." {
		return fmt.Errorf("локальный путь не задан")
	}
	branch := strings.TrimSpace(p.Branch)
	if branch == "" {
		return fmt.Errorf("ветка не задана")
	}
	effective, err := EffectiveRemoteURL(p.RemoteURL, p.AuthMode, p.HTTPSToken)
	if err != nil {
		return err
	}
	clean := cleanRemoteURL(p.RemoteURL)
	gitDir := filepath.Join(local, ".git")
	if st, e := os.Stat(gitDir); e == nil && st.IsDir() {
		if err := SetOriginURL(local, effective); err != nil {
			return fmt.Errorf("origin: %w", err)
		}
		return nil
	}
	parent := filepath.Dir(local)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return err
	}
	if _, e := os.Stat(local); e == nil {
		entries, rerr := os.ReadDir(local)
		if rerr != nil {
			return rerr
		}
		if len(entries) > 0 {
			return fmt.Errorf("каталог %s не пуст и не является git-репозиторием", local)
		}
	}
	_, stderr, err := runGit("", nil, "clone", "--branch", branch, "--single-branch", effective, local)
	if err != nil {
		return combinedGitError(stderr, err)
	}
	_ = SetOriginURL(local, clean)
	return nil
}

func ensureGitIdentity(localPath string) error {
	_, stderr, err := runGitInRepo(localPath, nil, "config", "user.name", commitUserName)
	if err != nil {
		return combinedGitError(stderr, err)
	}
	_, stderr2, err2 := runGitInRepo(localPath, nil, "config", "user.email", commitUserEmail)
	if err2 != nil {
		return combinedGitError(stderr2, err2)
	}
	return nil
}

// FullSync: pull → импорт JSON с диска → экспорт из bbolt → по режиму: ничего / git add / commit+push.
// Возвращает outcome: clean | files | staged | pushed.
func FullSync(store *storage.Store, p SyncParams) (head string, outcome string, rerr error) {
	local := filepath.Clean(strings.TrimSpace(p.LocalPath))
	branch := strings.TrimSpace(p.Branch)
	collRoot := strings.TrimSpace(p.CollectionsPath)
	if collRoot == "" {
		collRoot = "collections"
	}
	effective, err := EffectiveRemoteURL(p.RemoteURL, p.AuthMode, p.HTTPSToken)
	if err != nil {
		return "", "", err
	}
	clean := cleanRemoteURL(p.RemoteURL)

	if err := EnsureRepoCloneOrOpen(p); err != nil {
		return "", "", err
	}
	if err := SetOriginURL(local, effective); err != nil {
		return "", "", err
	}
	defer func() { _ = SetOriginURL(local, clean) }()

	if err := ensureGitIdentity(local); err != nil {
		return "", "", err
	}

	_, stderr, err := runGitInRepo(local, nil, "fetch", "origin")
	if err != nil {
		return "", "", fmt.Errorf("git fetch: %w", combinedGitError(stderr, err))
	}
	_, stderr, err = runGitInRepo(local, nil, "checkout", "-B", branch, fmt.Sprintf("origin/%s", branch))
	if err != nil {
		_, stderr2, err2 := runGitInRepo(local, nil, "checkout", branch)
		if err2 != nil {
			return "", "", fmt.Errorf("git checkout: %w; fallback: %v", combinedGitError(stderr, err), combinedGitError(stderr2, err2))
		}
	}
	_, stderr, err = runGitInRepo(local, nil, "pull", "--rebase", "origin", branch)
	if err != nil {
		return "", "", fmt.Errorf("git pull --rebase: %w", combinedGitError(stderr, err))
	}

	collDir := filepath.Join(local, collRoot, "collections")
	envDir := filepath.Join(local, collRoot, "environments")
	if err := importCollectionsFromDir(store, collDir); err != nil {
		return "", "", err
	}
	if err := importEnvironmentsFromDir(store, envDir); err != nil {
		return "", "", err
	}
	if err := exportCollectionsToDir(store, collDir); err != nil {
		return "", "", err
	}
	if err := exportEnvironmentsToDir(store, envDir); err != nil {
		return "", "", err
	}

	relColl := filepath.Join(collRoot, "collections")
	relEnv := filepath.Join(collRoot, "environments")
	mode := NormalizeGitCommitMode(p.GitCommitMode)

	stArgs := append([]string{"status", "--porcelain", "--"}, relColl, relEnv)
	stOut, stderr, err := runGitInRepo(local, nil, stArgs...)
	if err != nil {
		return "", "", fmt.Errorf("git status: %w", combinedGitError(stderr, err))
	}
	if strings.TrimSpace(stOut) == "" {
		out, _, e := runGitInRepo(local, nil, "rev-parse", "HEAD")
		if e == nil {
			head = strings.TrimSpace(out)
		}
		return head, "clean", nil
	}

	switch mode {
	case "autoPush":
		_, stderr, err = runGitInRepo(local, nil, "add", "--", relColl, relEnv)
		if err != nil {
			return "", "", fmt.Errorf("git add: %w", combinedGitError(stderr, err))
		}
		msg := "pathawk: sync collections and environments"
		_, stderr, err = runGitInRepo(local, nil, "commit", "-m", msg)
		if err != nil {
			return "", "", fmt.Errorf("git commit: %w", combinedGitError(stderr, err))
		}
		_, stderr, err = runGitInRepo(local, nil, "push", "origin", branch)
		if err != nil {
			return "", "", fmt.Errorf("git push: %w", combinedGitError(stderr, err))
		}
		out, _, err := runGitInRepo(local, nil, "rev-parse", "HEAD")
		if err == nil {
			head = strings.TrimSpace(out)
		}
		return head, "pushed", nil
	case "stage":
		_, stderr, err = runGitInRepo(local, nil, "add", "--", relColl, relEnv)
		if err != nil {
			return "", "", fmt.Errorf("git add: %w", combinedGitError(stderr, err))
		}
		out, _, err := runGitInRepo(local, nil, "rev-parse", "HEAD")
		if err == nil {
			head = strings.TrimSpace(out)
		}
		return head, "staged", nil
	default: // files
		out, _, err := runGitInRepo(local, nil, "rev-parse", "HEAD")
		if err == nil {
			head = strings.TrimSpace(out)
		}
		return head, "files", nil
	}
}

func importCollectionsFromDir(store *storage.Store, dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(strings.ToLower(name), ".json") {
			continue
		}
		id := strings.TrimSuffix(name, filepath.Ext(name))
		if id == "" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return err
		}
		var doc map[string]any
		if json.Unmarshal(data, &doc) != nil {
			continue
		}
		if err := store.PutCollection(id, data); err != nil {
			return fmt.Errorf("коллекция %s: %w", id, err)
		}
	}
	return nil
}

func importEnvironmentsFromDir(store *storage.Store, dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(strings.ToLower(name), ".json") {
			continue
		}
		id := strings.TrimSuffix(name, filepath.Ext(name))
		if id == "" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return err
		}
		var doc map[string]any
		if json.Unmarshal(data, &doc) != nil {
			continue
		}
		if err := store.PutEnvironment(id, data); err != nil {
			return fmt.Errorf("окружение %s: %w", id, err)
		}
	}
	return nil
}

func exportCollectionsToDir(store *storage.Store, dir string) error {
	ids, err := store.ListCollectionIDs()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	want := map[string]struct{}{}
	for _, id := range ids {
		want[id] = struct{}{}
		raw, err := store.GetCollection(id)
		if err != nil {
			return err
		}
		path := filepath.Join(dir, id+".json")
		if err := os.WriteFile(path, raw, 0o644); err != nil {
			return err
		}
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(strings.ToLower(name), ".json") {
			continue
		}
		id := strings.TrimSuffix(name, filepath.Ext(name))
		if _, ok := want[id]; !ok {
			_ = os.Remove(filepath.Join(dir, name))
		}
	}
	return nil
}

func exportEnvironmentsToDir(store *storage.Store, dir string) error {
	ids, err := store.ListEnvironmentIDs()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	want := map[string]struct{}{}
	for _, id := range ids {
		want[id] = struct{}{}
		raw, err := store.GetEnvironment(id)
		if err != nil {
			return err
		}
		path := filepath.Join(dir, id+".json")
		if err := os.WriteFile(path, raw, 0o644); err != nil {
			return err
		}
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.HasSuffix(strings.ToLower(name), ".json") {
			continue
		}
		id := strings.TrimSuffix(name, filepath.Ext(name))
		if _, ok := want[id]; !ok {
			_ = os.Remove(filepath.Join(dir, name))
		}
	}
	return nil
}
