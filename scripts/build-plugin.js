#!/usr/bin/env node
/**
 * Script chuẩn hóa build plugin MCP & sinh các cấu hình kết nối tự động
 * Tác giả: Dev by KynChou
 * Mục đích:
 * 1. Tự động sinh file OpenAPI 3.1.0 tĩnh vào public/openapi.json
 * 2. Tự động sinh manifest OpenAI Plugin vào public/.well-known/ai-plugin.json
 * 3. Tự động sinh manifest OpenAI Agent Plugin chuẩn mới (plugin.json & mcp.json) ở root và public/
 * 4. Tự động sinh cấu hình OpenAI Codex Plugin (.codex-plugin/plugin.json & .mcp.json)
 * 5. Chuẩn hóa cấu hình Cursor AI Plugin (.cursor/mcp.json)
 * 6. Chuẩn hóa cấu hình Claude Desktop (claude_desktop_config.json)
 * 7. Chuẩn hóa cấu hình tổng quát MCP Protocol (mcp-config.json) & Continue.dev
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'));
const APP_VERSION = pkg.version || '1.1.0';
const APP_NAME = pkg.name || 'mcp-tthc-netlify';
const APP_AUTHOR = pkg.author || 'KynChou';
const BASE_URL = process.env.MCP_BASE_URL || 'https://mcp-tthc.netlify.app';

console.log(`\n=============================================================`);
console.log(`  CHUẨN HÓA BUILD MCP PLUGIN & CẤU HÌNH KẾT NỐI - v${APP_VERSION}`);
console.log(`  Tác giả: Dev by ${APP_AUTHOR}`);
console.log(`=============================================================\n`);

try {
  const publicDir = resolve(rootDir, 'public');
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
  }

  // 1. Tự động xuất file public/openapi.json
  console.log('[1/7] Đang sinh file OpenAPI 3.1.0 tĩnh (public/openapi.json)...');
  let openApiSchema = null;
  const distMcpServer = resolve(rootDir, 'dist/src/mcp-server.js');
  if (existsSync(distMcpServer)) {
    try {
      const { getOpenApiSchema } = await import(`file://${distMcpServer}`);
      openApiSchema = getOpenApiSchema(BASE_URL);
    } catch {
      // Bỏ qua nếu dist chưa build xong
    }
  }

  if (openApiSchema) {
    writeFileSync(
      resolve(publicDir, 'openapi.json'),
      JSON.stringify(openApiSchema, null, 2),
      'utf-8'
    );
    console.log('[PASS] Đã tạo public/openapi.json thành công.');
  } else {
    console.log('[INFO] Sẽ tạo public/openapi.json sau bước tsc.');
  }

  // 2. Chuẩn hóa manifest OpenAI Classic Plugin (public/.well-known/ai-plugin.json)
  console.log('[2/7] Đang tạo OpenAI Plugin manifest (public/.well-known/ai-plugin.json)...');
  const wellKnownDir = resolve(publicDir, '.well-known');
  if (!existsSync(wellKnownDir)) {
    mkdirSync(wellKnownDir, { recursive: true });
  }

  const aiPluginManifest = {
    schema_version: 'v1',
    name_for_human: 'Tra cứu TTHC Quốc Gia',
    name_for_model: 'tra_cuu_tthc_dvcqg',
    description_for_human:
      'Tra cứu thông tin thủ tục hành chính, dịch vụ công quốc gia Việt Nam (hồ sơ, lệ phí, thời hạn, cơ quan giải quyết, gợi ý thủ tục liên quan, TTHC tỉnh Gia Lai).',
    description_for_model:
      'Plugin tra cứu toàn diện cơ sở dữ liệu quốc gia về Thủ tục Hành chính (TTHC) Việt Nam. Cho phép tìm kiếm thủ tục theo tên hoặc từ khóa, truy xuất chi tiết chuyên sâu theo mã TTHC (trình tự các bước, hồ sơ, thời hạn, lệ phí, căn cứ pháp lý), lọc theo cấp thực hiện, lọc theo lĩnh vực, tra cứu chuyên sâu TTHC tỉnh Gia Lai, dùng các tool OpenAI search/fetch và gợi ý chuỗi thủ tục theo sự kiện đời sống / kinh doanh.',
    auth: {
      type: 'user_http',
      authorization_type: 'bearer'
    },
    api: {
      type: 'openapi',
      url: `${BASE_URL}/openapi.json`
    },
    logo_url: `${BASE_URL}/logo.svg`,
    contact_email: 'info@dnncloud.net',
    legal_info_url: `${BASE_URL}/`
  };

  writeFileSync(
    resolve(wellKnownDir, 'ai-plugin.json'),
    JSON.stringify(aiPluginManifest, null, 2),
    'utf-8'
  );
  console.log('[PASS] Đã cập nhật public/.well-known/ai-plugin.json.');

  // 3. Chuẩn hóa OpenAI Agent Plugins Manifest (plugin.json) theo Agent Plugins Specification 1.0.0
  console.log('[3/7] Đang tạo OpenAI Agent Plugin manifest (plugin.json)...');
  const agentPluginManifest = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'mcp-tthc-dvcqg',
    version: APP_VERSION,
    description: 'Tra cứu cơ sở dữ liệu quốc gia về Thủ tục Hành chính (TTHC) Việt Nam qua MCP Protocol.',
    author: {
      name: APP_AUTHOR,
      email: 'info@dnncloud.net',
      url: BASE_URL
    },
    homepage: BASE_URL,
    license: 'MIT',
    keywords: ['mcp', 'tthc', 'vietnam', 'dvcqg', 'dich-vu-cong', 'public-services'],
    extensions: {
      'com.openai': {
        interface: {
          displayName: 'Tra cứu TTHC Quốc Gia',
          shortDescription: 'Tra cứu thủ tục hành chính & dịch vụ công quốc gia Việt Nam',
          longDescription:
            'Truy xuất thông tin chi tiết hồ sơ, trình tự, lệ phí, thời hạn, căn cứ pháp lý và gợi ý chuỗi thủ tục liên quan từ cơ sở dữ liệu dịch vụ công quốc gia.',
          developerName: APP_AUTHOR,
          category: 'Productivity',
          capabilities: ['Read'],
          websiteURL: BASE_URL,
          brandColor: '#DA251D',
          logo: './logo.svg',
          defaultPrompt: [
            'Tra cứu thủ tục đăng ký kết hôn cần những giấy tờ gì và làm ở đâu?',
            'Tìm các thủ tục hành chính cấp xã về lĩnh vực Hộ tịch.',
            'Lấy danh sách thủ tục liên quan đến mở hộ kinh doanh.'
          ]
        }
      }
    }
  };

  const agentPluginStr = JSON.stringify(agentPluginManifest, null, 2);
  writeFileSync(resolve(rootDir, 'plugin.json'), agentPluginStr, 'utf-8');
  writeFileSync(resolve(publicDir, 'plugin.json'), agentPluginStr, 'utf-8');
  writeFileSync(resolve(wellKnownDir, 'plugin.json'), agentPluginStr, 'utf-8');
  console.log('[PASS] Đã tạo plugin.json ở root, public/ và public/.well-known/.');

  // 4. Chuẩn hóa OpenAI Agent Plugins MCP Server Config (mcp.json) với xác thực API Key chia sẻ qua Bearer
  console.log('[4/7] Đang tạo cấu hình OpenAI Agent Plugins MCP (mcp.json)...');
  const agentMcpConfig = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: {
      'tthc-dvcqg': {
        type: 'streamable-http',
        url: `${BASE_URL}/mcp`,
        description: 'MCP Server tra cứu TTHC Việt Nam triển khai tối ưu trên Netlify Functions',
        extensions: {
          'com.openai': {
            auth: {
              type: 'api_key',
              headerScheme: 'bearer'
            }
          }
        }
      }
    }
  };

  const agentMcpStr = JSON.stringify(agentMcpConfig, null, 2);
  writeFileSync(resolve(rootDir, 'mcp.json'), agentMcpStr, 'utf-8');
  writeFileSync(resolve(publicDir, 'mcp.json'), agentMcpStr, 'utf-8');
  writeFileSync(resolve(wellKnownDir, 'mcp.json'), agentMcpStr, 'utf-8');
  console.log('[PASS] Đã tạo mcp.json ở root, public/ và public/.well-known/.');

  // 5. Chuẩn hóa cấu hình OpenAI Codex Plugin (.codex-plugin/plugin.json & .mcp.json)
  console.log('[5/7] Đang tạo cấu hình OpenAI Codex Plugin (.codex-plugin/plugin.json & .mcp.json)...');
  const codexDir = resolve(rootDir, '.codex-plugin');
  if (!existsSync(codexDir)) {
    mkdirSync(codexDir, { recursive: true });
  }

  const codexPluginManifest = {
    name: 'mcp-tthc-dvcqg',
    version: APP_VERSION,
    description: 'Tra cứu cơ sở dữ liệu quốc gia về Thủ tục Hành chính (TTHC) Việt Nam trong OpenAI Codex',
    mcpServers: './.mcp.json'
  };

  const codexMcpConfig = {
    mcpServers: {
      tthc_dvcqg: {
        type: 'http',
        url: `${BASE_URL}/mcp`,
        bearer_token_env_var: 'MCP_TTHC_API_KEY'
      }
    }
  };

  writeFileSync(resolve(codexDir, 'plugin.json'), JSON.stringify(codexPluginManifest, null, 2), 'utf-8');
  writeFileSync(resolve(rootDir, '.mcp.json'), JSON.stringify(codexMcpConfig, null, 2), 'utf-8');
  writeFileSync(resolve(publicDir, '.mcp.json'), JSON.stringify(codexMcpConfig, null, 2), 'utf-8');
  console.log('[PASS] Đã tạo .codex-plugin/plugin.json và .mcp.json.');

  // 6. Chuẩn hóa cấu hình Cursor AI IDE (.cursor/mcp.json) & Claude Desktop
  console.log('[6/7] Đang tạo cấu hình cho Cursor AI & Claude Desktop...');
  const cursorDir = resolve(rootDir, '.cursor');
  if (!existsSync(cursorDir)) {
    mkdirSync(cursorDir, { recursive: true });
  }

  const cursorMcpConfig = {
    mcpServers: {
      'tthc-dvcqg-local': {
        url: 'http://localhost:3000/sse',
        headers: {
          Authorization: 'Bearer YOUR_SECRET_API_KEY'
        }
      },
      'tthc-dvcqg-production': {
        url: `${BASE_URL}/sse`,
        headers: {
          Authorization: 'Bearer YOUR_SECRET_API_KEY'
        }
      }
    }
  };

  writeFileSync(resolve(cursorDir, 'mcp.json'), JSON.stringify(cursorMcpConfig, null, 2), 'utf-8');

  const claudeDesktopConfig = {
    mcpServers: {
      'tthc-dvcqg': {
        command: 'node',
        args: ['dist/src/dev-server.js'],
        env: {
          PORT: '3000',
          API_KEY: 'YOUR_SECRET_API_KEY'
        }
      },
      'tthc-dvcqg-sse': {
        url: 'http://localhost:3000/sse?api-key=YOUR_SECRET_API_KEY'
      }
    }
  };

  writeFileSync(
    resolve(rootDir, 'claude_desktop_config.json'),
    JSON.stringify(claudeDesktopConfig, null, 2),
    'utf-8'
  );
  console.log('[PASS] Đã tạo .cursor/mcp.json & claude_desktop_config.json.');

  // 7. Chuẩn hóa cấu hình MCP Protocol & Continue.dev
  console.log('[7/7] Đang tạo cấu hình mcp-config.json & continue_config.json...');
  const generalMcpConfig = {
    $schema: 'https://json-schema.org/draft-07/schema#',
    version: APP_VERSION,
    name: APP_NAME,
    title: 'MCP Server Tra Cứu TTHC DVCQG',
    author: `Dev by ${APP_AUTHOR}`,
    auth: {
      type: 'shared_api_key',
      headers: ['Authorization: Bearer <KEY>', 'X-API-Key: <KEY>'],
      query: '?api-key=<KEY> (hoặc ?key=<KEY>)'
    },
    endpoints: {
      sse: {
        local: 'http://localhost:3000/sse?api-key=YOUR_API_KEY',
        production: `${BASE_URL}/sse?api-key=YOUR_API_KEY`
      },
      http: {
        local: 'http://localhost:3000/mcp?api-key=YOUR_API_KEY',
        production: `${BASE_URL}/mcp?api-key=YOUR_API_KEY`
      },
      openai_agent_plugin: `${BASE_URL}/plugin.json`,
      openai_mcp_config: `${BASE_URL}/mcp.json`,
      openai_classic_plugin: `${BASE_URL}/.well-known/ai-plugin.json`,
      openapi_schema: `${BASE_URL}/openapi.json`
    },
    tools: [
      'search',
      'fetch',
      'tra_cuu_theo_ma_tthc',
      'tim_kiem_theo_ten_tthc',
      'loc_theo_cap_thuc_hien',
      'loc_theo_linh_vuc',
      'tim_kiem_tong_hop',
      'goi_y_thu_tuc_lien_quan',
      'tra_cuu_tthc_gia_lai',
      'tthc_gia_lai',
      'thong_tin_mcp_server'
    ]
  };

  writeFileSync(
    resolve(rootDir, 'mcp-config.json'),
    JSON.stringify(generalMcpConfig, null, 2),
    'utf-8'
  );

  const continueConfig = {
    models: [],
    mcpServers: [
      {
        name: 'tthc-dvcqg',
        url: `${BASE_URL}/sse?api-key=YOUR_SECRET_API_KEY`
      }
    ]
  };

  writeFileSync(
    resolve(rootDir, 'continue_config.json'),
    JSON.stringify(continueConfig, null, 2),
    'utf-8'
  );
  console.log('[PASS] Đã tạo mcp-config.json & continue_config.json.');

  console.log(`\n=============================================================`);
  console.log(`  HOÀN TẤT CHUẨN HÓA BUILD MCP PLUGIN THÀNH CÔNG!`);
  console.log(`=============================================================\n`);
} catch (err) {
  console.error('\n[LỖI] Chuẩn hóa build plugin thất bại:', err);
  process.exit(1);
}
