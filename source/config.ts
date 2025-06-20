#!/usr/bin/env deno run --env --allow-env --allow-read=app-config.json

import { getConfiguration, Structure } from 'gruber'

const config = getConfiguration()

const AppConfig = config.object({
	env: config.string({ variable: 'DENO_ENV', fallback: 'development' }),
	github: config.object({
		org: config.string({
			variable: 'GITHUB_ORG',
			fallback: 'geoff-org',
		}),
		token: config.string({ variable: 'GITHUB_TOKEN', fallback: '' }),
		username: config.string({
			variable: 'GITHUB_USERNAME',
			fallback: 'geoff-testington',
		}),
		remoteName: config.string({
			variable: 'GITHUB_REMOTE',
			fallback: 'origin',
		}),
		registry: config.url({
			variable: 'GITHUB_REGISTRY',
			fallback: 'https://ghcr.io',
		}),
	}),
	target: config.object({
		template: config.string({
			variable: 'TARGET_TEMPLATE',
			fallback: 'https://example.com/organisation/{repo}.git',
		}),
		remoteName: config.string({
			variable: 'BACKUP_REMOTE',
			fallback: 'backup',
		}),
	}),
	tolerations: Structure.array(
		Structure.string(),
	),
	repos: config.object({
		dir: config.url({
			variable: 'REPOS_DIR',
			fallback: new URL('../repos/', import.meta.url),
		}),
	}),
})

export const appConfig = await config.load(
	new URL('../app-config.json', import.meta.url),
	AppConfig,
)

export function outputConfig() {
	console.log(config.getUsage(AppConfig, appConfig))
}
