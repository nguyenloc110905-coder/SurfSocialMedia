import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Luôn dùng thư mục chứa script (surf-client/scripts) -> cha = surf-client, không phụ thuộc cwd
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const outPath = path.join(root, 'public', 'cloudinary-config.js');

let cloudName = '';
let apiKey = '';
let uploadPreset = '';

if (fs.existsSync(envPath)) {
  let content = fs.readFileSync(envPath, 'utf-8');
  content = content.replace(/^\uFEFF/, ''); // BOM
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*VITE_CLOUDINARY_(CLOUD_NAME|API_KEY|UPLOAD_PRESET)\s*=\s*(.*)$/);
    if (m) {
      const val = (m[2] || '').trim().replace(/^["']|["']$/g, '');
      if (m[1] === 'CLOUD_NAME') cloudName = val;
      if (m[1] === 'API_KEY') apiKey = val;
      if (m[1] === 'UPLOAD_PRESET') uploadPreset = val;
    }
  }
}

const js = `// Auto-generated from .env - do not edit
window.__CLOUDINARY_CONFIG__ = {
  cloudName: ${JSON.stringify(cloudName)},
  apiKey: ${JSON.stringify(apiKey)},
  uploadPreset: ${JSON.stringify(uploadPreset)}
};
`;

fs.writeFileSync(outPath, js, 'utf-8');
const ok = !!(cloudName && apiKey && uploadPreset);
console.log(ok ? '[Cloudinary] Wrote public/cloudinary-config.js (OK)' : '[Cloudinary] Wrote public/cloudinary-config.js - KHÔNG có giá trị từ .env, kiểm tra file .env và chạy từ thư mục surf-client');
