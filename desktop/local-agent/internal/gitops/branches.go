package gitops

import (
	"fmt"
	"strings"
)

// ListRemoteBranchNames выполняет git ls-remote --heads.
func ListRemoteBranchNames(remoteURL, authMode, httpsToken string) ([]string, error) {
	effective, err := EffectiveRemoteURL(remoteURL, authMode, httpsToken)
	if err != nil {
		return nil, err
	}
	out, stderr, err := runGit("", nil, "ls-remote", "--heads", effective)
	if err != nil {
		return nil, combinedGitError(stderr, err)
	}
	var names []string
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		ref := parts[1]
		const p = "refs/heads/"
		if strings.HasPrefix(ref, p) {
			names = append(names, strings.TrimPrefix(ref, p))
		}
	}
	if len(names) == 0 {
		return nil, fmt.Errorf("не удалось получить ветки (пустой ответ ls-remote)")
	}
	return names, nil
}
