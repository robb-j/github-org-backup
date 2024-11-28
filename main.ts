#!/usr/bin/env deno run --env --allow-env --allow-write=. --allow-read=. --allow-net=api.github.com:443 --allow-run=git

import { Octokit } from 'octokit'
import { appConfig } from './config.ts'
import { exec } from './lib.ts'

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

const reposDir = 'repos'

for (const repo of repos) {
	if (Deno.args.includes('--list')) {
		console.log(repo.name)
		continue
	}

	console.log('\n\n==== %s ====', repo.name)

	const directory = `${reposDir}/${repo.name}`
	const stat = await Deno.stat(`${directory}/.git`).catch((error) => {
		console.error(error)
		return null
	})

	if (!stat) {
		console.log('---- cloning ----')
		const url = new URL(repo.clone_url)
		url.username = appConfig.github.username
		url.password = appConfig.github.token

		await Deno.mkdir(directory, { recursive: true })

		console.log('cloning', repo.name)
		const clone = await exec('git', {
			args: ['clone', url.toString(), '.'],
			cwd: directory,
		})

		if (!clone.ok) {
			throw new Error('Failed to clone ' + url.toString())
		}
	} else if (stat.isDirectory) {
		console.log('---- pulling ----')
		const pull = await exec('git', {
			args: ['pull'],
			cwd: directory,
		})
		if (!pull.ok) {
			throw new Error('Failed to pull ' + directory)
		}
	} else {
		throw new Error('Unknown repo ' + directory)
	}

	// Add backup remote
	const remoteName = 'backup'
	const remoteUrl = new URL(
		appConfig.target.template.replace('{repo}', repo.name),
	).toString()

	console.log('---- adding remote ----', remoteUrl)
	await exec('git', {
		args: ['remote', 'remove', remoteName],
		cwd: directory,
		stderr: 'null',
	})
	await exec('git', {
		args: ['remote', 'add', remoteName, remoteUrl],
		cwd: directory,
	})

	console.log('---- pushing ----')
	await exec('git', {
		args: ['push', remoteName, '--all'],
		cwd: directory,
	})
}

// https://github.com/octokit/octokit.js/issues/2079
Deno.exit(0)
