#!/usr/bin/env deno run --env --allow-env --allow-write=. --allow-read=. --allow-net=api.github.com:443 --allow-run=git

import { Octokit } from 'octokit'
import { appConfig } from './config.ts'
import { exec, getRemotes } from './lib.ts'

interface Repo {
	name: string
	clone_url: string
}

const octokit = new Octokit({
	auth: appConfig.github.token,
})

// https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#list-organization-repositories
const repos = await octokit.paginate<Repo>(`GET /orgs/{org}/repos`, {
	org: appConfig.github.org,
	headers: { 'X-GitHub-Api-Version': '2022-11-28' },
})

const GITHUB_REMOTE = 'origin'
const BACKUP_REMOTE = 'backup'
const REPOS_DIR = 'repos'

async function backup(repo: Repo) {
	console.log('\n\n==== %s ====', repo.name)

	const directory = `${REPOS_DIR}/${repo.name}`
	const stat = await Deno.stat(`${directory}/.git`).catch(() => null)

	const githubRemote = new URL(repo.clone_url)
	githubRemote.username = appConfig.github.username
	githubRemote.password = appConfig.github.token

	if (!stat) {
		console.log('---- cloning ----')

		await Deno.mkdir(directory, { recursive: true })

		console.log('cloning', repo.name)
		const clone = await exec('git', {
			args: ['clone', '--origin', GITHUB_REMOTE, githubRemote.toString(), '.'],
			cwd: directory,
		})

		if (!clone.ok) {
			throw new Error('Failed to clone ' + githubRemote)
		}
	} else if (stat.isDirectory) {
		const remotes = await getRemotes(directory)

		if (remotes.origin !== githubRemote.toString()) {
			console.log('---- updating remote ----')

			const set = await exec('git', {
				args: ['remote', 'set-url', GITHUB_REMOTE, githubRemote.toString()],
				cwd: directory,
			})

			if (!set.ok) {
				throw new Error('Failed to set-url to ' + githubRemote)
			}
		}

		console.log('---- pulling ----')

		const pull = await exec('git', {
			args: ['pull', GITHUB_REMOTE],
			cwd: directory,
		})
		if (!pull.ok) {
			throw new Error('Failed to pull from ' + GITHUB_REMOTE)
		}
	} else {
		throw new Error('Unknown repo data')
	}

	const backupRemote = new URL(
		appConfig.target.template.replace('{repo}', repo.name),
	)

	const remotes = await getRemotes(directory, 'push')

	if (!remotes[BACKUP_REMOTE]) {
		console.log('---- adding backup remote ----')

		const add = await exec('git', {
			args: ['remote', 'add', BACKUP_REMOTE, backupRemote.toString()],
			cwd: directory,
		})

		if (!add.ok) {
			throw new Error('Failed to add remote ' + backupRemote)
		}
	} else if (remotes[BACKUP_REMOTE] !== backupRemote.toString()) {
		console.log('---- updating backup remote ----')

		const set = await exec('git', {
			args: ['remote', 'set-url', BACKUP_REMOTE, backupRemote.toString()],
			cwd: directory,
		})
		if (!set.ok) {
			throw new Error('Failed to set-url ' + backupRemote)
		}
	}

	console.log('---- pushing ----')
	const push = await exec('git', {
		args: ['push', BACKUP_REMOTE, '--all'],
		cwd: directory,
	})
	if (!push.ok) {
		throw new Error('Failed to push to ' + BACKUP_REMOTE)
	}
}

async function main() {
	if (Deno.args.includes('--list')) {
		for (const repo of repos) {
			console.log(repo.name)
		}
		return
	}

	let exitCode = 0
	const failures: Repo[] = []
	const tolerations = new Set(appConfig.tolerations)

	for (const repo of repos) {
		try {
			await backup(repo)
		} catch (error) {
			failures.push(repo)
			console.error('FAILURE: %s', repo.name)
			console.error(error)

			if (!tolerations.has(repo.name)) {
				exitCode = 1
			}
		}
	}

	if (failures.length > 0) {
		console.error('\n\nFAILURES:')
		for (const r of failures) console.error('- ' + r.name)
	}

	// https://github.com/octokit/octokit.js/issues/2079
	Deno.exit(exitCode)
}

main()
