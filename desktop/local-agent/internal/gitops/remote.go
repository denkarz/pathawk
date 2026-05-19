package gitops

import (
	"fmt"
	"net/url"
	"strings"
)

// EffectiveRemoteURL подставляет учётные данные для HTTPS (PAT). Для SSH и локальных URL возвращает как есть.
func EffectiveRemoteURL(remoteURL, authMode, httpsToken string) (string, error) {
	u := strings.TrimSpace(remoteURL)
	if u == "" {
		return "", fmt.Errorf("remote URL пустой")
	}
	switch authMode {
	case "ssh", "none", "":
		return u, nil
	case "https", "token":
		if strings.TrimSpace(httpsToken) == "" {
			return u, nil
		}
		return injectPAT(u, httpsToken)
	default:
		return u, nil
	}
}

func injectPAT(raw, token string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("remote URL: %w", err)
	}
	if parsed.Scheme != "https" {
		return "", fmt.Errorf("для PAT нужен https:// remote URL, сейчас: %q", parsed.Scheme)
	}
	if parsed.User != nil && parsed.User.Username() != "" {
		return raw, nil
	}
	host := strings.ToLower(parsed.Hostname())
	user := "oauth2"
	pass := token
	if strings.Contains(host, "github.com") {
		user = "x-access-token"
		pass = token
	}
	parsed.User = url.UserPassword(user, pass)
	return parsed.String(), nil
}
