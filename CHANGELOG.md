# Changelog

## 0.2.2

- Simplify `--allow-run` flag to resolve "Requires --allow-run permissions to
  spawn subprocess with LD_LIBRARY_PATH environment variable. Alternatively,
  spawn with the environment variable unset."

## 0.2.1

- Fix docker command (add .cache to `--allow-write`)

## 0.2.0

- Add "registry" command to back up ghcr.io images
- (internal) migrated to Deno 2.4.3 from deno 1.46.x

[See changes](https://github.com/robb-j/github-org-backup/compare/v0.1.5...v0.2.0)

## 0.1.5

- Add "tolerations" to allow some repos to fail

## 0.1.4

- Fix Octokit dependency
- Upgrade gruber to `0.7.0`

## 0.1.3

Git remotes are now checked and set again if they are persisted and have since
changed. I.e. a HTTP basic password has changed since the last pull.

All repos are attempted, logging errors and only exiting cleanly if they all
pass.

## 0.1.2

Fixes + improvements

## 0.1.1

Rebuild

## 0.1.0

🎉 Everything is new
