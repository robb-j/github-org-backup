#!/usr/bin/env deno run --env --allow-env --allow-net=api.github.com:443 --allow-net=pkg-containers.githubusercontent.com:443 --allow-read=.

import { Octokit } from 'octokit'
import { appConfig } from '../source/config.ts'
import { createDebug, localCached } from './lib.ts'
import {
	DistributionClient,
	DistributionManifest,
	MediaType,
} from './distribution.ts'
import { OciDescriptorV1 } from './distribution.ts'

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

/** This is useful to fetch all meta-info for inspecting and planning */
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
				blobs: {} as any,
			}
			output.push(entry)

			for (const tag of image.tags) {
				const manifest = await client.getManifest(image.name, tag)
				entry.tags[tag] = manifest
				if (!manifest) continue

				if (
					manifest.mediaType === MediaType.docker.distribution.manifest.v2 &&
					manifest.config
				) {
					entry.blobs[manifest.config.digest] = await client.getJsonBlob(
						image.name,
						manifest.config.digest,
					)
				}

				if (manifest.mediaType === MediaType.oci.image.index.v1) {
					for (const childDesc of manifest.manifests) {
						const child = await client.getManifest(
							image.name,
							childDesc.digest,
						)
						entry.blobs[childDesc.digest] = child
						if (
							child?.mediaType === MediaType.oci.image.manifest.v1 &&
							child.config
						) {
							entry.blobs[child.config.digest] = await client.getJsonBlob(
								image.name,
								child.config.digest,
							)
						}
					}
				}
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

	// const target = stubDistributionClient() // 'debug' mode
	const target = new DistributionClient('http://localhost:5001')

	// return await fetchDistributionInfo(ghcr, images)

	const stats = {
		blobs: 0,
		ociIndex: 0,
		ociManifest: {
			root: 0,
			child: 0,
		},
		dockerManifest: 0,
		total: 0,
	}

	for (const image of images) {
		for (const tag of image.tags) {
			debug('process %s:%s', image.name, tag)

			const manifest = await ghcr.getManifest(image.name, tag)
			if (!manifest) throw new Error('manifest not found')

			if (manifest.mediaType === MediaType.oci.image.index.v1) {
				debug('oci.image.index.v1')
				stats.ociIndex++

				for (const manifestDesc of manifest.manifests) {
					const child = await ghcr.getManifest(image.name, manifestDesc.digest)
					if (!child) throw new Error('manifest not found')

					if (child.mediaType === MediaType.oci.image.manifest.v1) {
						// Copy the child manifest's config
						if (child.config) {
							stats.blobs += await copyBlob(
								ghcr,
								image.name,
								child.config,
								target,
							)
						}

						// Copy each blob layer
						for (const layerDesc of child.layers) {
							stats.blobs += await copyBlob(ghcr, image.name, layerDesc, target)
						}
					}

					// Copy the child manifest
					await copyManifest(
						ghcr,
						image.name,
						manifestDesc.digest,
						child,
						target,
					)
					stats.ociManifest.child++
				}
			}
			if (manifest.mediaType === MediaType.oci.image.manifest.v1) {
				debug('oci.image.manifest.v1')
				stats.ociManifest.root++

				if (manifest.config) {
					stats.blobs += await copyBlob(
						ghcr,
						image.name,
						manifest.config,
						target,
					)
				}

				for (const layer of manifest.layers) {
					stats.blobs += await copyBlob(ghcr, image.name, layer, target)
				}
			}

			if (manifest.mediaType === MediaType.docker.distribution.manifest.v2) {
				debug('docker.distribution.manifest.v2')
				stats.dockerManifest++

				if (manifest.config) {
					stats.blobs += await copyBlob(
						ghcr,
						image.name,
						manifest.config,
						target,
					)
				}

				for (const layer of manifest.layers) {
					stats.blobs += await copyBlob(ghcr, image.name, layer, target)
				}
			}

			stats.total += await copyManifest(ghcr, image.name, tag, manifest, target)
		}

		if (stats.total > 10) break
	}

	console.log('stats', stats)
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

async function copyManifest(
	source: DistributionClient,
	repository: string,
	reference: string,
	manifest: DistributionManifest,
	target: DistributionClient,
) {
	const exists = await target.headManifest(repository, reference)

	debug(
		'copy manifest exists=%o %s@%s',
		exists,
		repository,
		reference,
		manifest.mediaType,
	)

	if (exists) {
		return 0
	}

	// Request the manifest from the source client
	const res = await source.fetchManifest(repository, reference)
	if (!res?.body) throw new Error('manifest not found')

	// Stream the raw manifest to the target client
	await target.putManifest(repository, reference, manifest.mediaType, res.body)

	return 1
}

async function copyBlob<T>(
	source: DistributionClient,
	repository: string,
	desc: OciDescriptorV1,
	target: DistributionClient,
) {
	const exists = await target.headBlob(repository, desc.digest)

	debug('copy blob exists=%o %s@%s ', exists, repository, desc.digest)

	if (exists) {
		return 0
	}

	// Request the blob from the source client
	const res = await source.fetchBlob(repository, desc.digest)
	if (!res?.body) throw new Error('blob not found')

	// Stream the raw blob to the target client
	const success = await target.putBlob(repository, desc, res.body)
	if (!success) throw new Error('failed to upload')

	return 1
}
