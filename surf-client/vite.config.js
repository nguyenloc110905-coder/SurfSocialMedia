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
    var _a, _b, _c;
    var env = loadEnvFile(path.resolve(__dirname));
    return {
        plugins: [react()],
        resolve: {
            alias: { '@': path.resolve(__dirname, './src') },
        },
        define: {
            'import.meta.env.VITE_CLOUDINARY_CLOUD_NAME': JSON.stringify((_a = env.VITE_CLOUDINARY_CLOUD_NAME) !== null && _a !== void 0 ? _a : ''),
            'import.meta.env.VITE_CLOUDINARY_API_KEY': JSON.stringify((_b = env.VITE_CLOUDINARY_API_KEY) !== null && _b !== void 0 ? _b : ''),
            'import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET': JSON.stringify((_c = env.VITE_CLOUDINARY_UPLOAD_PRESET) !== null && _c !== void 0 ? _c : ''),
        },
        server: {
            port: 5173,
            proxy: {
                '/api': { target: 'http://localhost:4000', changeOrigin: true },
            },
        },
    };
});
