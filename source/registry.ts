#!/usr/bin/env deno run --env --allow-env --allow-net=api.github.com:443 --allow-net=pkg-containers.githubusercontent.com:443 --allow-read=.

import { Octokit } from 'octokit'
import { appConfig } from '../source/config.ts'
import { createDebug, localCached } from './lib.ts'
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

function fetchGitHubInfo(octokit: Octokit) {
	return localCached('registry', async () => {
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

		return { packages, images }
	})
}

function fetchDistributionInfo(
	client: DistributionClient,
	images: ContainerImage[],
) {
	return localCached('distribution', async () => {
		const output: any[] = []
		for (const image of images) {
			const entry = {
				name: image.name,
				tags: {} as any,
				config: {} as any,
			}
			output.push(entry)

			for (const tag of image.tags) {
				const manifest = await client.getManifest(image.name, tag)
				if (manifest) {
					if (
						manifest.mediaType ===
							'application/vnd.docker.distribution.manifest.v2+json'
					) {
						entry.config[manifest.config.digest] = await client.getJsonBlob(
							image.name,
							manifest.config.digest,
						)
					}
				}
				entry.tags[tag] = manifest
			}
		}
		return output
	})
}

export async function runRegistryBackup() {
	const octokit = new Octokit({
		auth: appConfig.github.token,
	})

	const { images } = await fetchGitHubInfo(octokit)

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

	const ghcr = new DistributionClient(appConfig.github.registry)
	ghcr.setBearer(token.token)

	const target = new DistributionClient('http://localhost:5000')

	// const distro = await fetchDistributionInfo(distrib, images)

	const dryRun = true

	for (const image of images) {
		for (const tag of image.tags) {
			debug('process %s:%s', image, tag)

			const exists = await target.headManifest(image, tag)
			if (exists) {
				debug('[skip]')
				continue
			}

			if (dryRun) {
				console.log('upload manifest %s:%s', image, tag)
			} else {
				// TODO: stream the manifest
				// const mani = await ghcr.streamManifest(image, tag)
			}

			const manifest = await ghcr.getManifest(image, tag)
			if (!manifest) throw new Error(`manifest not found ${image}:${tag}`)

			if (manifest.mediaType === 'application/vnd.oci.image.index.v1+json') {
				debug('oci.image.index.v1')
				for (const layer of manifest.manifests) {
					if (dryRun) {
						console.log('  upload blob')
					} else {
						// TODO: stream upload the blob
					}
				}
			}
			// if (manifest.mediaType === 'application/vnd.oci.image.manifest.v1+json') {

			// }
		}
	}

	// for (const image of images) {
	// 	debug(image.name)

	// 	for (const tag of image.tags) {
	// 		debug(' - ' + tag)

	// 		const manifest = await distrib.getManifest(image.name, tag)
	// 		if (!manifest) throw new Error('unknown manifest')

	// 		if (manifest.mediaType === 'application/vnd.oci.image.index.v1+json') {
	// 			for (const sub of manifest.manifests) {
	// 				console.log(sub.mediaType)
	// 			}
	// 		}
	// 		if (
	// 			manifest.mediaType ===
	// 				'application/vnd.docker.distribution.manifest.v2+json'
	// 		) {
	// 			console.log('')
	// 		}
	// 	}
	// }
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
