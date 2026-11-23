import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default defineConfig({
  root: path('./'),
  envDir: path('../../../apps/web/'),
  server: { host: '127.0.0.1', fs: { allow: [path('../../../')] } },
});
