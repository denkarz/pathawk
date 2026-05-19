package storage

import (
	"fmt"

	bolt "go.etcd.io/bbolt"
)

const (
	metaKeyGitWorkspace = "git_workspace_json"
	bucketGitTokens      = "git_https_tokens"
)

// GetGitWorkspaceJSON возвращает сохранённые настройки Git (JSON) или nil если нет.
func (s *Store) GetGitWorkspaceJSON() ([]byte, error) {
	var out []byte
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte("meta"))
		if b == nil {
			return nil
		}
		v := b.Get([]byte(metaKeyGitWorkspace))
		if v == nil {
			return nil
		}
		out = append([]byte(nil), v...)
		return nil
	})
	return out, err
}

// PutGitWorkspaceJSON сохраняет JSON настроек Git (без токенов — токены в отдельном bucket).
func (s *Store) PutGitWorkspaceJSON(data []byte) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b, err := tx.CreateBucketIfNotExists([]byte("meta"))
		if err != nil {
			return err
		}
		return b.Put([]byte(metaKeyGitWorkspace), data)
	})
}

// GetHTTPSToken возвращает PAT для репозитория или пустую строку.
func (s *Store) GetHTTPSToken(repoID string) (string, error) {
	var out string
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketGitTokens))
		if b == nil {
			return nil
		}
		v := b.Get([]byte(repoID))
		if v != nil {
			out = string(v)
		}
		return nil
	})
	return out, err
}

// PutHTTPSToken сохраняет PAT для режима HTTPS (перезаписывает).
func (s *Store) PutHTTPSToken(repoID, token string) error {
	if repoID == "" {
		return fmt.Errorf("repo id empty")
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		b, err := tx.CreateBucketIfNotExists([]byte(bucketGitTokens))
		if err != nil {
			return err
		}
		return b.Put([]byte(repoID), []byte(token))
	})
}

// DeleteHTTPSToken удаляет сохранённый PAT.
func (s *Store) DeleteHTTPSToken(repoID string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketGitTokens))
		if b == nil {
			return nil
		}
		return b.Delete([]byte(repoID))
	})
}

// HTTPSRepoIDsWithTokens — список repo id, для которых задан непустой токен.
func (s *Store) HTTPSRepoIDsWithTokens() ([]string, error) {
	var ids []string
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketGitTokens))
		if b == nil {
			return nil
		}
		return b.ForEach(func(k, v []byte) error {
			if len(v) > 0 {
				ids = append(ids, string(k))
			}
			return nil
		})
	})
	return ids, err
}
