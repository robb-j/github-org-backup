#!/usr/bin/env deno run --env --allow-env --allow-net=api.github.com:443 --allow-read=.

import { Octokit } from 'octokit'
import { appConfig } from './config.ts'

const octokit = new Octokit({
	auth: appConfig.github.token,
})

interface Container {
	id: number
	name: string
	url: string
}

interface Version {
	id: number
	name: string
	url: string
	metadata: {
		package_type: 'container'
		container: { tags: string[] }
	}
}

const packages = await octokit.paginate<Container>('GET /orgs/{org}/packages', {
	org: appConfig.github.org,
	package_type: 'container',
	headers: { 'X-GitHub-Api-Version': '2022-11-28' },
})

for (const pkg of packages) {
	console.log('==== %s ====', pkg.name)

	const versions = await octokit.paginate<Version>(
		'GET /orgs/{org}/packages/{package_type}/{package_name}/versions',
		{
			org: appConfig.github.org,
			package_type: 'container',
			package_name: pkg.name,
			headers: { 'X-GitHub-Api-Version': '2022-11-28' },
		},
	)

	for (const version of versions) {
		if (Deno.args.includes('--list')) {
			console.log(version.name, version.metadata.container.tags)
			continue
		}

		const [tag, ...alternateTags] = version.metadata.container.tags

		if (!tag) {
			// console.debug('skip:', version.name)
			continue
		}

		const image = `ghcr.io/${appConfig.github.org}/${pkg.name}:${tag}`
		console.log(image, alternateTags)
	}

	console.log()
}

// https://github.com/octokit/octokit.js/issues/2079
Deno.exit(0)
