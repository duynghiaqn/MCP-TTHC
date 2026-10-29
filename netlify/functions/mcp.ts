import type { Config, Context } from '@netlify/functions';
import { validateApiKey, getAuthChallengeHeaders, isAuthRequired } from '../../src/auth.js';
import {
  executeJsonRpcMessage,
  getOpenApiSchema,
  getOpenAiPluginManifest,
  getOpenAiAgentPluginManifest,
  getOpenAiMcpConfig,
  getOpenAiCodexMcpConfig
} from '../../src/mcp-server.js';
import { tthcDataService } from '../../src/data-service.js';
import { APP_VERSION, APP_AUTHOR, APP_NAME, APP_TITLE, MCP_PROTOCOL_VERSION } from '../../src/version.js';
import {
  EMBEDDED_INDEX_HTML,
  EMBEDDED_STYLE_CSS,
  EMBEDDED_APP_JS,
  EMBEDDED_LOGO_SVG
} from '../../src/embedded-assets.js';

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

// Map of active SSE sessions: sessionId -> TransformStream writer
interface SseSession {
  writer: WritableStreamDefaultWriter<Uint8Array>;
  timer: NodeJS.Timeout;
}

const activeSessions = new Map<string, SseSession>();

function getCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, x-api-key, api-key, X-API-Key, x-auth-token, mcp-session-id, Accept, Last-Event-ID',
    'Access-Control-Expose-Headers': 'Content-Type, Authorization, mcp-session-id'
  };
}

function jsonResponse(data: unknown, status = 200, isCacheable = false): Response {
  const headers: Record<string, string> = {
    ...getCorsHeaders(),
    'Content-Type': 'application/json; charset=utf-8'
  };
  if (isCacheable && status === 200) {
    headers['Cache-Control'] = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';
  } else {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate';
  }
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      ...getCorsHeaders(),
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate'
    }
  });
}

function assetResponse(content: string, contentType: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: {
      ...getCorsHeaders(),
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

function unauthorizedResponse(message?: string): Response {
  return new Response(
    JSON.stringify({
      error: 'Unauthorized',
      message:
        message ||
        'API Key không hợp lệ hoặc bị thiếu. Vui lòng cung cấp header "Authorization: Bearer <key>" hoặc "X-API-Key: <key>", hoặc tham số ?key=... trên URL theo biến môi trường API_KEY / MCP_API_KEYS.'
    }),
    {
      status: 401,
      headers: {
        ...getCorsHeaders(),
        ...getAuthChallengeHeaders(),
        'Content-Type': 'application/json; charset=utf-8'
      }
    }
  );
}

function createSseStreamResponse(req: Request, apiKeyParam: string): Response {
  const sessionId = crypto.randomUUID();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Heartbeat ping timer every 15s to keep connection alive
  const pingTimer = setInterval(() => {
    writer
      .write(encoder.encode(': ping\n\n'))
      .catch(() => {
        clearInterval(pingTimer);
        activeSessions.delete(sessionId);
      });
  }, 15000);

  activeSessions.set(sessionId, { writer, timer: pingTimer });

  // Initial SSE endpoint message according to MCP specification
  const messageEndpoint = apiKeyParam
    ? `/messages?sessionId=${sessionId}&api-key=${encodeURIComponent(apiKeyParam)}`
    : `/messages?sessionId=${sessionId}`;

  const initialEvent = `event: endpoint\ndata: ${messageEndpoint}\n\n`;

  // Start stream
  (async () => {
    try {
      await writer.write(encoder.encode(initialEvent));
    } catch (err) {
      console.error('[SSE] Failed to write initial endpoint event:', err);
      clearInterval(pingTimer);
      activeSessions.delete(sessionId);
    }
  })();

  // Handle stream cancellation/cleanup
  req.signal?.addEventListener('abort', () => {
    clearInterval(pingTimer);
    activeSessions.delete(sessionId);
    try {
      writer.close().catch(() => {});
    } catch {}
  });

  return new Response(readable, {
    status: 200,
    headers: {
      ...getCorsHeaders(),
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}

let cachedToolsArray: Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}> | null = null;

async function getToolsArray(): Promise<
  Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
  }>
> {
  if (cachedToolsArray && cachedToolsArray.length > 0) {
    return cachedToolsArray;
  }
  try {
    const listRes = (await executeJsonRpcMessage({
      jsonrpc: '2.0',
      id: 'get-tools-list',
      method: 'tools/list'
    })) as {
      result?: {
        tools?: Array<{
          name: string;
          description: string;
          inputSchema: Record<string, unknown>;
        }>;
      };
    };

    if (listRes?.result?.tools && Array.isArray(listRes.result.tools)) {
      cachedToolsArray = listRes.result.tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        outputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  text: { type: 'string' }
                }
              }
            }
          }
        }
      }));
      return cachedToolsArray;
    }
  } catch (err) {
    console.error('[MCP Tools List Cache Error]:', err);
  }
  return [];
}

