package gitops

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

func runGit(dir string, extraEnv []string, args ...string) (stdout, stderr string, err error) {
	cmd := exec.Command("git", args...)
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.Env = append(append(os.Environ(),
		"GIT_TERMINAL_PROMPT=0",
		"LANG=C",
	), extraEnv...)
	var outb, errb bytes.Buffer
	cmd.Stdout = &outb
	cmd.Stderr = &errb
	err = cmd.Run()
	return strings.TrimSpace(outb.String()), strings.TrimSpace(errb.String()), err
}

func runGitInRepo(localPath string, extraEnv []string, args ...string) (stdout, stderr string, err error) {
	full := append([]string{"-C", localPath}, args...)
	return runGit("", extraEnv, full...)
}

func combinedGitError(stderr string, err error) error {
	if err == nil {
		return nil
	}
	msg := stderr
	if msg == "" {
		msg = err.Error()
	}
	return fmt.Errorf("%s", msg)
}
