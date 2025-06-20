#!/usr/bin/env deno run --env --allow-env --allow-net=api.github.com:443 --allow-read=.

import { Octokit } from 'octokit'
import { appConfig } from '../source/config.ts'
import { createDebug } from './lib.ts'
import { DistributionClient } from './distribution.ts'

interface Package {
	id: number
	name: string
	url: string
}

interface PackageVersion {
	id: number
	name: string
	url: string
	metadata: {
		package_type: 'container'
		container: { tags: string[] }
	}
}

interface ContainerImage {
	name: string
	tags: string[]
}

const debug = createDebug('registry')

export async function runRegistryBackup() {
	const octokit = new Octokit({
		auth: appConfig.github.token,
	})

	const packages = await octokit.paginate<Package>(
		'GET /orgs/{org}/packages',
		{
			org: appConfig.github.org,
			package_type: 'container',
			headers: { 'X-GitHub-Api-Version': '2022-11-28' },
		},
	)

	const images: ContainerImage[] = []

	for (const pkg of packages) {
		debug('list tags: ' + pkg.name)

		const versions = await octokit.paginate<PackageVersion>(
			'GET /orgs/{org}/packages/{package_type}/{package_name}/versions',
			{
				org: appConfig.github.org,
				package_type: 'container',
				package_name: pkg.name,
				headers: { 'X-GitHub-Api-Version': '2022-11-28' },
			},
		)

		images.push({
			name: `${appConfig.github.org}/${pkg.name}`,
			tags: versions.flatMap((v) => v.metadata.container.tags),
		})
	}

	if (Deno.args.includes('--list')) {
		for (const img of images) {
			console.log(img.name)
			for (const tag of img.tags) console.log(' - ' + tag)
			console.log()
		}
		return
	}

	const token = await getRegistryToken()
	if (!token) throw new Error('Failed to authenticate with ghcr.io')

	const distrib = new DistributionClient(appConfig.github.registry)
	distrib.setBearer(token.token)

	for (const image of images) {
		debug(image.name)

		for (const tag of image.tags) {
			debug(' - ' + tag)

			const manifest = await distrib.getManifest(image.name, tag)
			if (!manifest) throw new Error('unknown manifest')

			if (manifest.mediaType === 'application/vnd.oci.image.index.v1+json') {
				for (const sub of manifest.manifests) {
					console.log(sub.mediaType)
				}
			}
		}
	}
}

interface RegistryToken {
	token: string
}

async function getRegistryToken(): Promise<RegistryToken | null> {
	const endpoint = new URL('./token', appConfig.github.registry)
	const res = await fetch(endpoint, {
		headers: {
			Authorization: 'Basic ' +
				btoa(appConfig.github.username + ':' + appConfig.github.token),
		},
	})
	return res.ok ? res.json() : null
}
