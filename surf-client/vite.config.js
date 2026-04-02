import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
function loadEnvFile(dir) {
    var out = {};
    var file = path.join(dir, '.env');
    if (!fs.existsSync(file))
        return out;
    var content = fs.readFileSync(file, 'utf-8');
    for (var _i = 0, _a = content.split(/\r?\n/); _i < _a.length; _i++) {
        var line = _a[_i];
        var m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (m)
            out[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return out;
}
export default defineConfig(function () {
    var _a, _b, _c, _d, _e;
    var env = loadEnvFile(path.resolve(__dirname));
    var defaultHttpsKeyPath = path.resolve(__dirname, 'certs/dev-key.pem');
    var defaultHttpsCertPath = path.resolve(__dirname, 'certs/dev-cert.pem');
    var httpsKeyPath = path.resolve(__dirname, (_a = env.VITE_DEV_HTTPS_KEY_FILE) !== null && _a !== void 0 ? _a : defaultHttpsKeyPath);
    var httpsCertPath = path.resolve(__dirname, (_b = env.VITE_DEV_HTTPS_CERT_FILE) !== null && _b !== void 0 ? _b : defaultHttpsCertPath);
    var httpsEnabled = Boolean(fs.existsSync(httpsKeyPath) && fs.existsSync(httpsCertPath));
    return {
        plugins: [react()],
        resolve: {
            alias: { '@': path.resolve(__dirname, './src') },
        },
        define: {
            'import.meta.env.VITE_CLOUDINARY_CLOUD_NAME': JSON.stringify((_c = env.VITE_CLOUDINARY_CLOUD_NAME) !== null && _c !== void 0 ? _c : ''),
            'import.meta.env.VITE_CLOUDINARY_API_KEY': JSON.stringify((_d = env.VITE_CLOUDINARY_API_KEY) !== null && _d !== void 0 ? _d : ''),
            'import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET': JSON.stringify((_e = env.VITE_CLOUDINARY_UPLOAD_PRESET) !== null && _e !== void 0 ? _e : ''),
        },
        server: {
            host: true,
            port: 5173,
            https: httpsEnabled
                ? {
                    key: fs.readFileSync(httpsKeyPath, 'utf-8'),
                    cert: fs.readFileSync(httpsCertPath, 'utf-8'),
                }
                : undefined,
            proxy: {
                '/api': { target: 'http://localhost:4000', changeOrigin: true },
                '/socket.io': {
                    target: 'http://localhost:4000',
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
