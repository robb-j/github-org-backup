# github-org-backup

Backup/export all git repositories in a GitHub organisation to another git
server. Works well with create-on-push git servers like Gitea & GitLab.

## Usage

> You'll need [Deno v2](https://docs.deno.com/runtime/) installed to run locally

```bash
# cd to/this/folder

git clone git@github.com:robb-j/github-org-backup.git

# Get configuration usage and current values
# > See the permissions used at the top of the config.ts
./source/config.ts

# Fill with your configuration
echo "{}" > app-config.json
echo "" > .env

# Run the main script
# > See the permissions used at the top of the main.ts
./source/main.ts

# commands:
#   repos     backup all git repositories
#   registry  backup all container images
#   config    output app configuration and usage
#   --help    show this help info
```

## Container

The CLI is also available as a container to run regularly on servers.

You can set the same environment variables and/or mount your configuration at
`/app/app-config.json` as user `1000:1000`.

You could try using a volume to persist repos, but this is not tested. Mount
your volume at `/app/repos` as user `1000:1000`.

[Find the latest containers here →](https://github.com/robb-j/github-org-backup/pkgs/container/github-org-backup)

## Configuration

Usage:

| name                    | type   | flag | variable                 | fallback                                                |
| ----------------------- | ------ | ---- | ------------------------ | ------------------------------------------------------- |
| env                     | string | ~    | DENO_ENV                 | development                                             |
| github.org              | string | ~    | GITHUB_ORG               | geoff-org                                               |
| github.registry         | url    | ~    | GITHUB_REGISTRY          | https://ghcr.io/                                        |
| github.remoteName       | string | ~    | GITHUB_REMOTE            | origin                                                  |
| github.token            | string | ~    | GITHUB_TOKEN             |                                                         |
| github.username         | string | ~    | GITHUB_USERNAME          | geoff-testington                                        |
| repos.dir               | url    | ~    | REPOS_DIR                | file:///Users/nra76/Developer/labs/github-backup/repos/ |
| target.registryPassword | string | ~    | TARGET_REGISTRY_PASSWORD |                                                         |
| target.registryUrl      | url    | ~    | TARGET_REGISTRY_URL      | http://localhost:5001/                                  |
| target.registryUser     | string | ~    | TARGET_REGISTRY_USERNAME |                                                         |
| target.remoteName       | string | ~    | BACKUP_REMOTE            | backup                                                  |
| target.remoteTemplate   | string | ~    | TARGET_TEMPLATE          | https://example.com/organisation/{repo}.git             |

Default:

```json
{
	"env": "development",
	"github": {
		"org": "geoff-org",
		"token": "",
		"username": "geoff-testington",
		"remoteName": "origin",
		"registry": "https://ghcr.io/"
	},
	"target": {
		"remoteTemplate": "https://example.com/organisation/{repo}.git",
		"remoteName": "backup",
		"registryUrl": "http://localhost:5001/",
		"registryUser": "",
		"registryPassword": ""
	},
	"repos": {
		"dir": "./repos/"
	}
}
```

## How it works

### Git repositories

The command queries the
[GitHub API](https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#list-organization-repositories)
to find all the repositories that belong to the organisation (`github.org`).

> You'll want to create a personal access token (`github.token`) that has
> permission to do that and also permission to read the repo.

Next, each repository is cloned into the `repos` folder, where a new remote is
added using the `target.remoteTemplate` value, where `{repo}` is replaced with
the name of the repo in GitHub.

Finally, the repo is pushed to the new remote. The idea is you can encode the
username/password in that template, like `https://user:password@example.com`.

### Container registry

The command queries the
[GitHub API](https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#list-organization-repositories)
to find all the container packages that belong to the organisation.
(`github.org`).

> You'll want to create a personal access token (`github.token`) that has
> permission to do that and also permission to read the repo.

The container list is pruned to only keep the latest patch version of each
major/minor combination, effecticvely a `major.minor.x` pattern.

Each filtered container is then streamed from ghcr.io to the target registry
under the same name. It also mounts blobs between registries to avoid
duplication.

It will skip any container that's manifest is already uploaded.

Once all the layers, config objects and platform-manifests are uploaded to the
new registry, it uploads the manifest to complete the container.

## Release

1. Ensure everything is committed
2. Update the `CHANGELOG.md`
3. Commit and tag as `vX.Y.Z`
4. Push changes
