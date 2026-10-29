#!/usr/bin/env node
import { existsSync, mkdirSync, cpSync, rmSync, statSync, readFileSync, writeFileSync } from 'node:fs';
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
const tempStagingDir = resolve(distDir, 'temp-build-stage');
const buildZipFile = resolve(distDir, `mcp-tthc-v${APP_VERSION}-build.zip`);

console.log(`\n=============================================================`);
console.log(`  ĐÓNG GÓI ZIP BUILD TOÀN DIỆN - v${APP_VERSION}`);
console.log(`  Phát triển bởi: Dev by ${APP_AUTHOR}`);
console.log(`=============================================================\n`);

try {
  // 1. Biên dịch TypeScript
  console.log('[1/4] Đang biên dịch TypeScript (tsc)...');
  execSync('npx tsc', { cwd: rootDir, stdio: 'inherit' });
  console.log('[PASS] Biên dịch TypeScript thành công.');

  // Chuẩn hóa build plugin MCP
  console.log('\n[*] Đang chuẩn hóa cấu hình Plugin MCP...');
  execSync('node scripts/build-plugin.js', { cwd: rootDir, stdio: 'inherit' });

  // 2. Chạy đóng gói Netlify Function & ZIP Netlify
  console.log('\n[2/4] Đang tạo gói triển khai Netlify...');
  execSync('node scripts/package-netlify.js', { cwd: rootDir, stdio: 'inherit' });

  // 3. Chuẩn bị thư mục staging cho Full Build ZIP
  console.log('\n[3/4] Đang chuẩn bị tệp tin cho gói Full Build ZIP...');
  if (existsSync(tempStagingDir)) {
    rmSync(tempStagingDir, { recursive: true, force: true });
  }
  mkdirSync(tempStagingDir, { recursive: true });

  // Sao chép dist/src và dist/netlify vào staging
  const stageDistDir = resolve(tempStagingDir, 'dist');
  mkdirSync(stageDistDir, { recursive: true });
  if (existsSync(resolve(distDir, 'src'))) {
    cpSync(resolve(distDir, 'src'), resolve(stageDistDir, 'src'), { recursive: true });
  }
  if (existsSync(resolve(distDir, 'netlify'))) {
    cpSync(resolve(distDir, 'netlify'), resolve(stageDistDir, 'netlify'), { recursive: true });
  }

  // Sao chép netlify/functions đã bundle vào staging để tương thích tối đa với Netlify
  const stageNetlifyDir = resolve(tempStagingDir, 'netlify/functions');
  mkdirSync(stageNetlifyDir, { recursive: true });
  if (existsSync(resolve(distDir, 'netlify/functions'))) {
    cpSync(resolve(distDir, 'netlify/functions'), stageNetlifyDir, { recursive: true });
  }

  // Sao chép các tệp giao diện Web (public/) vào CẢ root VÀ dist/public để dev-server luôn tìm thấy ở mọi thư mục
  cpSync(resolve(rootDir, 'public'), resolve(tempStagingDir, 'public'), { recursive: true });
  cpSync(resolve(rootDir, 'public'), resolve(stageDistDir, 'public'), { recursive: true });

  // Sao chép thêm vào root của gói build để mở trực tiếp
  for (const f of ['index.html', 'style.css', 'app.js', 'logo.svg', 'openapi.json', 'plugin.json', 'mcp.json', '.mcp.json']) {
    const srcFile = resolve(rootDir, 'public', f);
    if (existsSync(srcFile)) {
      cpSync(srcFile, resolve(tempStagingDir, f));
    }
  }

  // Sao chép các cấu hình MCP Plugin vào gói build
  if (existsSync(resolve(rootDir, 'plugin.json'))) {
    cpSync(resolve(rootDir, 'plugin.json'), resolve(tempStagingDir, 'plugin.json'));
  }
  if (existsSync(resolve(rootDir, 'mcp.json'))) {
    cpSync(resolve(rootDir, 'mcp.json'), resolve(tempStagingDir, 'mcp.json'));
  }
  if (existsSync(resolve(rootDir, '.mcp.json'))) {
    cpSync(resolve(rootDir, '.mcp.json'), resolve(tempStagingDir, '.mcp.json'));
  }
  if (existsSync(resolve(rootDir, '.codex-plugin'))) {
    cpSync(resolve(rootDir, '.codex-plugin'), resolve(tempStagingDir, '.codex-plugin'), { recursive: true });
  }
  if (existsSync(resolve(rootDir, '.cursor'))) {
    cpSync(resolve(rootDir, '.cursor'), resolve(tempStagingDir, '.cursor'), { recursive: true });
  }
  if (existsSync(resolve(rootDir, 'claude_desktop_config.json'))) {
    cpSync(resolve(rootDir, 'claude_desktop_config.json'), resolve(tempStagingDir, 'claude_desktop_config.json'));
  }
  if (existsSync(resolve(rootDir, 'mcp-config.json'))) {
    cpSync(resolve(rootDir, 'mcp-config.json'), resolve(tempStagingDir, 'mcp-config.json'));
  }
  if (existsSync(resolve(rootDir, 'continue_config.json'))) {
    cpSync(resolve(rootDir, 'continue_config.json'), resolve(tempStagingDir, 'continue_config.json'));
  }

  // Tạo package.json an toàn cho gói deploy/production (tránh lỗi khi Netlify chạy npm run build:netlify)
  const deployPkg = {
    ...pkg,
    scripts: {
      ...pkg.scripts,
      "build": "echo \"Gói đã được biên dịch sẵn. Bỏ qua bước build.\"",
      "build:netlify": "echo \"Gói đã được biên dịch sẵn. Bỏ qua bước build.\"",
      "package:netlify": "echo \"Gói đã được biên dịch sẵn.\"",
      "start": "node dist/src/dev-server.js"
    }
  };
  writeFileSync(resolve(tempStagingDir, 'package.json'), JSON.stringify(deployPkg, null, 2), 'utf-8');

  if (existsSync(resolve(rootDir, 'package-lock.json'))) {
    cpSync(resolve(rootDir, 'package-lock.json'), resolve(tempStagingDir, 'package-lock.json'));
  }

  // Tạo netlify.toml an toàn (bỏ build command vì đã được biên dịch sẵn)
  let netlifyToml = readFileSync(resolve(rootDir, 'netlify.toml'), 'utf-8');
  netlifyToml = netlifyToml.replace(
    /command\s*=\s*"[^"]*"/g,
    'command = "echo \'Gói đã được biên dịch sẵn, sẵn sàng triển khai.\'"'
  );
  writeFileSync(resolve(tempStagingDir, 'netlify.toml'), netlifyToml, 'utf-8');

  if (existsSync(resolve(rootDir, 'tsconfig.json'))) {
    cpSync(resolve(rootDir, 'tsconfig.json'), resolve(tempStagingDir, 'tsconfig.json'));
  }
  if (existsSync(resolve(rootDir, '.env.example'))) {
    cpSync(resolve(rootDir, '.env.example'), resolve(tempStagingDir, '.env.example'));
  }
  if (existsSync(resolve(rootDir, 'README.md'))) {
    cpSync(resolve(rootDir, 'README.md'), resolve(tempStagingDir, 'README.md'));
  }

  // 4. Nén thành file zip build
  console.log('\n[4/4] Đang nén file mcp-tthc-v' + APP_VERSION + '-build.zip...');
  if (existsSync(buildZipFile)) {
    rmSync(buildZipFile, { force: true });
  }

  execSync(`cd "${tempStagingDir}" && zip -r -q "${buildZipFile}" .`, { stdio: 'inherit' });
  
  // Dọn dẹp thư mục staging tạm
  rmSync(tempStagingDir, { recursive: true, force: true });

  const buildZipSize = (statSync(buildZipFile).size / 1024).toFixed(1);
  const netlifyZipPath = resolve(distDir, `${APP_NAME}-v${APP_VERSION}-netlify.zip`);
  const netlifyZipSize = existsSync(netlifyZipPath) ? (statSync(netlifyZipPath).size / 1024).toFixed(1) : 'N/A';

  console.log(`\n=============================================================`);
  console.log(`  HOÀN TẤT ĐÓNG GÓI BUILD ZIP THÀNH CÔNG!`);
  console.log(`=============================================================`);
  console.log(`1. GÓI BUILD CHUẨN PRODUCTION (Độc lập Node.js & Netlify):`);
  console.log(`   - File: ${buildZipFile}`);
  console.log(`   - Kích thước: ${buildZipSize} KB`);
  console.log(`   - Nội dung: dist/ (compiled JS), public/ (UI Web), package.json, netlify.toml, README.md`);
  console.log(`   - Hướng dẫn dùng: Giải nén -> npm install --omit=dev -> npm start`);
  console.log(``);
  console.log(`2. GÓI CHUYÊN BIỆT NETLIFY DEPLOY:`);
  console.log(`   - File: ${netlifyZipPath}`);
  console.log(`   - Kích thước: ${netlifyZipSize} KB`);
  console.log(`   - Hướng dẫn dùng: Kéo thả trực tiếp vào app.netlify.com/drop`);
  console.log(`=============================================================\n`);
} catch (error) {
  console.error('\n[LỖI] Đóng gói ZIP thất bại:', error);
  process.exit(1);
}
