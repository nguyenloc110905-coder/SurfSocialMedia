import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

function loadEnvFile(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const file = path.join(dir, '.env');
  if (!fs.existsSync(file)) return out;
  const content = fs.readFileSync(file, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

export default defineConfig(() => {
  const env = loadEnvFile(path.resolve(__dirname));
  const defaultHttpsKeyPath = path.resolve(__dirname, 'certs/dev-key.pem');
  const defaultHttpsCertPath = path.resolve(__dirname, 'certs/dev-cert.pem');
  const httpsKeyPath = path.resolve(
    __dirname,
    env.VITE_DEV_HTTPS_KEY_FILE ?? defaultHttpsKeyPath,
  );
  const httpsCertPath = path.resolve(
    __dirname,
    env.VITE_DEV_HTTPS_CERT_FILE ?? defaultHttpsCertPath,
  );
  const httpsEnabled = Boolean(
    fs.existsSync(httpsKeyPath) && fs.existsSync(httpsCertPath),
  );

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    define: {
      'import.meta.env.VITE_CLOUDINARY_CLOUD_NAME': JSON.stringify(env.VITE_CLOUDINARY_CLOUD_NAME ?? ''),
      'import.meta.env.VITE_CLOUDINARY_API_KEY': JSON.stringify(env.VITE_CLOUDINARY_API_KEY ?? ''),
      'import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET': JSON.stringify(env.VITE_CLOUDINARY_UPLOAD_PRESET ?? ''),
    },
    server: {
      host: true,
      port: 5173,
      https: httpsEnabled
        ? {
            key: fs.readFileSync(httpsKeyPath!, 'utf-8'),
            cert: fs.readFileSync(httpsCertPath!, 'utf-8'),
          }
        : undefined,
      proxy: {
        '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true },
        '/socket.io': {
          target: 'http://127.0.0.1:4000',
          changeOrigin: true,
          ws: true,
        },
      },
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
      },
    },
  };
});
