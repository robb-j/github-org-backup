# github-org-backup

Backup/export all git repositories in a GitHub organisation to another git
server. Works well with create-on-push git servers like Gitea & GitLab.

## Usage

> You'll need [Deno v1](https://docs.deno.com/runtime/) installed to run locally

```bash
# cd to/this/folder

git clone git@github.com:robb-j/github-org-backup.git

# Get configuration usage and current values
# > See the permissions used at the top of the config.ts
deno task config

# Fill with your configuration
echo "{}" > app-config.json
echo "" > .env

# Run the script
# > See the permissions used at the top of the main.ts
deno task start

# List repos from GitHub
deno task start --list
```

## Container

The script is also available as a container to run regularly on servers. The
container will run the script on start up.

You can set the same environment variables and/or mount your configuration at
`/app/app-config.json` as user `1000:1000`.

You could try using a volume to persist repos, but this is not tested. Mount
your volume at `/app/repos` as user `1000:1000`.

[Find the latest containers here →](https://github.com/robb-j/github-org-backup/pkgs/container/github-org-backup)

## Configuration

Usage:

| name            | type   | flag | variable        | fallback                                    |
| --------------- | ------ | ---- | --------------- | ------------------------------------------- |
| env             | string | ~    | DENO_ENV        | development                                 |
| github.org      | string | ~    | GITHUB_ORG      | geoff-org                                   |
| github.token    | string | ~    | GITHUB_TOKEN    |                                             |
| github.username | string | ~    | GITHUB_USERNAME | geoff-testington                            |
| target.template | string | ~    | TARGET_TEMPLATE | https://example.com/organisation/{repo}.git |

Default:

```json
{
	"env": "development",
	"github": {
		"org": "geoff-org",
		"token": "",
		"username": "geoff-testington"
	},
	"target": {
		"template": "https://example.com/organisation/{repo}.git"
	}
}
```

## How it works

The script queries the
[GitHub API](https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#list-organization-repositories)
to find all the repositories that belong to the organisation (`github.org`).

> You'll want to create a personal access token (`github.token`) that has
> permission to do that and also permission to read the repo.

Next, each repository is cloned into the `repos` folder, where a new remote is
added using the `target.template` value, where `{repo}` is replaced with the
name of the repo in GitHub.

Finally, the repo is pushed to the new remote. The idea is you can encode the
username/password in that template, like `https://user:password@example.com`.

## Release

1. Ensure everything is committed
2. Update the `CHANGELOG.md`
3. Commit and tag as `vX.Y.Z`
4. Push changes
