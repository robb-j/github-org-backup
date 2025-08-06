/** Execute a binary and get the status code, stdout & stderror */
export async function exec(
	command: URL | string,
	options: Deno.CommandOptions = {},
) {
	if (!options.stderr) options.stderr = 'inherit'
	if (!options.stdout) options.stdout = 'inherit'

	const cmd = new Deno.Command(command, options)
	const result = await cmd.output()

	const decoder = new TextDecoder()
	let stdout = ''
	let stderr = ''

	if (options.stdout === 'piped') {
		stdout = decoder.decode(result.stdout)
	}
	if (options.stderr === 'piped') {
		stderr = decoder.decode(result.stderr)
	}
	return {
		ok: result.code === 0,
		stdout,
		stderr,
	}
}

export async function getRemotes(path: string | URL, method = 'push') {
	const proc = await exec('git', {
		cwd: path,
		args: ['remote', '--verbose'],
		stdout: 'piped',
	})
	return proc.stdout.split('\n')
		.filter((v) => v)
		.map((line) => line.split(/\s+/))
		.map(([name, url, method]) => ({
			name,
			url,
			method: method.replace(/\(|\)/g, ''),
		}))
		.filter((v) => v.method === method)
		.reduce<Record<string, string>>(
			(map, value) => ({ ...map, [value.name]: value.url }),
			{},
		)
}

export function createDebug(namespace: string) {
	return (message: string, ...args: unknown[]) => {
		console.debug(`[${namespace}] ` + message, ...args)
	}
}

const cacheDir = new URL('../.cache/', import.meta.url)

export async function localCached<T>(
	name: string,
	factory: () => Promise<T>,
): Promise<T> {
	const path = new URL(name + '.json', cacheDir)
	try {
		const file = await Deno.readTextFile(path)
		return JSON.parse(file)
	} catch {
		const result = await factory()

		await Deno.mkdir(cacheDir, { recursive: true })
		await Deno.writeTextFile(path, JSON.stringify(result))
		return result
	}
}
