#!/usr/bin/env deno run --env --allow-env --allow-write=. --allow-read=. --allow-net=api.github.com:443,ghcr.io:443 --allow-run=git

import { outputConfig } from './config.ts'
import { runRegistryBackup } from './registry.ts'
import { runRepoBackup } from './repos.ts'

const USAGE = `
commands:
  repos     backup all git repositories
  registry  backup all container images
  config    output app configuration and usage
  --help    show this help info
`

function main() {
	const [cmd = '<no command>'] = Deno.args

	if (Deno.args.includes('--help')) return console.log(USAGE)

	if (cmd === 'repos') return runRepoBackup()
	if (cmd === 'registry') return runRegistryBackup()
	if (cmd === 'config') return outputConfig()

	console.error('Unknown command: ' + cmd)
	console.error(USAGE)

	Deno.exit(1)
}

if (import.meta.main) main()
