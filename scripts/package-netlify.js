#!/usr/bin/env node
import { existsSync, mkdirSync, cpSync, rmSync, statSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'));
const APP_VERSION = pkg.version || '1.1.0';
const APP_NAME = pkg.name || 'mcp-tthc-netlify';
const APP_AUTHOR = pkg.author || 'KynChou';
const distDir = resolve(rootDir, 'dist');
const netlifyDeployDir = resolve(distDir, 'netlify-deploy');
const zipFile = resolve(distDir, `${APP_NAME}-v${APP_VERSION}-netlify.zip`);

console.log(`\n=============================================================`);
console.log(`  ĐÓNG GÓI BUILD NETLIFY - ${APP_NAME} (v${APP_VERSION})`);
console.log(`  Tác giả: ${APP_AUTHOR}`);
console.log(`=============================================================\n`);

try {
  // 1. Tạo các thư mục đầu ra
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  if (existsSync(netlifyDeployDir)) {
    rmSync(netlifyDeployDir, { recursive: true, force: true });
  }
  mkdirSync(netlifyDeployDir, { recursive: true });
  mkdirSync(resolve(netlifyDeployDir, 'netlify/functions'), { recursive: true });

  // 2. Sinh mã nhúng giao diện và bundle Netlify Functions bằng esbuild
  console.log('[1/4] Đang sinh mã nhúng giao diện và đóng gói Netlify Function (mcp.ts)...');
  execSync('node scripts/generate-assets.js', { cwd: rootDir, stdio: 'inherit' });
  execSync('node scripts/build-plugin.js', { cwd: rootDir, stdio: 'inherit' });

  const entryFunction = resolve(rootDir, 'netlify/functions/mcp.ts');
  const outFunctionJs = resolve(distDir, 'netlify/functions/mcp.js');
  const outDeployFunctionMjs = resolve(netlifyDeployDir, 'netlify/functions/mcp.mjs');
  const outDeployFunctionJs = resolve(netlifyDeployDir, 'netlify/functions/mcp.js');

  mkdirSync(resolve(distDir, 'netlify/functions'), { recursive: true });

  const esbuildCommand = `npx esbuild "${entryFunction}" --bundle --platform=node --target=node20 --format=esm --outfile="${outDeployFunctionMjs}" --minify-whitespace --minify-syntax`;
  execSync(esbuildCommand, { cwd: rootDir, stdio: 'inherit' });

  // Tạo thêm bản sao .js cho tương thích tối đa
  cpSync(outDeployFunctionMjs, outDeployFunctionJs);
  cpSync(outDeployFunctionMjs, outFunctionJs);

  const functionSize = (statSync(outDeployFunctionMjs).size / 1024).toFixed(1);
  console.log(`[PASS] Đã đóng gói Netlify Function: ${functionSize} KB`);

  // 3. Sao chép tài nguyên Static Web & Cấu hình Netlify
  console.log('[2/4] Đang sao chép giao diện Web (public/) & cấu hình Netlify...');
  const publicDir = resolve(rootDir, 'public');
  const deployPublicDir = resolve(netlifyDeployDir, 'public');
  cpSync(publicDir, deployPublicDir, { recursive: true });

  // Đồng thời sao chép các tệp tĩnh ra thẳng root của gói deploy để Netlify Drop nhận diện trang chủ ngay lập tức
  for (const f of ['index.html', 'style.css', 'app.js', 'logo.svg', 'openapi.json', 'plugin.json', 'mcp.json', '.mcp.json']) {
    const srcFile = resolve(publicDir, f);
    if (existsSync(srcFile)) {
      cpSync(srcFile, resolve(netlifyDeployDir, f));
    }
  }

  // Tạo netlify.toml tối ưu cho gói deploy (bỏ build command vì function đã được biên dịch sẵn)
  let netlifyToml = readFileSync(resolve(rootDir, 'netlify.toml'), 'utf-8');
  netlifyToml = netlifyToml.replace(
    /command\s*=\s*"[^"]*"/g,
    'command = "echo \'Gói đã được biên dịch sẵn, sẵn sàng triển khai.\'"'
  );
  writeFileSync(resolve(netlifyDeployDir, 'netlify.toml'), netlifyToml, 'utf-8');

  // Tạo package.json an toàn cho bản deploy (tránh Netlify gọi tsc bị lỗi thiếu file mã nguồn)
  const deployPkg = {
    ...pkg,
    scripts: {
      ...pkg.scripts,
      "build": "echo \"Gói đã được biên dịch sẵn. Bỏ qua bước build.\"",
      "build:netlify": "echo \"Gói đã được biên dịch sẵn. Bỏ qua bước build.\"",
      "package:netlify": "echo \"Gói đã được biên dịch sẵn.\""
    }
  };
  writeFileSync(resolve(netlifyDeployDir, 'package.json'), JSON.stringify(deployPkg, null, 2), 'utf-8');

  if (existsSync(resolve(rootDir, 'tsconfig.json'))) {
    cpSync(resolve(rootDir, 'tsconfig.json'), resolve(netlifyDeployDir, 'tsconfig.json'));
  }
  if (existsSync(resolve(rootDir, 'plugin.json'))) {
    cpSync(resolve(rootDir, 'plugin.json'), resolve(netlifyDeployDir, 'plugin.json'));
  }
  if (existsSync(resolve(rootDir, 'mcp.json'))) {
    cpSync(resolve(rootDir, 'mcp.json'), resolve(netlifyDeployDir, 'mcp.json'));
  }
  if (existsSync(resolve(rootDir, '.mcp.json'))) {
    cpSync(resolve(rootDir, '.mcp.json'), resolve(netlifyDeployDir, '.mcp.json'));
  }
  if (existsSync(resolve(rootDir, '.codex-plugin'))) {
    cpSync(resolve(rootDir, '.codex-plugin'), resolve(netlifyDeployDir, '.codex-plugin'), { recursive: true });
  }
  if (existsSync(resolve(rootDir, '.cursor'))) {
    cpSync(resolve(rootDir, '.cursor'), resolve(netlifyDeployDir, '.cursor'), { recursive: true });
  }
  if (existsSync(resolve(rootDir, 'claude_desktop_config.json'))) {
    cpSync(resolve(rootDir, 'claude_desktop_config.json'), resolve(netlifyDeployDir, 'claude_desktop_config.json'));
  }
  if (existsSync(resolve(rootDir, 'mcp-config.json'))) {
    cpSync(resolve(rootDir, 'mcp-config.json'), resolve(netlifyDeployDir, 'mcp-config.json'));
  }
  if (existsSync(resolve(rootDir, 'continue_config.json'))) {
    cpSync(resolve(rootDir, 'continue_config.json'), resolve(netlifyDeployDir, 'continue_config.json'));
  }
  if (existsSync(resolve(rootDir, '.env.example'))) {
    cpSync(resolve(rootDir, '.env.example'), resolve(netlifyDeployDir, '.env.example'));
  }
  if (existsSync(resolve(rootDir, 'README.md'))) {
    cpSync(resolve(rootDir, 'README.md'), resolve(netlifyDeployDir, 'README.md'));
  }
  console.log('[PASS] Đã đồng bộ tài nguyên tĩnh, giao diện Web và cấu hình Plugin Netlify.');

  // 4. Tạo gói ZIP nén triển khai
  console.log('[3/4] Đang nén gói triển khai Netlify ZIP...');
  if (existsSync(zipFile)) {
    rmSync(zipFile, { force: true });
  }

  // Nén nội dung thư mục netlifyDeployDir
  execSync(`cd "${netlifyDeployDir}" && zip -r -q "${zipFile}" .`, { stdio: 'inherit' });
  const zipSize = (statSync(zipFile).size / 1024).toFixed(1);
  console.log(`[PASS] Đã tạo file nén: ${zipFile} (${zipSize} KB)`);

  // 5. Thống kê kết quả
  console.log('\n[4/4] TỔNG HỢP GÓI ĐÓNG GÓI BUILD NETLIFY:');
  console.log(`-------------------------------------------------------------`);
  console.log(`- Phiên bản ứng dụng:   v${APP_VERSION}`);
  console.log(`- Thư mục deploy:       dist/netlify-deploy/`);
  console.log(`  + Web Public:         dist/netlify-deploy/public/`);
  console.log(`  + Netlify Functions:  dist/netlify-deploy/netlify/functions/mcp.mjs`);
  console.log(`  + Cấu hình:           dist/netlify-deploy/netlify.toml`);
  console.log(`- File ZIP trọn gói:    dist/${APP_NAME}-v${APP_VERSION}-netlify.zip (${zipSize} KB)`);
  console.log(`-------------------------------------------------------------`);
  console.log(`CÁC CÁCH TRIỂN KHAI LÊN NETLIFY:`);
  console.log(`1. Git CI/CD: Đẩy mã nguồn lên GitHub/GitLab, Netlify tự build`);
  console.log(`   Command: npm run build:netlify | Publish: public | Functions: netlify/functions`);
  console.log(`2. Netlify CLI:`);
  console.log(`   npx netlify deploy --prod --dir=dist/netlify-deploy/public --functions=dist/netlify-deploy/netlify/functions`);
  console.log(`3. Netlify Drop (Thủ công):`);
  console.log(`   Kéo thả thư mục 'dist/netlify-deploy' hoặc file ZIP vào trang app.netlify.com/drop`);
  console.log(`=============================================================\n`);
} catch (error) {
  console.error('\n[LỖI] Đóng gói build Netlify thất bại:', error);
  process.exit(1);
}
