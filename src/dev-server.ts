import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../netlify/functions/mcp.js';
import { APP_VERSION, APP_AUTHOR } from './version.js';
import { tthcDataService } from './data-service.js';
// @ts-ignore
import { generateAssets } from '../scripts/generate-assets.js';

// Tự động gán biến môi trường mặc định nếu chưa được cấu hình, đảm bảo không bao giờ bị lỗi "Biến môi trường INDEX_URL chưa được cấu hình"
if (!process.env.INDEX_URL && !process.env.TTHC_INDEX_URL) {
  process.env.INDEX_URL = 'https://cdn.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/index.json';
}
if (!process.env.VERSION_URL && !process.env.TTHC_VERSION_URL) {
  process.env.VERSION_URL = 'https://cdn.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/version.json';
}
if (!process.env.DETAILS_BASE_URL && !process.env.TTHC_DETAILS_BASE_URL) {
  process.env.DETAILS_BASE_URL = 'https://cdn.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/details';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tự động tìm thư mục public/ chính xác dù chạy từ src/ (dev tsx) hay dist/src/ (node production)
function resolvePublicDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'public'),
    path.resolve(__dirname, '../../public'),
    path.resolve(__dirname, '../public'),
    path.resolve(__dirname, 'public'),
    path.resolve(process.cwd(), 'dist/public')
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      return dir;
    }
  }
  return path.resolve(process.cwd(), 'public');
}

const PUBLIC_DIR = resolvePublicDir();

const PORT = parseInt(process.env.PORT || '3000', 10);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || `localhost:${PORT}`;
  const fullUrl = `http://${host}${req.url}`;
  const urlObj = new URL(fullUrl);
  const pathname = urlObj.pathname;



  // Serve static files from public/ if matching
  if (req.method === 'GET' || req.method === 'HEAD') {
    const targetFile = pathname === '/' || pathname === '/index.html' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.join(PUBLIC_DIR, targetFile);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'Access-Control-Allow-Origin': '*'
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  }

  // Convert Node IncomingMessage to Web Request
  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val !== undefined) {
      if (Array.isArray(val)) {
        val.forEach(v => headers.append(key, v));
      } else {
        headers.set(key, val);
      }
    }
  }

  let body: Buffer | undefined = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    body = Buffer.concat(chunks);
  }

  const webRequest = new Request(fullUrl, {
    method: req.method,
    headers,
    body: body && body.length > 0 ? (body as unknown as BodyInit) : undefined
  });

  try {
    // Call the Netlify Function handler
    const mockContext = {
      account: { id: 'dev-account' },
      site: { id: 'dev-site', url: `http://${host}` },
      geo: {},
      ip: '127.0.0.1',
      requestId: crypto.randomUUID(),
      server: { region: 'local' },
      params: {}
    };

    const webResponse = await handler(
      webRequest,
      mockContext as unknown as Parameters<typeof handler>[1]
    );

    // Write status and headers back to Node ServerResponse
    const resHeaders: Record<string, string> = {};
    webResponse.headers.forEach((value, key) => {
      resHeaders[key] = value;
    });

    res.writeHead(webResponse.status, resHeaders);

    // Stream or send body
    if (webResponse.body) {
      const reader = webResponse.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          res.end();
        } catch {
          res.end();
        }
      };
      pump();
    } else {
      res.end();
    }
  } catch (err: unknown) {
    console.error('Handler error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: String(err) }));
    }
  }
});

server.listen(PORT, () => {
  // 1. Tự động thăm dò cập nhật dữ liệu TTHC nền từ CSDL Quốc gia
  tthcDataService.startAutoUpdatePolling(15 * 60 * 1000);

  // 2. Tự động theo dõi các file giao diện trong public/ để cập nhật mã nhúng
  if (fs.existsSync(PUBLIC_DIR)) {
    let watchDebounce: NodeJS.Timeout | null = null;
    fs.watch(PUBLIC_DIR, { recursive: true }, (event, filename) => {
      if (!filename || filename.startsWith('.')) return;
      if (watchDebounce) clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => {
        console.log(`[AUTO-UPDATE] Phát hiện thay đổi tại ${filename}, đang đồng bộ mã nhúng...`);
        try {
          generateAssets();
        } catch (e) {
          console.warn('[AUTO-UPDATE] Lỗi cập nhật mã nhúng:', e);
        }
      }, 300);
    });
  }

  const hasKey = Boolean(process.env.MCP_API_KEYS || process.env.API_KEY || process.env.MCP_API_KEY);
  console.log('\n=============================================================');
  console.log(`MCP SERVER TRA CỨU TTHC DVCQG v${APP_VERSION}`);
  console.log(`Tác giả: Dev by ${APP_AUTHOR}`);
  console.log(`- Web Dashboard:        http://localhost:${PORT}${hasKey ? '?key=' + (process.env.API_KEY || 'YOUR_API_KEY') : ''}`);
  console.log(`- Static Files Dir:     ${PUBLIC_DIR} (${fs.existsSync(PUBLIC_DIR) ? 'Đã tìm thấy index.html' : 'Chưa tìm thấy'})`);
  console.log(`- Auto-Update & Watch:  BẬT (Theo dõi mã nguồn giao diện & tự động đồng bộ dữ liệu)`);
  console.log(`- MCP Streamable HTTP:  http://localhost:${PORT}/mcp`);
  console.log(`- MCP SSE Endpoint:     http://localhost:${PORT}/sse`);
  console.log(`- OpenAI Agent Plugin:  http://localhost:${PORT}/plugin.json`);
  console.log(`- OpenAI MCP Config:    http://localhost:${PORT}/mcp.json`);
  console.log(`- OpenAI Codex MCP:     http://localhost:${PORT}/.mcp.json`);
  console.log(`- OpenAI Classic Plugin:http://localhost:${PORT}/.well-known/ai-plugin.json`);
  console.log(`- OpenAPI 3.1.0 Schema: http://localhost:${PORT}/openapi.json`);
  console.log(`- Health Check:         http://localhost:${PORT}/api/health`);
  console.log(`- API Key Security:     ${hasKey ? 'BẬT (Khóa bảo mật chia sẻ: Bearer / X-API-Key / ?key=)' : 'TẮT (Chế độ phát triển mở)'}`);
  console.log('=============================================================\n');
});
