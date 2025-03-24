#!/usr/bin/env deno run --env -A

import { getRemotes } from './lib.ts'

// deno-lint-ignore no-explicit-any
const commands: any = {
	async remote(path = '.', method = 'push') {
		console.log(await getRemotes(path, method))
	},
}

const [cmd, ...args] = Deno.args

if (!commands[cmd]) throw new Error('Invalid command')

await commands[cmd]?.(...args)
