import { sites } from '@openai/sites-vite-plugin';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import hostingConfig from './.openai/hosting.json';

const placeholderDatabaseId = '00000000-0000-4000-8000-000000000000';
const isSeatbelt = process.env.CODEX_SANDBOX === 'seatbelt';

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    server: isSeatbelt ? { watch: { useFsEvents: false, usePolling: true } } : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: {
          main: 'vinext/server/fetch-handler',
          d1_databases: hostingConfig.d1 ? [{ binding: hostingConfig.d1, database_name: 'baejeong-course-planner', database_id: placeholderDatabaseId }] : [],
        },
      }),
    ],
  };
});
