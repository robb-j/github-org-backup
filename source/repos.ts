import { Octokit } from 'octokit'
import { appConfig } from './config.ts'
import {
	applyTemplate,
	createDebug,
	exec,
	getRemotes,
	localCached,
} from './lib.ts'

export interface Repo {
	name: string
	clone_url: string
}

// https://docs.github.com/en/rest/repos/repos?apiVersion=2022-11-28#list-organization-repositories
export function listRepos(octokit: Octokit) {
	return localCached(
		'repos',
		() =>
			octokit.paginate<Repo>(`GET /orgs/{org}/repos`, {
				org: appConfig.github.org,
				headers: { 'X-GitHub-Api-Version': '2022-11-28' },
			}),
	)
}

const debug = createDebug('repo')

export async function backup(repo: Repo) {
	debug('backup', repo.name)

	const directory = new URL(repo.name, appConfig.repos.dir)
	const stat = await Deno.stat(new URL(`${directory}/.git`)).catch(() => null)

	const githubRemote = new URL(repo.clone_url)
	githubRemote.username = appConfig.github.username
	githubRemote.password = appConfig.github.token

	if (!stat) {
		debug('- cloning', repo.clone_url)
		const clone = await exec('git', {
			args: [
				'clone',
				'--origin',
				appConfig.github.remoteName,
				githubRemote.toString(),
				'.',
			],
			cwd: directory,
		})

		if (!clone.ok) {
			throw new Error('Failed to clone ' + githubRemote)
		}
	} else if (stat.isDirectory) {
		const remotes = await getRemotes(directory)

		if (remotes[appConfig.github.remoteName] !== githubRemote.toString()) {
			debug('- updating github remote')

			const set = await exec('git', {
				args: [
					'remote',
					'set-url',
					appConfig.github.remoteName,
					githubRemote.toString(),
				],
				cwd: directory,
			})

			if (!set.ok) {
				throw new Error('Failed to set-url to ' + githubRemote)
			}
		}

		debug('- pulling from github')

		const pull = await exec('git', {
			args: ['pull', appConfig.github.remoteName],
			cwd: directory,
		})
		if (!pull.ok) {
			throw new Error('Failed to pull from github')
		}
	} else {
		throw new Error('Unknown repo data')
	}

	const backupRemote = new URL(
		applyTemplate(appConfig.target.remoteTemplate, { repo: repo.name }),
	)

	const remotes = await getRemotes(directory, 'push')

	if (!remotes[appConfig.target.remoteName]) {
		console.log('---- adding backup remote ----')

		const add = await exec('git', {
			args: [
				'remote',
				'add',
				appConfig.target.remoteName,
				backupRemote.toString(),
			],
			cwd: directory,
		})

		if (!add.ok) {
			throw new Error('Failed to add remote ' + backupRemote)
		}
	} else if (remotes[appConfig.target.remoteName] !== backupRemote.toString()) {
		console.log('---- updating backup remote ----')

		const set = await exec('git', {
			args: [
				'remote',
				'set-url',
				appConfig.target.remoteName,
				backupRemote.toString(),
			],
			cwd: directory,
		})
		if (!set.ok) {
			throw new Error('Failed to set-url ' + backupRemote)
		}
	}

	console.log('---- pushing ----')
	const push = await exec('git', {
		args: ['push', appConfig.target.remoteName, '--all'],
		cwd: directory,
	})
	if (!push.ok) {
		throw new Error('Failed to push to backup')
	}
}

export async function runRepoBackup() {
	const octokit = new Octokit({
		auth: appConfig.github.token,
	})

	const repos = await listRepos(octokit)

	if (Deno.args.includes('--list')) {
		for (const repo of repos) {
			console.log(repo.name)
		}
		return
	}

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
				Deno.exitCode = 1
			}
		}
	}

	if (failures.length > 0) {
		console.error('\n\nFAILURES:')
		for (const r of failures) console.error('- ' + r.name)
	}
}
