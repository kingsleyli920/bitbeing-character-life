import { buildApp } from './app.js';
import { loadConfig, loadEnvFile } from './config.js';

loadEnvFile();
const config = loadConfig();
const app = await buildApp({ config, logger: true });

try {
  await app.listen({ port: config.port, host: config.host });
  if (config.provider === 'openrouter' && !config.openrouterApiKey) {
    app.log.warn('未配置 OPENROUTER_API_KEY：页面可以浏览，但生成会失败。见 README「配置」。');
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
