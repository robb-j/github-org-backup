#!/usr/bin/env deno run --env --allow-env --allow-read=app-config.json

import { getConfiguration, StructError, Structure } from 'gruber'

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
	}),
	target: config.object({
		template: config.string({
			variable: 'TARGET_TEMPLATE',
			fallback: 'https://example.com/organisation/{repo}.git',
		}),
	}),
	tolerations: config.array(
		Structure.string(),
	),
})

export const appConfig = await config.load(
	new URL('app-config.json', import.meta.url),
	AppConfig,
)

if (import.meta.main) {
	console.log(config.getUsage(AppConfig, appConfig))
}