async function getServerInfoGuide(url: URL, apiKeyParam: string) {
  const version = await tthcDataService.getVersion();
  const requestOrigin = url.origin || 'https://mcp-tthc.netlify.app';
  const mcpUrlWithKey = apiKeyParam
    ? `${requestOrigin}/mcp?api-key=${encodeURIComponent(apiKeyParam)}`
    : `${requestOrigin}/mcp`;
  const sseUrlWithKey = apiKeyParam
    ? `${requestOrigin}/sse?api-key=${encodeURIComponent(apiKeyParam)}`
    : `${requestOrigin}/sse`;
  const dashboardUrl = apiKeyParam
    ? `${requestOrigin}/?api-key=${encodeURIComponent(apiKeyParam)}`
    : `${requestOrigin}/`;

  const tools = await getToolsArray();

  return {
    server: APP_TITLE,
    version: APP_VERSION,
    protocolVersion: MCP_PROTOCOL_VERSION,
    status: 'online',
    icon: 'https://ik.imagekit.io/97moqce0c/Static/logo_uoCW9PIyz.png',
    model: 'Netlify Official Serverless StreamableHTTPServerTransport',
    authProtected: isAuthRequired(),
    tools,
    guide: {
      message:
        'Để gọi MCP Tool, gửi HTTP POST đến URL này kèm Header "Content-Type: application/json" và Body là payload JSON-RPC 2.0.',
      http_method: 'POST',
      request_url: mcpUrlWithKey,
      headers: {
        'Content-Type': 'application/json'
      },
      protocol: 'JSON-RPC 2.0',
      how_to_list_all_tools: {
        description: 'Lấy danh sách tất cả các công cụ MCP và schema tham số đầy đủ',
        payload: {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list'
        }
      },
      how_to_call_tool_syntax: {
        description: 'Cú pháp chuẩn để gọi một công cụ MCP bất kỳ',
        payload: {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: '<tên_công_cụ>',
            arguments: {
              '<tên_tham_số>': '<giá_trị>'
            }
          }
        }
      },
      available_tools: tools.map(t => ({
        tool: t.name,
        description: t.description
      })),
      sample_curl_command: `curl -X POST "${mcpUrlWithKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "jsonrpc": "2.0",\n    "id": 1,\n    "method": "tools/call",\n    "params": {\n      "name": "tim_kiem_theo_ten_tthc",\n      "arguments": {\n        "ten_tthc": "đăng ký kết hôn",\n        "limit": 5\n      }\n    }\n  }'`,
      links: {
        web_dashboard: dashboardUrl,
        sse_endpoint: sseUrlWithKey,
        openapi_schema: `${requestOrigin}/openapi.json`,
        openai_plugin_manifest: `${requestOrigin}/.well-known/ai-plugin.json`
      }
    }
  };
}

