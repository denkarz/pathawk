package storage

import (
	"encoding/json"
	"fmt"

	bolt "go.etcd.io/bbolt"
)

const (
	bucketCollections   = "collections"
	bucketEnvironments  = "environments"
)

// Store оборачивает bbolt для коллекций.
type Store struct {
	db *bolt.DB
}

// Open открывает или создаёт файл БД.
func Open(dbPath string) (*Store, error) {
	db, err := bolt.Open(dbPath, 0o600, nil)
	if err != nil {
		return nil, err
	}
	s := &Store{db: db}
	if err := s.initMeta(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) initMeta() error {
	return s.db.Update(func(tx *bolt.Tx) error {
		if _, err := tx.CreateBucketIfNotExists([]byte("meta")); err != nil {
			return err
		}
		b := tx.Bucket([]byte("meta"))
		if b.Get([]byte("schema_version")) == nil {
			return b.Put([]byte("schema_version"), []byte("1"))
		}
		return nil
	})
}

func (s *Store) Close() error {
	return s.db.Close()
}

// ListCollectionIDs возвращает id всех коллекций.
func (s *Store) ListCollectionIDs() ([]string, error) {
	var ids []string
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketCollections))
		if b == nil {
			return nil
		}
		return b.ForEach(func(k, _ []byte) error {
			ids = append(ids, string(k))
			return nil
		})
	})
	return ids, err
}

// GetCollection возвращает сырой JSON документа.
func (s *Store) GetCollection(id string) ([]byte, error) {
	var data []byte
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketCollections))
		if b == nil {
			return fmt.Errorf("collection not found")
		}
		v := b.Get([]byte(id))
		if v == nil {
			return fmt.Errorf("collection not found")
		}
		data = append([]byte(nil), v...)
		return nil
	})
	return data, err
}

// PutCollection сохраняет JSON-объект; поле id в теле должно совпадать с id.
func (s *Store) PutCollection(id string, data []byte) error {
	var doc map[string]any
	if err := json.Unmarshal(data, &doc); err != nil {
		return fmt.Errorf("invalid json: %w", err)
	}
	docID, ok := doc["id"].(string)
	if !ok || docID != id {
		return fmt.Errorf("body.id must match path and be string")
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		b, err := tx.CreateBucketIfNotExists([]byte(bucketCollections))
		if err != nil {
			return err
		}
		return b.Put([]byte(id), data)
	})
}

// DeleteCollection удаляет коллекцию по id.
func (s *Store) DeleteCollection(id string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketCollections))
		if b == nil {
			return nil
		}
		return b.Delete([]byte(id))
	})
}

// --- environments (документ { id, name, variables: { k: v } }) ---

// ListEnvironmentIDs возвращает id всех окружений.
func (s *Store) ListEnvironmentIDs() ([]string, error) {
	var ids []string
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketEnvironments))
		if b == nil {
			return nil
		}
		return b.ForEach(func(k, _ []byte) error {
			ids = append(ids, string(k))
			return nil
		})
	})
	return ids, err
}

// GetEnvironment возвращает сырой JSON.
func (s *Store) GetEnvironment(id string) ([]byte, error) {
	var data []byte
	err := s.db.View(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketEnvironments))
		if b == nil {
			return fmt.Errorf("environment not found")
		}
		v := b.Get([]byte(id))
		if v == nil {
			return fmt.Errorf("environment not found")
		}
		data = append([]byte(nil), v...)
		return nil
	})
	return data, err
}

// PutEnvironment сохраняет JSON; body.id должен совпадать с id в пути.
func (s *Store) PutEnvironment(id string, data []byte) error {
	var doc map[string]any
	if err := json.Unmarshal(data, &doc); err != nil {
		return fmt.Errorf("invalid json: %w", err)
	}
	docID, ok := doc["id"].(string)
	if !ok || docID != id {
		return fmt.Errorf("body.id must match path and be string")
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		b, err := tx.CreateBucketIfNotExists([]byte(bucketEnvironments))
		if err != nil {
			return err
		}
		return b.Put([]byte(id), data)
	})
}

// DeleteEnvironment удаляет окружение.
func (s *Store) DeleteEnvironment(id string) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(bucketEnvironments))
		if b == nil {
			return nil
		}
		return b.Delete([]byte(id))
	})
}
