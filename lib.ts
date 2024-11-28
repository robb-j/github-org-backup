/** Execute a binary and get the status code, stdout & stderror */
export async function exec(
	command: URL | string,
	options: Deno.CommandOptions = {},
) {
	if (!options.stderr) options.stderr = 'inherit'
	if (!options.stdout) options.stdout = 'inherit'

	const cmd = new Deno.Command(command, options)
	const result = await cmd.output()

	return {
		ok: result.code === 0,
	}
}