export default async (req: Request, _context: Context): Promise<Response> => {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  // 1. CORS Preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders()
    });
  }

  // 2. HEAD requests
  if (method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: {
        ...getCorsHeaders(),
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
  }

  // Normalize path if routed via /.netlify/functions/mcp
  let cleanPath = pathname;
  if (cleanPath.startsWith('/.netlify/functions/mcp')) {
    cleanPath = cleanPath.replace('/.netlify/functions/mcp', '') || '/';
  }

  console.log(`[MCP Function] ${method} ${cleanPath}`);

  // 3. OpenAI Plugin Manifest (Public, KHÔNG bắt buộc xác thực API key theo chuẩn https://developers.openai.com/plugins)
  if (cleanPath === '/.well-known/ai-plugin.json') {
    const origin = url.origin || 'https://mcp-tthc.netlify.app';
    const manifest = getOpenAiPluginManifest(origin);
    return jsonResponse(manifest, 200, true);
  }

  // 3.1 OpenAI Agent Plugins Manifest & MCP Config (Agent Plugins Specification 1.0.0 & Codex Plugins)
  if (
    cleanPath === '/plugin.json' ||
    cleanPath === '/.well-known/plugin.json' ||
    cleanPath === '/.codex-plugin/plugin.json'
  ) {
    const origin = url.origin || 'https://mcp-tthc.netlify.app';
    const manifest = getOpenAiAgentPluginManifest(origin);
    return jsonResponse(manifest, 200, true);
  }

  if (cleanPath === '/mcp.json' || cleanPath === '/.well-known/mcp.json') {
    const origin = url.origin || 'https://mcp-tthc.netlify.app';
    const mcpConfig = getOpenAiMcpConfig(origin);
    return jsonResponse(mcpConfig, 200, true);
  }

  if (cleanPath === '/.mcp.json') {
    const origin = url.origin || 'https://mcp-tthc.netlify.app';
    const codexMcpConfig = getOpenAiCodexMcpConfig(origin);
    return jsonResponse(codexMcpConfig, 200, true);
  }

  // 4. OpenAPI / JSON Schema endpoint (Public, cho Custom GPT Actions, Dify, Postman & Swagger)
  if (
    cleanPath === '/schema' ||
    cleanPath === '/openapi.json' ||
    cleanPath === '/openapi.yaml' ||
    cleanPath === '/api/schema' ||
    cleanPath === '/api/openapi.json' ||
    cleanPath === '/.well-known/openapi.yaml' ||
    cleanPath === '/.well-known/openapi.json'
  ) {
    const origin = url.origin || 'https://mcp-tthc.netlify.app';
    const schema = getOpenApiSchema(origin);
    return jsonResponse(schema, 200, true);
  }

  // 5. Health Check endpoint
  if (cleanPath === '/api/health' || cleanPath === '/health') {
    try {
      const version = await tthcDataService.getVersion();
      return jsonResponse({
        status: 'ok',
        service: 'MCP Server Tra Cứu TTHC DVCQG',
        app_name: APP_NAME,
        app_version: APP_VERSION,
        author: APP_AUTHOR,
        protocol_version: MCP_PROTOCOL_VERSION,
        data_version: version,
        total_records: version.total_records,
        last_updated: version.last_updated,
        active_connections: activeSessions.size,
        connections: activeSessions.size > 0 ? activeSessions.size : 1,
        authRequired: Boolean(process.env.API_KEY || process.env.MCP_API_KEY)
      }, 200, true);
    } catch (err: unknown) {
      return jsonResponse({ status: 'error', error: String(err) }, 500);
    }
  }

  // 5.1 Static assets phục vụ giao diện Web Dashboard (nhúng trực tiếp để luôn luôn hiển thị Dashboard, không bị lỗi trả về JSON)
  if (cleanPath === '/style.css') {
    return assetResponse(EMBEDDED_STYLE_CSS, 'text/css; charset=utf-8');
  }
  if (cleanPath === '/app.js') {
    return assetResponse(EMBEDDED_APP_JS, 'application/javascript; charset=utf-8');
  }
  if (cleanPath === '/logo.svg') {
    return assetResponse(EMBEDDED_LOGO_SVG, 'image/svg+xml');
  }

  const acceptHeader = req.headers.get('accept') || '';
  const apiKeyParam =
    url.searchParams.get('api-key') ||
    url.searchParams.get('key') ||
    url.searchParams.get('apiKey') ||
    url.searchParams.get('api_key') ||
    '';

  // 6. MCP & SSE Core Endpoints: /mcp, /sse, /messages, /, /index.html
  const isMcpCorePath =
    cleanPath === '/mcp' ||
    cleanPath === '/mcp/' ||
    cleanPath === '/sse' ||
    cleanPath === '/messages' ||
    cleanPath === '/' ||
    cleanPath === '/index.html' ||
    cleanPath === '';

  if (isMcpCorePath) {
    const isSseRequest =
      acceptHeader.includes('text/event-stream') && (cleanPath === '/sse' || url.searchParams.get('transport') === 'sse');

    // A. Xử lý GET: Khởi tạo SSE Stream hoặc trả về Web Dashboard / MCP Tools Schema
    if (method === 'GET') {
      if (isSseRequest) {
        return createSseStreamResponse(req, apiKeyParam);
      }

      // GET /mcp hoặc /mcp/: Luôn trả về MCP Server Metadata & Tools List (Chuẩn Streamable HTTP & GPT Web)
      if (cleanPath === '/mcp' || cleanPath === '/mcp/') {
        try {
          const guideData = await getServerInfoGuide(url, apiKeyParam);
          return jsonResponse(guideData, 200);
        } catch (err: unknown) {
          return jsonResponse({ status: 'error', error: String(err) }, 500);
        }
      }

      // GET / hoặc /index.html: Phục vụ Web Dashboard HTML
      return htmlResponse(EMBEDDED_INDEX_HTML, 200);
    }

    // B. Xử lý POST: Thực thi JSON-RPC 2.0 payload hoặc SSE Message
    if (method === 'POST') {
      let body: any = null;
      try {
        const text = await req.text();
        if (text && text.trim().length > 0) {
          body = JSON.parse(text);
        }
      } catch {
        return jsonResponse(
          { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: Invalid JSON payload' } },
          400
        );
      }

      // Nếu payload là JSON-RPC 2.0 (có method hoặc jsonrpc hoặc id)
      if (body && typeof body === 'object') {
        const sessionId = url.searchParams.get('sessionId');

        // BẢO MẬT: Kiểm tra API Key cho tools/call nếu server bật auth (Chuẩn GPT Web / MCP 766)
        if (body.method === 'tools/call' && isAuthRequired()) {
          const auth = validateApiKey(url, req.headers);
          if (!auth.isValid) {
            const authErr = {
              jsonrpc: '2.0',
              id: body.id !== undefined ? body.id : null,
              error: {
                code: -32001,
                message:
                  'Unauthorized: API Key không hợp lệ. Vui lòng cung cấp Header Authorization: Bearer <key> hoặc tham số ?api-key=<key>'
              }
            };
            return new Response(JSON.stringify(authErr), {
              status: 401,
              headers: {
                ...getCorsHeaders(),
                ...getAuthChallengeHeaders(),
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Content-Type': 'application/json; charset=utf-8'
              }
            });
          }
        }

        try {
          const response = await executeJsonRpcMessage(body);

          // Nếu có active SSE session writer (chuẩn SSE transport), push qua stream
          if (sessionId && activeSessions.has(sessionId)) {
            const session = activeSessions.get(sessionId)!;
            const encoder = new TextEncoder();
            const eventText = `event: message\ndata: ${JSON.stringify(response)}\n\n`;
            await session.writer.write(encoder.encode(eventText));
            return new Response('Accepted', {
              status: 202,
              headers: getCorsHeaders()
            });
          }

          // Nếu là JSON-RPC notification hoặc client response (không có return body), trả 204 No Content
          if (response === null) {
            return new Response(null, {
              status: 204,
              headers: getCorsHeaders()
            });
          }

          // Hỗ trợ chuẩn Streamable HTTP (ChatGPT / OpenAI MCP Connector):
          // Nếu client yêu cầu text/event-stream, trả về SSE event stream theo đúng chuẩn MCP Specification
          if (acceptHeader.includes('text/event-stream')) {
            const sseBody = `event: message\ndata: ${JSON.stringify(response)}\n\n`;
            return new Response(sseBody, {
              status: 200,
              headers: {
                ...getCorsHeaders(),
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'X-Accel-Buffering': 'no'
              }
            });
          }

          // Trả về trực tiếp JSON-RPC response cho client tiêu chuẩn (cURL, Custom GPT Actions)
          return jsonResponse(response, 200);
        } catch (err: unknown) {
          console.error('[MCP JSON-RPC Execution Error]:', err);
          return jsonResponse(
            {
              jsonrpc: '2.0',
              id: body.id || null,
              error: {
                code: -32603,
                message: err instanceof Error ? err.message : String(err)
              }
            },
            500
          );
        }
      }

      // Nếu POST body rỗng hoặc không phải JSON-RPC, trả về 200 OK kèm hướng dẫn đầy đủ (KHÔNG BAO GIỜ TRẢ 405)
      try {
        const guideData = await getServerInfoGuide(url, apiKeyParam);
        return jsonResponse(guideData, 200);
      } catch (err: unknown) {
        return jsonResponse({ status: 'error', error: String(err) }, 500);
      }
    }

    // Đối với bất kỳ method nào khác (PUT, PATCH, DELETE...), trả về 200 OK với thông tin hệ thống (KHÔNG BAO GIỜ TRẢ 405)
    try {
      const guideData = await getServerInfoGuide(url, apiKeyParam);
      return jsonResponse(guideData, 200);
    } catch (err: unknown) {
      return jsonResponse({ status: 'error', error: String(err) }, 500);
    }
  }

  // 8. REST API Endpoints: /api/tthc/* (hỗ trợ cả GET và POST cho OpenAI Plugins & Custom GPT Actions)
  if (cleanPath.startsWith('/api/tthc')) {
    const subPath = cleanPath.replace('/api/tthc', '');

    // Đọc body nếu gửi bằng POST
    let postBody: Record<string, unknown> = {};
    if (method === 'POST') {
      try {
        const text = await req.text();
        if (text && text.trim().length > 0) {
          postBody = JSON.parse(text);
        }
      } catch {}
    }

    // Helper trích xuất tham số từ URL query hoặc POST JSON body
    const getParam = (key: string, aliasKey?: string): string => {
      return (
        url.searchParams.get(key) ||
        (aliasKey ? url.searchParams.get(aliasKey) : null) ||
        (postBody[key] !== undefined ? String(postBody[key]) : '') ||
        (aliasKey && postBody[aliasKey] !== undefined ? String(postBody[aliasKey]) : '')
      );
    };

    // GET / POST /api/tthc/stats
    if (subPath === '/stats') {
      const stats = await tthcDataService.getStats();
      return jsonResponse(stats, 200, true);
    }

    // GET / POST /api/tthc/refresh hoặc /api/tthc/reload (Webhook / on-demand auto-update)
    if (subPath === '/refresh' || subPath === '/reload') {
      const force = getParam('force') === 'true' || getParam('bat_buoc') === 'true';
      const result = await tthcDataService.checkAndAutoUpdate(force);
      return jsonResponse(result, 200, false);
    }

    // GET / POST /api/tthc/detail?id=... hoặc ?ma_tthc=...
    if (subPath === '/detail') {
      const codeOrId = getParam('id') || getParam('code') || getParam('ma_tthc');
      if (!codeOrId) {
        return jsonResponse(
          { error: 'Missing parameter: id or code or ma_tthc' },
          400
        );
      }
      const phanMucParam = (getParam('phan_muc') || 'tat_ca') as
        | 'tat_ca'
        | 'ho_so'
        | 'trinh_tu'
        | 'chi_phi'
        | 'thoi_han'
        | 'can_cu_phap_ly'
        | 'yeu_cau_dieu_kien';
      const dinhDangParam = (getParam('dinh_dang') || 'markdown') as 'markdown' | 'json';

      const detailRes = await tthcDataService.getDetail(codeOrId, {
        phan_muc: phanMucParam,
        dinh_dang: dinhDangParam
      });
      return jsonResponse(detailRes, 200, true);
    }

    // GET / POST /api/tthc/related?ma_tthc=...&chu_de=...&limit=6
    if (subPath === '/related') {
      const ma_tthc = getParam('ma_tthc') || getParam('id') || getParam('code') || undefined;
      const chu_de = getParam('chu_de') || getParam('q') || undefined;
      const limit = parseInt(getParam('limit') || '6', 10);
      const result = await tthcDataService.getRelatedProcedures({
        ma_hoac_ten_tthc: ma_tthc,
        chu_de,
        limit
      });
      return jsonResponse(result, 200, true);
    }

    // GET / POST /api/tthc/search?q=...&page=1&limit=10
    if (subPath === '/search') {
      const q = getParam('q') || getParam('query') || getParam('ten_tthc');
      const page = parseInt(getParam('page') || '1', 10);
      const limit = parseInt(getParam('limit') || '10', 10);
      const result = await tthcDataService.searchByName(q, page, limit);
      return jsonResponse(result, 200, true);
    }

    // GET / POST /api/tthc/cap?cap=...
    if (subPath === '/cap') {
      const cap = getParam('cap') || getParam('cap_thuc_hien');
      const q = getParam('q') || getParam('tu_khoa') || undefined;
      const page = parseInt(getParam('page') || '1', 10);
      const limit = parseInt(getParam('limit') || '10', 10);
      const result = await tthcDataService.filterByCap(cap, q, page, limit);
      return jsonResponse(result, 200, true);
    }

    // GET / POST /api/tthc/linhvuc?linhvuc=...
    if (subPath === '/linhvuc') {
      const lv = getParam('linhvuc') || getParam('linh_vuc');
      const q = getParam('q') || getParam('tu_khoa') || undefined;
      const page = parseInt(getParam('page') || '1', 10);
      const limit = parseInt(getParam('limit') || '10', 10);
      const result = await tthcDataService.filterByLinhVuc(lv, q, page, limit);
      return jsonResponse(result, 200, true);
    }

    // GET / POST /api/tthc/coquan?co_quan=...
    if (subPath === '/coquan') {
      const cq = getParam('coquan') || getParam('co_quan') || getParam('co_quan_thuc_hien');
      const q = getParam('q') || getParam('tu_khoa') || undefined;
      const page = parseInt(getParam('page') || '1', 10);
      const limit = parseInt(getParam('limit') || '10', 10);
      const result = await tthcDataService.filterByCoQuan(cq, q, page, limit);
      return jsonResponse(result, 200, true);
    }

    // GET / POST /api/tthc/advanced (Tìm kiếm tổng hợp đa tiêu chí)
    if (subPath === '/advanced') {
      const q = getParam('q') || getParam('tu_khoa') || undefined;
      const linhvuc = getParam('linhvuc') || getParam('linh_vuc') || undefined;
      const cap = getParam('cap') || getParam('cap_thuc_hien') || undefined;
      const co_quan = getParam('co_quan') || getParam('coquan') || getParam('co_quan_thuc_hien') || undefined;
      const co_thu_phi_val = getParam('co_thu_phi');
      const co_thu_phi = co_thu_phi_val !== '' ? co_thu_phi_val === 'true' : undefined;
      const page = parseInt(getParam('page') || '1', 10);
      const limit = parseInt(getParam('limit') || '10', 10);

      const result = await tthcDataService.searchAdvanced({
        keyword: q,
        tu_khoa: q,
        linh_vuc: linhvuc,
        cap_thuc_hien: cap,
        co_quan,
        co_thu_phi,
        page,
        limit
      });
      return jsonResponse(result, 200, true);
    }

    // GET / POST /api/tthc/gialai hoặc /api/tthc/gia-lai (Tra cứu chuyên sâu TTHC tỉnh Gia Lai)
    if (subPath === '/gialai' || subPath === '/gia-lai') {
      const q = getParam('q') || getParam('tu_khoa') || undefined;
      const ma_tthc = getParam('ma_tthc') || getParam('code') || undefined;
      const cap = getParam('cap') || getParam('cap_thuc_hien') || undefined;
      const co_quan = getParam('co_quan') || getParam('co_quan_thuc_hien') || undefined;
      const linh_vuc = getParam('linh_vuc') || getParam('linhvuc') || undefined;
      const chi_tiet = getParam('chi_tiet') === 'true';
      const page = parseInt(getParam('page') || '1', 10);
      const limit = parseInt(getParam('limit') || '10', 10);
      const dinh_dang = (getParam('dinh_dang') || 'markdown') as 'markdown' | 'json';

      const result = await tthcDataService.searchGiaLaiProcedures({
        tu_khoa: q,
        ma_tthc,
        cap_thuc_hien: cap,
        co_quan_thuc_hien: co_quan,
        linh_vuc,
        chi_tiet,
        page,
        limit,
        dinh_dang
      });
      return jsonResponse(result, 200, true);
    }

    // GET / POST /api/tthc/noibo hoặc /api/tthc/noi-bo (Tra cứu chuyên sâu TTHC Nội bộ theo Nghị định số 385/2026/NĐ-CP của Chính phủ)
    if (subPath === '/noibo' || subPath === '/noi-bo') {
      const q = getParam('q') || getParam('tu_khoa') || undefined;
      const ma_tthc = getParam('ma_tthc') || getParam('code') || undefined;
      const cap = getParam('cap') || getParam('cap_thuc_hien') || undefined;
      const co_quan = getParam('co_quan') || getParam('co_quan_thuc_hien') || undefined;
      const linh_vuc = getParam('linh_vuc') || getParam('linhvuc') || undefined;
      const nhom_noi_bo = (getParam('nhom_noi_bo') || 'tat_ca') as 'tat_ca' | 'giua_cac_co_quan' | 'trong_noi_bo';
      const chi_tiet = getParam('chi_tiet') === 'true';
      const page = parseInt(getParam('page') || '1', 10);
      const limit = parseInt(getParam('limit') || '10', 10);
      const dinh_dang = (getParam('dinh_dang') || 'markdown') as 'markdown' | 'json';

      const result = await tthcDataService.searchNoiBoProcedures({
        tu_khoa: q,
        ma_tthc,
        cap_thuc_hien: cap,
        co_quan,
        linh_vuc,
        nhom_noi_bo,
        chi_tiet,
        page,
        limit,
        dinh_dang
      });
      return jsonResponse(result, 200, true);
    }

    // GET / POST /api/tthc/noi-bo-gia-lai hoặc /api/tthc/noibogialai (Tra cứu TTHC Nội bộ tỉnh Gia Lai)
    if (subPath === '/noibo-gialai' || subPath === '/noi-bo-gia-lai' || subPath === '/noibogialai') {
      const q = getParam('q') || getParam('tu_khoa') || undefined;
      const ma_tthc = getParam('ma_tthc') || getParam('code') || undefined;
      const cap = getParam('cap') || getParam('cap_thuc_hien') || undefined;
      const co_quan = getParam('co_quan') || getParam('co_quan_thuc_hien') || undefined;
      const linh_vuc = getParam('linh_vuc') || getParam('linhvuc') || undefined;
      const nhom_noi_bo = (getParam('nhom_noi_bo') || 'tat_ca') as 'tat_ca' | 'giua_cac_co_quan' | 'trong_noi_bo';
      const chi_tiet = getParam('chi_tiet') === 'true';
      const page = parseInt(getParam('page') || '1', 10);
      const limit = parseInt(getParam('limit') || '10', 10);
      const dinh_dang = (getParam('dinh_dang') || 'markdown') as 'markdown' | 'json';

      const result = await tthcDataService.searchNoiBoGiaLaiProcedures({
        tu_khoa: q,
        ma_tthc,
        cap_thuc_hien: cap,
        co_quan,
        linh_vuc,
        nhom_noi_bo,
        chi_tiet,
        page,
        limit,
        dinh_dang
      });
      return jsonResponse(result, 200, true);
    }
  }

  // Fallback 404 cho các đường dẫn không tồn tại
  return jsonResponse({ error: 'Endpoint not found', path: pathname }, 404);
};

export const config: Config = {
  path: [
    '/',
    '/sse',
    '/messages',
    '/mcp',
    '/mcp.json',
    '/.mcp.json',
    '/plugin.json',
    '/.well-known/plugin.json',
    '/.well-known/mcp.json',
    '/.codex-plugin/plugin.json',
    '/.codex-plugin/*',
    '/schema',
    '/openapi.json',
    '/openapi.yaml',
    '/.well-known/ai-plugin.json',
    '/.well-known/openapi.yaml',
    '/.well-known/openapi.json',
    '/.well-known/*',
    '/api/*',
    '/.netlify/functions/mcp',
    '/.netlify/functions/mcp/*'
  ]
};
