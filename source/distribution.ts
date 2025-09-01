import { createDebug } from './lib.ts'

export interface DistributionCatalog {
	repositories: string[]
}
export interface DistributionTag {
	name: string
	tags: string[]
}

export type DistributionManifest =
	| OciImageIndexV1
	| OciManifestV1
	| DockerManifestV2

export const MediaType = {
	oci: {
		image: {
			index: {
				v1: 'application/vnd.oci.image.index.v1+json',
			},
			manifest: {
				v1: 'application/vnd.oci.image.manifest.v1+json',
			},
			config: {
				v1: 'application/vnd.oci.image.config.v1+json',
			},
		},
	},
	docker: {
		distribution: {
			manifest: {
				v2: 'application/vnd.docker.distribution.manifest.v2+json',
			},
		},
		container: {
			image: {
				v1: 'application/vnd.docker.container.image.v1+json',
			},
		},
	},
} as const

//
// OCI stuff
//

/**
 * The latest non-docker format for an index of multiplatform manifests
 *
 * https://specs.opencontainers.org/image-spec/image-index/?v=v1.0.1
 */
export interface OciImageIndexV1 {
	mediaType: 'application/vnd.oci.image.index.v1+json'
	schemaVersion: 2
	manifests: OciManifestDescriptorV1[]
}

/**
 * A manifest within an {@link OciImageIndexV1}
 * which is a {@link OciDescriptorV1} with extra properties
 *
 * https://specs.opencontainers.org/image-spec/descriptor/?v=v1.0.1
 */
export interface OciManifestDescriptorV1 {
	mediaType: 'application/vnd.oci.image.manifest.v1+json'
	digest: string
	size: number
	platform: { architecture: string; os: string }
	annotations?: Record<string, string | undefined>
}

/**
 * A manifest describing the config and layers of an image
 *
 * https://specs.opencontainers.org/image-spec/manifest/?v=v1.0.1
 */
export interface OciManifestV1 {
	mediaType: 'application/vnd.oci.image.manifest.v1+json'
	schemaVersion: 2
	config?: {
		digest: string
		mediaType: 'application/vnd.oci.image.config.v1+json'
		size: number
	}
	layers: OciDescriptorV1[]
}

/**
 * A reference to something else
 */
export interface OciDescriptorV1 {
	digest: string
	mediaType: string
	size: number
}

/*
 * might be useful:
 * https://specs.opencontainers.org/image-spec/config/?v=v1.0.1#properties
 */

//
// Docker stuff
//

