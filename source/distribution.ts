import { createDebug } from './lib.ts'

export interface DistributionCatalog {
	repositories: string[]
}
export interface DistributionTag {
	name: string
	tags: string[]
}
export type DistributionManifest =
	| OciIndexV1
	| OciManifestV1
	| DockerManifestV2

//
// OCI stuff
//
export interface OciIndexV1 {
	mediaType: 'application/vnd.oci.image.index.v1+json'
	schemaVersion: 2
	manifests: OciManifestRefV1[]
}
export interface OciManifestRefV1 {
	mediaType: 'application/vnd.oci.image.manifest.v1+json'
	digest: string
	size: number
	platform: { architecture: string; os: string }
	annotations?: Record<string, string | undefined>
}
export interface OciManifestV1 {
	mediaType: 'application/vnd.oci.image.manifest.v1+json'
	schemaVersion: 2
	config: {
		digest: string
		mediaType: 'application/vnd.oci.image.config.v1+json'
		size: number
	}
	layers: OciLayerRefV1[]
}
export interface OciLayerRefV1 {
	digest: string
	mediaType: string
	size: number
}

//
// Docker stuff
//
export interface DockerManifestV2 {
	mediaType: 'application/vnd.docker.distribution.manifest.v2+json'
	schemaVersion: 2
	config: {
		mediaType: string
		digest: string
		size: number
	}
	layers: DockerLayerV2[]
}
export interface DockerLayerV2 {
	mediaType: string
	digest: string
	size: number
}

// interface RequestExtras {
// 	redirects?: number
// }

const MAX_REDIRECTS = 10
const redirectStatuses = new Set([301, 302, 303, 307, 308])

export class DistributionClient {
	debug = createDebug('distribution')

	url
	basic: string | null
	bearer: string | null
	constructor(url: string | URL) {
		this.url = new URL(url)
		this.basic = null
		this.bearer = null
	}

	setBasic(username: string, password: string) {
		this.basic = btoa(username + ':' + password)
		this.debug('basic=%o', this.basic)
	}
	setBearer(token: string) {
		this.bearer = token
	}

	async fetch(
		input: string | URL,
		init: RequestInit = {},
	) {
		const endpoint = new URL(input, this.url)
		const request = new Request(endpoint, init)

		if (this.basic) {
			request.headers.append('Authorization', `Basic ${this.basic}`)
		}
		if (this.bearer) {
			request.headers.append('Authorization', `Bearer ${this.bearer}`)
		}

		this.debug('fetch %o', endpoint.toString(), request.headers)

		try {
			const res = await fetch(request)
			if (!res.ok) {
				this.debug('failed status=%o', res.status, await res.json())
			}
			// if (redirectStatuses.has(res.status)) {
			// 	return this._follow(res, request)
			// }

			return res
		} catch (error) {
			console.error('ApiClient error', error)
			return null
		}
	}

	// async _follow(response: Response, request: Request) {
	// 	let attempts = 1
	// 	do {
	// 		if (!redirectStatuses.has(response.status)) return response

	// 		const location = response.headers.get('location')
	// 		if (!location) {
	// 			this.debug('invalid redirect - no location')
	// 			return null
	// 		}

	// 		this.debug('follow %o', location, request.headers)
	// 		response = await fetch(new Request(location, request))
	// 		attempts++
	// 	} while (attempts < MAX_REDIRECTS)

	// 	this.debug('max redirects reached')
	// 	return null
	// }

	// https://distribution.github.io/distribution/spec/api/#listing-repositories

	async catalog(): Promise<DistributionCatalog | null> {
		const res = await this.fetch('./v2/_catalog')
		return res?.ok ? res.json() : null
	}

	// https://distribution.github.io/distribution/spec/api/#listing-image-tags

	async listTags(repository: string): Promise<DistributionTag | null> {
		const res = await this.fetch(`./v2/${repository}/tags/list`)
		return res?.ok ? res.json() : null
	}

	// https://distribution.github.io/distribution/spec/api/#pulling-an-image-manifest
	async getManifest(
		repository: string,
		tag: string,
	): Promise<DistributionManifest | null> {
		const res = await this.fetch(`./v2/${repository}/manifests/${tag}`, {
			headers: [
				['Accept', 'application/vnd.oci.image.index.v1+json'],
				['Accept', 'application/vnd.oci.image.manifest.v1+json'],
				['Accept', 'application/vnd.docker.distribution.manifest.v2+json'],
			],
			redirect: 'follow',
		})
		return res?.ok ? res.json() : null
	}

	// https://distribution.github.io/distribution/spec/api/#pulling-a-layer

	async getBlob(
		repository: string,
		digest: string,
	) {
		const res = await this.fetch(`./v2/${repository}/blobs/${digest}`, {
			redirect: 'follow',
			headers: [
				['Accept', 'application/vnd.oci.image.manifest.v1+json'],
				['Accept', 'application/vnd.docker.distribution.manifest.v2+json'],
			],
		})
		return res?.ok ? res.body : null
	}

	// TODO: https://distribution.github.io/distribution/spec/api/#pushing-an-image
}