/** The old format docker manifest where you can request the `config` to get the different layers */
export interface DockerManifestV2 {
	mediaType: 'application/vnd.docker.distribution.manifest.v2+json'
	schemaVersion: 2
	config?: {
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

		this.debug('fetch %o', endpoint.toString())

		try {
			const res = await fetch(request)

			// if (!res.ok && res.status !== 404) {
			// 	this.debug(
			// 		'failed status=%o',
			// 		res.status,
			// 		res.body ? await res.text() : '',
			// 	)
			// }

			// if (redirectStatuses.has(res.status)) {
			// 	return this._follow(res, request)
			// }

			return res
		} catch (error) {
			console.error('ApiClient error', error)
			throw new Error('ApiClient error' + error)
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
		return res.ok ? res.json() : null
	}

	// https://distribution.github.io/distribution/spec/api/#listing-image-tags

	async listTags(repository: string): Promise<DistributionTag | null> {
		const res = await this.fetch(`./v2/${repository}/tags/list`)
		return res.ok ? res.json() : null
	}

	// https://distribution.github.io/distribution/spec/api/#pulling-an-image-manifest
	fetchManifest(repository: string, tag: string, init: RequestInit = {}) {
		return this.fetch(`./v2/${repository}/manifests/${tag}`, {
			headers: [
				['Accept', 'application/vnd.oci.image.index.v1+json'],
				['Accept', 'application/vnd.oci.image.manifest.v1+json'],
				['Accept', 'application/vnd.docker.distribution.manifest.v2+json'],
			],
			redirect: 'follow',
			...init,
		})
	}

	async getManifest(
		repository: string,
		tag: string,
	): Promise<DistributionManifest | null> {
		const res = await this.fetchManifest(repository, tag)
		return res.ok ? res.json() : null
	}

	async headManifest(
		repository: string,
		tag: string,
	) {
		const res = await this.fetchManifest(repository, tag, {
			method: 'HEAD',
		})
		// if (res?.ok) console.log(res)

		return res.ok ?? false
	}

	// https://distribution.github.io/distribution/spec/api/#pushing-an-image-manifest

	putManifest(
		repository: string,
		reference: string,
		mediaType: string,
		body: BodyInit,
	) {
		return this.fetch(`./v2/${repository}/manifests/${reference}`, {
			method: 'PUT',
			headers: {
				'Content-Type': mediaType,
			},
			body,
		})
	}

	// https://distribution.github.io/distribution/spec/api/#pulling-a-layer

	fetchBlob(repository: string, digest: string, init: RequestInit = {}) {
		return this.fetch(`./v2/${repository}/blobs/${digest}`, {
			redirect: 'follow',
			headers: [
				['Accept', 'application/vnd.oci.image.manifest.v1+json'],
				['Accept', 'application/vnd.docker.distribution.manifest.v2+json'],
			],
		})
	}

	async getBlob(
		repository: string,
		digest: string,
	) {
		const res = await this.fetchBlob(repository, digest)
		return res.ok ? res.body : null
	}

	async getJsonBlob(
		repository: string,
		digest: string,
	) {
		const res = await this.fetchBlob(repository, digest)
		return res.ok ? res.json() : null
	}

	async headBlob(
		repository: string,
		digest: string,
	) {
		const res = await this.fetchBlob(repository, digest, {
			method: 'HEAD',
		})
		// if (res?.ok) console.log(res)
		return res.ok ?? null
	}

	// https://distribution.github.io/distribution/spec/api/#monolithic-upload
	async putBlob(
		repository: string,
		{ digest, size }: OciDescriptorV1,
		body: BodyInit,
	) {
		// const head = await this.headBlob(repository, digest)
		// if (head) return

		const start = await this.fetch(`./v2/${repository}/blobs/uploads/`, {
			method: 'POST',
		})
		if (!start.ok) throw new Error('cannot upload')

		// ~ /v2/<name>/blobs/uploads/<uuid>
		const location = this.resolve(start.headers.get('location')!)
		location?.searchParams.set('digest', digest)

		const upload = await this.fetch(location, {
			method: 'PUT',
			headers: {
				'Content-Length': size.toString(),
				'Content-Type': 'application/octet-stream',
			},
			body,
		})
		return upload.ok
	}

	async putBlobV2(
		repository: string,
		{ digest, size }: OciDescriptorV1,
		body: ReadableStream<Uint8Array>,
	) {
		// const head = await this.headBlob(repository, digest)
		// if (head) return

		// Start the upload and get an uuid to send to
		// https://distribution.github.io/distribution/spec/api/#starting-an-upload
		const start = await this.fetch(`./v2/${repository}/blobs/uploads/`, {
			method: 'POST',
			headers: {
				'Content-Length': '0',
			},
		})
		if (start.status !== 202) throw new Error('failed to start upload')

		// https://distribution.github.io/distribution/spec/api/#uploading-the-layer
		let location = this.resolve(start.headers.get('Location')!)

		const minChunkSize = 1_024 * 1_024

		let offset = 0
		let buffer = new Uint8Array()

		// Loop through each chunk of the body
		for await (const chunk of body) {
			// Merge the chunk into previous failed attempts
			buffer = mergeBytes(buffer, chunk)

			if (buffer.byteLength < minChunkSize) continue

			// Upload the chunk
			// https://distribution.github.io/distribution/spec/api/#chunked-upload
			this.debug(
				'upload %d-%d / %d',
				offset,
				offset + buffer.byteLength - 1,
				size,
			)
			const upload = await this.fetch(
				location,
				{
					method: 'PATCH',
					body: buffer,
					headers: {
						'Content-Length': `${buffer.byteLength}`,
						'Content-Range': `${offset}-${offset + buffer.byteLength - 1}`,
						'Content-Type': 'application/octet-stream',
					},
				},
			)

			if (upload.status === 416) {
				this.debug('upload - 416 too small')
				// this indicates the chunk was too small
				// TODO: get "offset" from the Range header
				// offset = parseInt(upload.headers.get('Range')!.split('-')[1])
				continue
			}

			if (!upload.ok) {
				console.error('Upload error', await upload.text())
				throw new Error('Upload failed')
			}

			location = this.resolve(upload.headers.get('Location')!)

			offset += buffer.byteLength
			buffer = new Uint8Array()
		}

		// if (buffer.byteLength > 0) throw new Error('Something went wrong')

		// Complete the upload & send remaining bytes
		// https://distribution.github.io/distribution/spec/api/#completed-upload
		const completeUrl = new URL(location)
		completeUrl.searchParams.set('digest', digest)

		const complete = await this.fetch(completeUrl, {
			method: 'PUT',
			body: buffer,
			headers: {
				'Content-Length': `${buffer.byteLength}`,
				'Content-Range': `${offset}-${offset + buffer.byteLength - 1}`,
				'Content-Type': 'application/octet-stream',
			},
		})

		if (complete.status !== 201) {
			console.error('Upload error', await complete.text())
			throw Error('Failed to upload blob')
		}
	}

	async mountBlob(
		repository: string,
		{ digest }: OciDescriptorV1,
		otherRepository: string,
	) {
		const endpoint = this.resolve(`./v2/${repository}/blobs/uploads/`)
		endpoint.searchParams.set('mount', digest)
		endpoint.searchParams.set('from', otherRepository)

		const res = await this.fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Length': '0',
			},
		})
		return res.ok ?? false
	}

	resolve(urlOrPath: string) {
		if (urlOrPath.startsWith('/')) return new URL('.' + urlOrPath, this.url)
		return new URL(urlOrPath, this.url)
	}

	// TODO: https://distribution.github.io/distribution/spec/api/#pushing-an-image
}

export function stubDistributionClient(): DistributionClient {
	return new Proxy<any>({}, {
		get(_t, property) {
			return (...args: any[]) => {
				// console.log('[distrib] %s', property, args)
			}
		},
	})
}

// https://stackoverflow.com/questions/49129643/how-do-i-merge-an-array-of-uint8arrays
function mergeBytes(...arrays: Uint8Array[]) {
	const output = new Uint8Array(
		arrays.reduce((sum, arr) => sum + arr.byteLength, 0),
	)
	let offset = 0
	for (const arr of arrays) {
		output.set(arr, offset)
		offset += arr.byteLength
	}
	return output
}
