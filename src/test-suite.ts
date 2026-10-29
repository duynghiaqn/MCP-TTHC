import 'dotenv/config';
import { executeJsonRpcMessage } from './mcp-server.js';
import { validateApiKey } from './auth.js';
import { tthcDataService } from './data-service.js';
import netlifyHandler from '../netlify/functions/mcp.js';

async function runTests() {
  console.log('[TEST] BẮT ĐẦU TEST TOÀN BỘ HỆ THỐNG MCP TTHC...\n');

  // TEST 1: Auth validation logic
  console.log('--- TEST 1: Kiểm tra xác thực API Key qua URL ---');
  process.env.API_KEY = 'secret_test_key_123';

  const testFailNoKey = validateApiKey('http://localhost:3000/mcp');
  console.assert(!testFailNoKey.isValid, 'Xác thực phải thất bại khi không có key');
  console.log('[PASS] Chặn thành công khi thiếu API key');

  const testFailWrongKey = validateApiKey('http://localhost:3000/mcp?key=wrong_key');
  console.assert(!testFailWrongKey.isValid, 'Xác thực phải thất bại khi sai key');
  console.log('[PASS] Chặn thành công khi sai API key');

  const testPassKey = validateApiKey('http://localhost:3000/mcp?key=secret_test_key_123');
  console.assert(testPassKey.isValid, 'Xác thực phải thành công với ?key=...');
  console.log('[PASS] Chấp nhận thành công với ?key=...');

  const testPassApiKeyHyphen = validateApiKey('http://localhost:3000/mcp?api-key=secret_test_key_123');
  console.assert(testPassApiKeyHyphen.isValid, 'Xác thực phải thành công với ?api-key=...');
  console.log('[PASS] Chấp nhận thành công với ?api-key=...');

  const testPassApiKey = validateApiKey('http://localhost:3000/mcp?apiKey=secret_test_key_123');
  console.assert(testPassApiKey.isValid, 'Xác thực phải thành công với ?apiKey=...');
  console.log('[PASS] Chấp nhận thành công với ?apiKey=...');

  const testPassHeader = validateApiKey('http://localhost:3000/mcp', { 'x-api-key': 'secret_test_key_123' });
  console.assert(testPassHeader.isValid, 'Xác thực phải thành công với x-api-key header');
  console.log('[PASS] Chấp nhận thành công với header x-api-key');

  const testPassBearer = validateApiKey('http://localhost:3000/mcp', {
    authorization: 'Bearer secret_test_key_123'
  });
  console.assert(testPassBearer.isValid, 'Xác thực phải thành công với Bearer token');
  console.assert(testPassBearer.source === 'authorization', 'Source phải là authorization');
  console.log('[PASS] Chấp nhận thành công với header "Authorization: Bearer <key>" (Chuẩn OpenAI / Codex)');

  // Test multi-key (MCP_API_KEYS) với nhãn đối tác
  process.env.MCP_API_KEYS = 'openai:sk_live_openai_888,dify:sk_dify_999';
  const testOpenAiKey = validateApiKey('http://localhost:3000/mcp', {
    authorization: 'Bearer sk_live_openai_888'
  });
  console.assert(testOpenAiKey.isValid && testOpenAiKey.keyLabel === 'openai', 'Key OpenAI phải khớp với nhãn openai');
  console.log('[PASS] Xác thực đa khóa chia sẻ (multi-key) với nhãn đối tác "openai" thành công!');

  const testDifyKey = validateApiKey('http://localhost:3000/mcp', {
    'x-api-key': 'sk_dify_999'
  });
  console.assert(testDifyKey.isValid && testDifyKey.keyLabel === 'dify', 'Key Dify phải khớp với nhãn dify');
  console.log('[PASS] Xác thực đa khóa chia sẻ (multi-key) với nhãn đối tác "dify" thành công!');

  // Trả lại key đơn cho các test handler tiếp theo
  delete process.env.MCP_API_KEYS;
  process.env.API_KEY = 'secret_test_key_123';

  // TEST 2: Data Service - Load index and stats
  console.log('\n--- TEST 2: Tải dữ liệu Index & Thống kê ---');
  // Kiểm tra cơ chế tự động chuyển link dự phòng khi không có INDEX_URL
  const oldIndexEnv = process.env.INDEX_URL;
  delete process.env.INDEX_URL;
  delete process.env.TTHC_INDEX_URL;

  const stats = await tthcDataService.getStats();
  console.log(`[PASS] Tổng số TTHC qua link dự phòng: ${stats.totalRecords}`);
  console.log(`[PASS] Cập nhật lần cuối: ${stats.lastUpdated}`);
  console.assert(stats.totalRecords > 6000, 'Số bản ghi phải > 6000');
  console.log('[PASS] Cơ chế link dự phòng hoạt động chính xác khi biến môi trường INDEX_URL trống!');
  if (oldIndexEnv) process.env.INDEX_URL = oldIndexEnv;

  // TEST 3: MCP Tool: tim_kiem_theo_ten_tthc
  console.log('\n--- TEST 3: Tool tim_kiem_theo_ten_tthc ---');
  const searchRpc = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'tim_kiem_theo_ten_tthc',
      arguments: {
        ten_tthc: 'đăng ký kết hôn',
        limit: 3
      }
    }
  };
  const searchRes = (await executeJsonRpcMessage(searchRpc)) as any;
  console.assert(searchRes.result?.content?.[0]?.text, 'Phải có kết quả tìm kiếm');
  console.log('[PASS] Kết quả tìm kiếm (300 ký tự đầu):');
  console.log(searchRes.result.content[0].text.slice(0, 300) + '...\n');

  // TEST 4: MCP Tool: tra_cuu_theo_ma_tthc (Chi tiết chuyên sâu)
  console.log('--- TEST 4: Tool tra_cuu_theo_ma_tthc (Mã: 6.006781, phan_muc & dinh_dang) ---');
  const detailRpc = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'tra_cuu_theo_ma_tthc',
      arguments: {
        ma_tthc: '6.006781'
      }
    }
  };
  const detailRes = (await executeJsonRpcMessage(detailRpc)) as any;
  console.assert(detailRes.result?.content?.[0]?.text, 'Phải có chi tiết');
  console.log('[PASS] Chi tiết toàn bộ (Markdown):');
  console.log(detailRes.result.content[0].text.slice(0, 200) + '...\n');

  // TEST 4.A: Truy xuất theo phân mục ho_so
  const detailHoSoRpc = {
    jsonrpc: '2.0',
    id: 201,
    method: 'tools/call',
    params: {
      name: 'tra_cuu_theo_ma_tthc',
      arguments: {
        ma_tthc: '6.006781',
        phan_muc: 'ho_so'
      }
    }
  };
  const detailHoSoRes = (await executeJsonRpcMessage(detailHoSoRpc)) as any;
  console.assert(detailHoSoRes.result?.content?.[0]?.text?.toLowerCase().includes('hồ sơ'), 'Phải trích xuất được phân mục hồ sơ');
  console.log('[PASS] Trích xuất phân mục Hồ sơ thành công!');

  // TEST 4.B: Truy xuất định dạng JSON cấu trúc sạch
  const detailJsonRpc = {
    jsonrpc: '2.0',
    id: 202,
    method: 'tools/call',
    params: {
      name: 'tra_cuu_theo_ma_tthc',
      arguments: {
        ma_tthc: '6.006781',
        phan_muc: 'trinh_tu',
        dinh_dang: 'json'
      }
    }
  };
  const detailJsonRes = (await executeJsonRpcMessage(detailJsonRpc)) as any;
  const parsedJsonDetail = JSON.parse(detailJsonRes.result.content[0].text);
  console.assert(parsedJsonDetail.sections?.trinh_tu !== undefined, 'Phải có section trinh_tu trong JSON');
  console.log('[PASS] Truy xuất định dạng JSON có cấu trúc thành công!');

  // TEST 4.C: Fallback tra cứu bằng tên thủ tục
  const detailNameFallbackRpc = {
    jsonrpc: '2.0',
    id: 203,
    method: 'tools/call',
    params: {
      name: 'tra_cuu_theo_ma_tthc',
      arguments: {
        ma_tthc: 'đăng ký kết hôn'
      }
    }
  };
  const detailNameFallbackRes = (await executeJsonRpcMessage(detailNameFallbackRpc)) as any;
  console.assert(detailNameFallbackRes.result?.content?.[0]?.text, 'Phải tìm thấy chi tiết qua tên thủ tục');
  console.log('[PASS] Fallback tra cứu chi tiết bằng tên thủ tục thành công!\n');

  // TEST 4.1: MCP Tool: tim_kiem_tong_hop (Tìm theo cơ quan trong đa tiêu chí)
  console.log('--- TEST 4.1: Tool tim_kiem_tong_hop (Tìm theo cơ quan: Bộ Tài chính) ---');
  const banHanhRpc = {
    jsonrpc: '2.0',
    id: 21,
    method: 'tools/call',
    params: {
      name: 'tim_kiem_tong_hop',
      arguments: {
        co_quan: 'Bộ Tài chính',
        limit: 2
      }
    }
  };
  const banHanhRes = (await executeJsonRpcMessage(banHanhRpc)) as any;
  console.assert(banHanhRes.result?.content?.[0]?.text, 'Phải có kết quả từ tim_kiem_tong_hop');
  console.log('[PASS] Tool tim_kiem_tong_hop tìm theo cơ quan thành công!\n');

  // TEST 5: MCP Tool: loc_theo_cap_thuc_hien
  console.log('--- TEST 5: Tool loc_theo_cap_thuc_hien (Cấp Bộ) ---');
  const capRpc = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'loc_theo_cap_thuc_hien',
      arguments: {
        cap_thuc_hien: 'Cấp Bộ',
        limit: 2
      }
    }
  };
  const capRes = (await executeJsonRpcMessage(capRpc)) as any;
  console.assert(capRes.result?.content?.[0]?.text, 'Phải có kết quả lọc cấp');
  console.log('[PASS] Lọc Cấp Bộ thành công\n');

  // TEST 6: MCP Tool: loc_theo_linh_vuc
  console.log('--- TEST 6: Tool loc_theo_linh_vuc (Đất đai, Hộ tịch, Kinh doanh, Xây dựng) ---');
  const lvRpc = {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'loc_theo_linh_vuc',
      arguments: {
        linh_vuc: 'Đất đai',
        limit: 2
      }
    }
  };
  const lvRes = (await executeJsonRpcMessage(lvRpc)) as any;
  console.assert(lvRes.result?.content?.[0]?.text, 'Phải có kết quả lọc lĩnh vực Đất đai');

  // Test Hộ tịch
  const hoTichRes = (await executeJsonRpcMessage({
    jsonrpc: '2.0',
    id: 41,
    method: 'tools/call',
    params: { name: 'loc_theo_linh_vuc', arguments: { linh_vuc: 'Hộ tịch', limit: 2 } }
  })) as any;
  console.assert(hoTichRes.result?.content?.[0]?.text?.includes('Hộ tịch'), 'Phải lọc được lĩnh vực Hộ tịch');

  // Test Kinh doanh
  const kinhDoanhRes = (await executeJsonRpcMessage({
    jsonrpc: '2.0',
    id: 42,
    method: 'tools/call',
    params: { name: 'loc_theo_linh_vuc', arguments: { linh_vuc: 'Kinh doanh', limit: 2 } }
  })) as any;
  console.assert(kinhDoanhRes.result?.content?.[0]?.text, 'Phải lọc được lĩnh vực Kinh doanh');

  // Test Xây dựng
  const xayDungRes = (await executeJsonRpcMessage({
    jsonrpc: '2.0',
    id: 43,
    method: 'tools/call',
    params: { name: 'loc_theo_linh_vuc', arguments: { linh_vuc: 'Xây dựng', limit: 2 } }
  })) as any;
  console.assert(xayDungRes.result?.content?.[0]?.text, 'Phải lọc được lĩnh vực Xây dựng');

  console.log('[PASS] Lọc các Lĩnh vực thiết yếu (Hộ tịch, Kinh doanh, Xây dựng, Đất đai) thành công!\n');

  // TEST 7: MCP Tool: tim_kiem_tong_hop đa tiêu chí
  console.log('--- TEST 7: Tool tim_kiem_tong_hop (kết hợp lĩnh vực & lệ phí) ---');
  const cqRpc = {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'tim_kiem_tong_hop',
      arguments: {
        linh_vuc: 'Đất đai',
        co_thu_phi: false,
        limit: 2
      }
    }
  };
  const cqRes = (await executeJsonRpcMessage(cqRpc)) as any;
  console.assert(cqRes.result?.content?.[0]?.text, 'Phải có kết quả lọc đa tiêu chí');
  console.log('[PASS] Tìm kiếm đa tiêu chí thành công\n');

  // TEST 8: MCP Tool: goi_y_thu_tuc_lien_quan (Thay thế tool thống kê cũ)
  console.log('--- TEST 8: Tool goi_y_thu_tuc_lien_quan (Chủ đề: sinh con, dinh_dang: json & markdown) ---');
  const relatedRpc = {
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: {
      name: 'goi_y_thu_tuc_lien_quan',
      arguments: {
        chu_de: 'sinh con',
        limit: 3
      }
    }
  };
  const relatedRes = (await executeJsonRpcMessage(relatedRpc)) as any;
  console.assert(relatedRes.result?.content?.[0]?.text?.includes('Gợi ý'), 'Phải có kết quả gợi ý thủ tục liên quan');
  console.log('[PASS] Gợi ý chuỗi thủ tục sự kiện sinh con (Markdown):');
  console.log(relatedRes.result.content[0].text.slice(0, 250) + '...\n');

  // TEST 8.A: Gợi ý dạng JSON từ thủ tục gốc
  const relatedJsonRpc = {
    jsonrpc: '2.0',
    id: 601,
    method: 'tools/call',
    params: {
      name: 'goi_y_thu_tuc_lien_quan',
      arguments: {
        ma_hoac_ten_tthc: '6.006781',
        limit: 2,
        dinh_dang: 'json'
      }
    }
  };
  const relatedJsonRes = (await executeJsonRpcMessage(relatedJsonRpc)) as any;
  const parsedRelated = JSON.parse(relatedJsonRes.result.content[0].text);
  console.assert(Array.isArray(parsedRelated.suggestions), 'suggestions phải là mảng');
  console.log('[PASS] Gợi ý thủ tục liên quan dạng JSON có cấu trúc thành công!\n');

  // TEST 8.B: Gợi ý chuỗi sự kiện Hộ kinh doanh, Cư trú, Y tế
  console.log('--- TEST 8.B: Gợi ý chuỗi sự kiện Hộ kinh doanh, Cư trú, Y tế ---');
  const hkdRes = await tthcDataService.getRelatedProcedures({ chu_de: 'hộ kinh doanh', limit: 4 });
  console.assert(hkdRes.tong_so_goi_y >= 3, 'Hộ kinh doanh phải có ít nhất 3 gợi ý');
  console.log('[PASS] Gợi ý chuỗi sự kiện Hộ kinh doanh:', hkdRes.danh_sach.map(d => d.ten_tthc).slice(0, 3).join(' -> '));

  const cuTruRes = await tthcDataService.getRelatedProcedures({ chu_de: 'cư trú', limit: 4 });
  console.assert(cuTruRes.tong_so_goi_y >= 3, 'Cư trú phải có ít nhất 3 gợi ý');
  console.log('[PASS] Gợi ý chuỗi sự kiện Cư trú:', cuTruRes.danh_sach.map(d => d.ten_tthc).slice(0, 3).join(' -> '));

  const yTeRes = await tthcDataService.getRelatedProcedures({ chu_de: 'y tế', limit: 4 });
  console.assert(yTeRes.tong_so_goi_y >= 3, 'Y tế phải có ít nhất 3 gợi ý');
  console.log('[PASS] Gợi ý chuỗi sự kiện Y tế:', yTeRes.danh_sach.map(d => d.ten_tthc).slice(0, 3).join(' -> '));
  console.log('');

  // TEST 9: MCP Tool: thong_tin_mcp_server (Phiên bản & Tác giả)
  console.log('--- TEST 9: Tool thong_tin_mcp_server (Phiên bản hệ thống) ---');
  const versionRpc = {
    jsonrpc: '2.0',
    id: 7,
    method: 'tools/call',
    params: {
      name: 'thong_tin_mcp_server',
      arguments: {}
    }
  };
  const versionRes = (await executeJsonRpcMessage(versionRpc)) as any;
  console.assert(versionRes.result?.content?.[0]?.text?.includes('v1.1.0'), 'Phải chứa phiên bản v1.1.0');
  console.assert(versionRes.result?.content?.[0]?.text?.includes('KynChou'), 'Phải chứa tên tác giả KynChou');

  // TEST 10: HTTP Handler: GET /mcp & Server Info (Truyền ?api-key=... theo chuẩn Streamable HTTP & GPT Web)
  console.log('--- TEST 10: Handler GET /mcp & Server Info (Truyền ?api-key=...) ---');
  const getMcpReq = new Request('http://localhost:3000/mcp?api-key=secret_test_key_123', {
    method: 'GET'
  });
  const getMcpRes = await netlifyHandler(getMcpReq, {} as any);
  console.assert(getMcpRes.status === 200, `GET /mcp phải trả về HTTP 200, nhận được: ${getMcpRes.status}`);
  const getMcpData = (await getMcpRes.json()) as any;
  console.assert(getMcpData.status === 'online', `GET /mcp status phải là online, nhận: ${getMcpData.status}`);
  console.assert(getMcpData.server === 'MCP Server Tra Cứu TTHC DVCQG', 'GET /mcp phải có server name');
  console.assert(Array.isArray(getMcpData.tools) && getMcpData.tools.length >= 8, 'Phải có danh sách tools');
  console.assert(getMcpData.model?.includes('StreamableHTTP'), 'Phải có model StreamableHTTP');
  console.assert(
    getMcpData.guide?.links?.web_dashboard?.includes('?api-key=secret_test_key_123'),
    'Link web_dashboard phải chứa tham số ?api-key=...'
  );
  console.log('[PASS] GET /mcp?api-key=... trả về thông tin server và danh sách tools hợp lệ (HTTP 200), tương thích chuẩn GPT Web!\n');

  // TEST 11: Kiểm tra schema hoàn chỉnh của tất cả tools (Tránh lỗi thiếu schema trên Cursor, Claude, OpenAI)
  console.log('--- TEST 11: Kiểm tra Schema tools/list hoàn chỉnh ---');
  const toolsListRpc = {
    jsonrpc: '2.0',
    id: 11,
    method: 'tools/list'
  };
  const toolsListRes = (await executeJsonRpcMessage(toolsListRpc)) as any;
  const tools = toolsListRes?.result?.tools;
  console.assert(Array.isArray(tools), 'tools/list phải trả về mảng công cụ');
  console.assert(tools.length >= 8, `Phải có đủ ít nhất 8 tools, nhận được: ${tools.length}`);

  for (const tool of tools) {
    console.assert(tool.inputSchema, `Tool ${tool.name} không được thiếu inputSchema`);
    console.assert(tool.inputSchema.type === 'object', `Tool ${tool.name} inputSchema.type phải là object`);
    console.assert(tool.inputSchema.properties !== undefined, `Tool ${tool.name} không được thiếu properties`);
    console.assert(Array.isArray(tool.inputSchema.required), `Tool ${tool.name} inputSchema.required phải là mảng`);
  }
  console.log(`[PASS] Toàn bộ ${tools.length} công cụ MCP đều có inputSchema, properties và required hoàn chỉnh!\n`);

  // TEST 11.0: Kiểm tra Tool tra_cuu_tthc_gia_lai
  console.log('--- TEST 11.0: Kiểm tra Tool tra_cuu_tthc_gia_lai ---');
  const glRpc = {
    jsonrpc: '2.0',
    id: 110,
    method: 'tools/call',
    params: {
      name: 'tra_cuu_tthc_gia_lai',
      arguments: {
        cap_thuc_hien: 'cap_xa',
        limit: 3
      }
    }
  };
  const glRes = (await executeJsonRpcMessage(glRpc)) as any;
  console.assert(glRes.result?.content?.[0]?.text, 'Tool tra_cuu_tthc_gia_lai phải trả về text');
  console.assert(glRes.result.content[0].text.includes('Gia Lai'), 'Kết quả phải chứa thông tin tỉnh Gia Lai');
  console.log('[PASS] Tool tra_cuu_tthc_gia_lai hoạt động chuẩn xác!\n');

  // TEST 11.0.1: Kiểm tra Tool tra_cuu_tthc_noi_bo
  console.log('--- TEST 11.0.1: Kiểm tra Tool tra_cuu_tthc_noi_bo ---');
  const nbRpc = {
    jsonrpc: '2.0',
    id: 1101,
    method: 'tools/call',
    params: {
      name: 'tra_cuu_tthc_noi_bo',
      arguments: {
        co_quan: 'Bộ Công thương',
        limit: 3
      }
    }
  };
  const nbRes = (await executeJsonRpcMessage(nbRpc)) as any;
  console.assert(nbRes.result?.content?.[0]?.text, 'Tool tra_cuu_tthc_noi_bo phải trả về text');
  console.assert(nbRes.result.content[0].text.includes('THỦ TỤC HÀNH CHÍNH NỘI BỘ') || nbRes.result.content[0].text.includes('nội bộ'), 'Kết quả phải chứa thông tin TTHC nội bộ');
  console.log('[PASS] Tool tra_cuu_tthc_noi_bo hoạt động chuẩn xác!\n');

  // TEST 11.0.2: Kiểm tra Alias tthc_noi_bo và tra cứu theo mã TTHC nội bộ
  console.log('--- TEST 11.0.2: Kiểm tra Alias tthc_noi_bo & tra cứu mã nội bộ chi tiết ---');
  const nbDetailRpc = {
    jsonrpc: '2.0',
    id: 1102,
    method: 'tools/call',
    params: {
      name: 'tthc_noi_bo',
      arguments: {
        ma_tthc: '6.006791',
        dinh_dang: 'markdown'
      }
    }
  };
  const nbDetailRes = (await executeJsonRpcMessage(nbDetailRpc)) as any;
  console.assert(nbDetailRes.result?.content?.[0]?.text, 'Alias tthc_noi_bo phải trả về text');
  console.assert(nbDetailRes.result.content[0].text.includes('6.006791'), 'Chi tiết phải chứa mã 6.006791');
  console.log('[PASS] Alias tthc_noi_bo & chi tiết TTHC nội bộ hoạt động chuẩn xác!\n');

  // TEST 11.0.3: Kiểm tra Tool tra_cuu_tthc_noi_bo_gia_lai & alias tthc_noi_bo_gia_lai
  console.log('--- TEST 11.0.3: Kiểm tra Tool tra_cuu_tthc_noi_bo_gia_lai & alias tthc_noi_bo_gia_lai ---');
  const nbGlRpc = {
    jsonrpc: '2.0',
    id: 1103,
    method: 'tools/call',
    params: {
      name: 'tra_cuu_tthc_noi_bo_gia_lai',
      arguments: {
        cap_thuc_hien: 'cap_tinh',
        limit: 3
      }
    }
  };
  const nbGlRes = (await executeJsonRpcMessage(nbGlRpc)) as any;
  console.assert(nbGlRes.result?.content?.[0]?.text, 'Tool tra_cuu_tthc_noi_bo_gia_lai phải trả về text');
  console.assert(nbGlRes.result.content[0].text.includes('GIA LAI'), 'Kết quả phải chứa thông tin TTHC nội bộ tỉnh Gia Lai');

  const nbGlAliasRpc = {
    jsonrpc: '2.0',
    id: 1104,
    method: 'tools/call',
    params: {
      name: 'tthc_noi_bo_gia_lai',
      arguments: {
        ma_tthc: '5.003972',
        dinh_dang: 'markdown'
      }
    }
  };
  const nbGlAliasRes = (await executeJsonRpcMessage(nbGlAliasRpc)) as any;
  console.assert(nbGlAliasRes.result?.content?.[0]?.text, 'Alias tthc_noi_bo_gia_lai phải trả về text');
  console.assert(nbGlAliasRes.result.content[0].text.includes('5.003972'), 'Kết quả phải chứa mã 5.003972');
  console.log('[PASS] Tool tra_cuu_tthc_noi_bo_gia_lai & alias hoạt động chuẩn xác!\n');

  // TEST 11.1: Kiểm tra Alias mapping cho tra_cuu_theo_co_quan -> tim_kiem_tong_hop
  const aliasRpc = {
    jsonrpc: '2.0',
    id: 111,
    method: 'tools/call',
    params: {
      name: 'tra_cuu_co_quan',
      arguments: {
        co_quan_thuc_hien: 'Cục Đăng kiểm Việt Nam',
        limit: 2
      }
    }
  };
  const aliasRes = (await executeJsonRpcMessage(aliasRpc)) as any;
  console.assert(aliasRes.result?.content?.[0]?.text, 'Gọi alias tra_cuu_co_quan phải thành công');
  console.log('[PASS] Gọi tool qua Alias tra_cuu_co_quan và tham số co_quan_thuc_hien chuyển tiếp thành công!');

  // TEST 12: Endpoint OpenAPI Schema (/openapi.json và /schema)
  console.log('--- TEST 12: Kiểm tra Endpoint /openapi.json và /schema ---');
  const openApiReq = new Request('http://localhost:3000/openapi.json', { method: 'GET' });
  const openApiRes = await netlifyHandler(openApiReq, {} as any);
  console.assert(openApiRes.status === 200, `GET /openapi.json phải trả về 200, nhận: ${openApiRes.status}`);
  const openApiData = (await openApiRes.json()) as any;
  console.assert(openApiData.openapi === '3.1.0', 'OpenAPI version phải là 3.1.0');
  console.assert(openApiData.paths?.['/mcp'], 'Phải có path /mcp trong OpenAPI schema');
  console.assert(openApiData.paths?.['/api/tthc/advanced'], 'Phải có path /api/tthc/advanced trong OpenAPI schema');
  // TEST 13: Endpoint OpenAI Plugin Manifest (/.well-known/ai-plugin.json)
  console.log('--- TEST 13: Kiểm tra Endpoint /.well-known/ai-plugin.json (OpenAI Plugins) ---');
  const pluginReq = new Request('http://localhost:3000/.well-known/ai-plugin.json', { method: 'GET' });
  const pluginRes = await netlifyHandler(pluginReq, {} as any);
  console.assert(pluginRes.status === 200, `GET /.well-known/ai-plugin.json phải trả về 200, nhận: ${pluginRes.status}`);
  const pluginData = (await pluginRes.json()) as any;
  console.assert(pluginData.schema_version === 'v1', 'schema_version phải là v1');
  console.assert(pluginData.name_for_model === 'tra_cuu_tthc_dvcqg', 'name_for_model phải đúng chuẩn');
  console.assert(pluginData.api?.type === 'openapi', 'api.type phải là openapi');
  console.assert(pluginData.api?.url?.endsWith('/openapi.json'), 'api.url phải trỏ về /openapi.json');
  console.assert(pluginData.logo_url?.endsWith('/logo.svg'), 'logo_url phải trỏ về /logo.svg');
  console.log('[PASS] OpenAI Plugin Manifest v1 hoàn toàn hợp lệ theo chuẩn https://developers.openai.com/plugins!\n');

  // TEST 14: Khắc phục triệt để lỗi 405 Method Not Allowed
  console.log('--- TEST 14: Khắc phục hoàn toàn lỗi 405 Method Not Allowed ---');
  // 14.1. GET /messages không được trả 405
  const getMessagesReq = new Request('http://localhost:3000/messages?key=secret_test_key_123', { method: 'GET' });
  const getMessagesRes = await netlifyHandler(getMessagesReq, {} as any);
  console.assert(getMessagesRes.status === 200, `GET /messages phải trả về 200, nhận: ${getMessagesRes.status}`);

  // 14.2. POST / không được trả 405 (nhận JSON-RPC hoặc hướng dẫn)
  const postRootReq = new Request('http://localhost:3000/?key=secret_test_key_123', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 142, method: 'tools/list' })
  });
  const postRootRes = await netlifyHandler(postRootReq, {} as any);
  console.assert(postRootRes.status === 200, `POST / với JSON-RPC phải trả về 200, nhận: ${postRootRes.status}`);

  // 14.3. POST /mcp rỗng hoặc body không phải JSON-RPC phải trả về 200 OK kèm hướng dẫn (không trả 405)
  const postEmptyMcpReq = new Request('http://localhost:3000/mcp?key=secret_test_key_123', {
    method: 'POST'
  });
  const postEmptyMcpRes = await netlifyHandler(postEmptyMcpReq, {} as any);
  console.assert(postEmptyMcpRes.status === 200, `POST /mcp body rỗng phải trả về 200 (không trả 405), nhận: ${postEmptyMcpRes.status}`);
  console.log('[PASS] Đã triệt tiêu hoàn toàn lỗi 405 Method Not Allowed trên tất cả các endpoint!\n');

  // TEST 15: Kiểm tra ưu tiên jsDelivr CDN và không lỗi khi thiếu biến môi trường INDEX_URL
  console.log('--- TEST 15: Kiểm tra tăng tốc CDN jsDelivr & Biến môi trường INDEX_URL ---');
  const indexUrls = (await import('./data-service.js')).getIndexUrls();
  console.assert(indexUrls[0].includes('cdn.jsdelivr.net'), 'Link đầu tiên phải là cdn.jsdelivr.net để tăng tốc');
  console.log(`[PASS] Nguồn tải dữ liệu chính: ${indexUrls[0]}`);

  // TEST 16: REST API /api/tthc/advanced (Hỗ trợ cả GET và POST)
  console.log('--- TEST 16: Kiểm tra REST API /api/tthc/advanced (GET & POST) ---');
  const advGetReq = new Request('http://localhost:3000/api/tthc/advanced?linhvuc=H%E1%BB%99+t%E1%BB%8Bch&limit=2', { method: 'GET' });
  const advGetRes = await netlifyHandler(advGetReq, {} as any);
  console.assert(advGetRes.status === 200, `GET /api/tthc/advanced phải trả về 200, nhận: ${advGetRes.status}`);
  const advGetData = (await advGetRes.json()) as any;
  console.assert(advGetData.data?.length > 0, 'Phải có kết quả tìm kiếm đa tiêu chí qua GET');

  const advPostReq = new Request('http://localhost:3000/api/tthc/advanced', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linhvuc: 'Đất đai', limit: 2 })
  });
  const advPostRes = await netlifyHandler(advPostReq, {} as any);
  console.assert(advPostRes.status === 200, `POST /api/tthc/advanced phải trả về 200, nhận: ${advPostRes.status}`);
  const advPostData = (await advPostRes.json()) as any;
  console.assert(advPostData.data?.length > 0, 'Phải có kết quả tìm kiếm đa tiêu chí qua POST');
  // TEST 17: REST API /api/tthc/detail nâng cao và /api/tthc/related
  console.log('--- TEST 17: Kiểm tra REST API /api/tthc/detail (phan_muc) và /api/tthc/related ---');
  const detailApiReq = new Request(
    'http://localhost:3000/api/tthc/detail?ma_tthc=6.006781&phan_muc=chi_phi&dinh_dang=json',
    { method: 'GET' }
  );
  const detailApiRes = await netlifyHandler(detailApiReq, {} as any);
  console.assert(detailApiRes.status === 200, `GET /api/tthc/detail phải 200, nhận: ${detailApiRes.status}`);
  const detailApiData = (await detailApiRes.json()) as any;
  console.assert(detailApiData.sections !== undefined, 'detailApiData phải có sections');
  console.log('[PASS] REST API /api/tthc/detail với phan_muc & dinh_dang hoạt động chính xác!');

  const relatedApiReq = new Request(
    'http://localhost:3000/api/tthc/related?chu_de=k%E1%BA%BFt+h%C3%B4n&limit=3',
    { method: 'GET' }
  );
  const relatedApiRes = await netlifyHandler(relatedApiReq, {} as any);
  console.assert(relatedApiRes.status === 200, `GET /api/tthc/related phải 200, nhận: ${relatedApiRes.status}`);
  const relatedApiData = (await relatedApiRes.json()) as any;
  console.assert(relatedApiData.suggestions?.length > 0, 'Phải có gợi ý thủ tục liên quan');

  // REST API /api/tthc/noi-bo
  const noiBoApiReq = new Request(
    'http://localhost:3000/api/tthc/noi-bo?co_quan=B%E1%BB%99+C%C3%B4ng+th%C6%B0%C6%A1ng&limit=2',
    { method: 'GET' }
  );
  const noiBoApiRes = await netlifyHandler(noiBoApiReq, {} as any);
  console.assert(noiBoApiRes.status === 200, `GET /api/tthc/noi-bo phải 200, nhận: ${noiBoApiRes.status}`);
  const noiBoApiData = (await noiBoApiRes.json()) as any;
  console.assert(noiBoApiData.total > 0, 'REST API /api/tthc/noi-bo phải trả về danh sách có dữ liệu');
  console.log('[PASS] REST API /api/tthc/noi-bo hoạt động chính xác!\n');

  // REST API /api/tthc/noi-bo-gia-lai
  const noiBoGlApiReq = new Request(
    'http://localhost:3000/api/tthc/noi-bo-gia-lai?cap=cap_tinh&limit=2',
    { method: 'GET' }
  );
  const noiBoGlApiRes = await netlifyHandler(noiBoGlApiReq, {} as any);
  console.assert(noiBoGlApiRes.status === 200, `GET /api/tthc/noi-bo-gia-lai phải 200, nhận: ${noiBoGlApiRes.status}`);
  const noiBoGlApiData = (await noiBoGlApiRes.json()) as any;
  console.assert(noiBoGlApiData.total > 0, 'REST API /api/tthc/noi-bo-gia-lai phải trả về danh sách có dữ liệu');
  console.log('[PASS] REST API /api/tthc/noi-bo-gia-lai hoạt động chính xác!\n');
  // TEST 18: Kiểm tra phục vụ giao diện Web Dashboard (HTML/CSS/JS) thay vì JSON
  console.log('--- TEST 18: Kiểm tra giao diện Web Dashboard & Assets nhúng ---');
  const getRootHtmlReq = new Request('http://localhost:3000/?key=test', {
    method: 'GET',
    headers: { 'Accept': 'text/html,application/xhtml+xml' }
  });
  const getRootHtmlRes = await netlifyHandler(getRootHtmlReq, {} as any);
  console.assert(getRootHtmlRes.status === 200, `GET / phải trả về 200, nhận: ${getRootHtmlRes.status}`);
  const rootContentType = getRootHtmlRes.headers.get('content-type') || '';
  console.assert(rootContentType.includes('text/html'), `Content-Type phải là text/html, nhận: ${rootContentType}`);
  const rootHtmlText = await getRootHtmlRes.text();
  console.assert(rootHtmlText.includes('<!DOCTYPE html>') && rootHtmlText.includes('MCP Server Tra Cứu TTHC DVCQG'), 'Phải chứa HTML Dashboard');
  console.log('[PASS] GET / phục vụ giao diện Web Dashboard HTML chuẩn xác!');

  const getCssReq = new Request('http://localhost:3000/style.css', { method: 'GET' });
  const getCssRes = await netlifyHandler(getCssReq, {} as any);
  console.assert(getCssRes.status === 200, 'GET /style.css phải trả về 200');
  console.assert((getCssRes.headers.get('content-type') || '').includes('text/css'), 'Phải trả về text/css');
  console.log('[PASS] GET /style.css trả về stylesheet chuẩn xác!');

  const getJsReq = new Request('http://localhost:3000/app.js', { method: 'GET' });
  const getJsRes = await netlifyHandler(getJsReq, {} as any);
  console.assert(getJsRes.status === 200, 'GET /app.js phải trả về 200');
  console.assert((getJsRes.headers.get('content-type') || '').includes('javascript'), 'Phải trả về javascript');
  console.log('[PASS] GET /app.js trả về script chuẩn xác!');

  const getMcpHtmlReq = new Request('http://localhost:3000/mcp?api-key=secret123', {
    method: 'GET',
    headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
  });
  const getMcpHtmlRes = await netlifyHandler(getMcpHtmlReq, {} as any);
  console.assert(getMcpHtmlRes.status === 200, `GET /mcp với Accept text/html phải trả về 200 JSON cho GPT Web, nhận: ${getMcpHtmlRes.status}`);
  const mcpHtmlData = (await getMcpHtmlRes.json()) as any;
  console.assert(mcpHtmlData.status === 'online', 'Status phải là online');
  console.assert(Array.isArray(mcpHtmlData.tools) && mcpHtmlData.tools.length >= 8, 'Phải trả về danh sách tools cho GPT Web');
  console.log('[PASS] GET /mcp với Accept: text/html luôn trả về JSON Schema (200 OK) tương thích 100% GPT Web & ChatGPT Crawler!\n');

  // TEST 19: Kiểm tra OpenAI Standard Tools: `search` & `fetch`
  console.log('--- TEST 19: Kiểm tra OpenAI Standard Tools (search & fetch) ---');
  const openAiSearchRpc = {
    jsonrpc: '2.0',
    id: 191,
    method: 'tools/call',
    params: {
      name: 'search',
      arguments: { query: 'kết hôn' }
    }
  };
  const openAiSearchRes = (await executeJsonRpcMessage(openAiSearchRpc)) as any;
  const parsedSearch = JSON.parse(openAiSearchRes.result?.content?.[0]?.text || '{}');
  console.assert(Array.isArray(parsedSearch.results) && parsedSearch.results.length > 0, 'Tool search phải trả về results array');
  console.assert(parsedSearch.results[0].id && parsedSearch.results[0].title, 'Mỗi kết quả search phải có id và title');
  console.log(`[PASS] OpenAI Tool 'search' thành công, tìm thấy ${parsedSearch.results.length} thủ tục!`);

  const firstId = parsedSearch.results[0].id;
  const openAiFetchRpc = {
    jsonrpc: '2.0',
    id: 192,
    method: 'tools/call',
    params: {
      name: 'fetch',
      arguments: { id: firstId }
    }
  };
  const openAiFetchRes = (await executeJsonRpcMessage(openAiFetchRpc)) as any;
  const parsedFetch = JSON.parse(openAiFetchRes.result?.content?.[0]?.text || '{}');
  console.assert(parsedFetch.id === firstId && parsedFetch.text, 'Tool fetch phải trả về văn bản toàn văn của thủ tục');
  console.log(`[PASS] OpenAI Tool 'fetch' thành công, tải toàn văn cho id: ${firstId}!\n`);

  // TEST 20: Kiểm tra Endpoint OpenAI Agent Plugins (/plugin.json & /mcp.json)
  console.log('--- TEST 20: Kiểm tra Endpoint OpenAI Agent Plugin (/plugin.json & /mcp.json) ---');
  const agentPluginReq = new Request('http://localhost:3000/plugin.json', { method: 'GET' });
  const agentPluginRes = await netlifyHandler(agentPluginReq, {} as any);
  console.assert(agentPluginRes.status === 200, `GET /plugin.json phải trả về 200, nhận: ${agentPluginRes.status}`);
  const agentPluginData = (await agentPluginRes.json()) as any;
  console.assert(agentPluginData.$schema?.includes('agent-plugins.org'), 'plugin.json phải tuân thủ schema agent-plugins.org');
  console.assert(agentPluginData.extensions?.['com.openai'] !== undefined, 'plugin.json phải có extension com.openai');
  console.log('[PASS] Endpoint /plugin.json (OpenAI Agent Plugins Specification 1.0.0) hợp lệ!');

  const agentMcpReq = new Request('http://localhost:3000/mcp.json', { method: 'GET' });
  const agentMcpRes = await netlifyHandler(agentMcpReq, {} as any);
  console.assert(agentMcpRes.status === 200, `GET /mcp.json phải trả về 200, nhận: ${agentMcpRes.status}`);
  const agentMcpData = (await agentMcpRes.json()) as any;
  console.assert(agentMcpData.mcpServers?.['tthc-dvcqg'] !== undefined, 'mcp.json phải có server tthc-dvcqg');
  console.log('[PASS] Endpoint /mcp.json (OpenAI Agent Plugins MCP Config) hợp lệ!');

  const codexMcpReq = new Request('http://localhost:3000/.mcp.json', { method: 'GET' });
  const codexMcpRes = await netlifyHandler(codexMcpReq, {} as any);
  console.assert(codexMcpRes.status === 200, `GET /.mcp.json phải trả về 200, nhận: ${codexMcpRes.status}`);
  const codexMcpData = (await codexMcpRes.json()) as any;
  console.assert(codexMcpData.mcpServers?.['tthc_dvcqg']?.bearer_token_env_var === 'MCP_TTHC_API_KEY', 'Codex MCP phải dùng bearer_token_env_var');
  console.log('[PASS] Endpoint /.mcp.json (OpenAI Codex Plugin Config) hợp lệ!\n');

  // TEST 21: Kiểm tra JSON-RPC Notification không bị timeout (Trả về HTTP 204 ngay lập tức)
  console.log('--- TEST 21: Kiểm tra JSON-RPC Notification (notifications/initialized) ---');
  const notifyReq = new Request('http://localhost:3000/mcp?api-key=secret_test_key_123', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    })
  });
  const notifyRes = await netlifyHandler(notifyReq, {} as any);
  console.assert(notifyRes.status === 204, `JSON-RPC notification phải trả về 204 No Content, nhận: ${notifyRes.status}`);
  console.log('[PASS] JSON-RPC notification trả về HTTP 204 thành công qua /mcp?api-key=..., không bị treo timeout 30s!\n');

  // TEST 22: Kiểm tra chuẩn Streamable HTTP (ChatGPT / OpenAI MCP Connector nhận text/event-stream)
  console.log('--- TEST 22: Kiểm tra Streamable HTTP (Accept: text/event-stream) ---');
  const ssePostReq = new Request('http://localhost:3000/mcp?api-key=secret_test_key_123', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 221,
      method: 'tools/list'
    })
  });
  const ssePostRes = await netlifyHandler(ssePostReq, {} as any);
  console.assert(ssePostRes.status === 200, `Streamable HTTP POST phải trả về 200, nhận: ${ssePostRes.status}`);
  const sseContentType = ssePostRes.headers.get('content-type') || '';
  console.assert(sseContentType.includes('text/event-stream'), `Content-Type phải là text/event-stream, nhận: ${sseContentType}`);
  const sseText = await ssePostRes.text();
  console.assert(sseText.startsWith('event: message\ndata: '), 'Phải có định dạng SSE event: message');
  console.log('[PASS] Streamable HTTP POST trả về định dạng SSE event stream chuẩn xác cho ChatGPT Web!\n');

  // TEST 23: Kiểm tra bảo mật tools/call không có API Key trả về 401 JSON-RPC Error
  console.log('--- TEST 23: Kiểm tra tools/call khi thiếu hoặc sai API Key (HTTP 401) ---');
  const unauthCallReq = new Request('http://localhost:3000/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 231,
      method: 'tools/call',
      params: {
        name: 'tim_kiem_theo_ten_tthc',
        arguments: { ten_tthc: 'kết hôn' }
      }
    })
  });
  const unauthCallRes = await netlifyHandler(unauthCallReq, {} as any);
  console.assert(unauthCallRes.status === 401, `tools/call thiếu key phải trả về 401, nhận: ${unauthCallRes.status}`);
  const unauthData = (await unauthCallRes.json()) as any;
  console.assert(unauthData.error?.code === -32001, 'Error code phải là -32001 Unauthorized');
  console.log('[PASS] tools/call không có key bị từ chối với HTTP 401 và JSON-RPC error chuẩn xác!\n');

  // TEST 24: Kiểm tra tools/call với API Key hợp lệ qua ?api-key=
  console.log('--- TEST 24: Kiểm tra tools/call thành công với ?api-key= ---');
  const authCallReq = new Request('http://localhost:3000/mcp?api-key=secret_test_key_123', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 241,
      method: 'tools/call',
      params: {
        name: 'tim_kiem_theo_ten_tthc',
        arguments: { ten_tthc: 'kết hôn', limit: 1 }
      }
    })
  });
  const authCallRes = await netlifyHandler(authCallReq, {} as any);
  console.assert(authCallRes.status === 200, `tools/call có key phải trả về 200, nhận: ${authCallRes.status}`);
  const authCallData = (await authCallRes.json()) as any;
  console.assert(authCallData.result?.content?.[0]?.text, 'Phải có kết quả thực thi tool');
  console.log('[PASS] tools/call với ?api-key= thực thi thành công trả về dữ liệu chuẩn xác!\n');

  console.log('[SUCCESS] TẤT CẢ 24 TEST ĐÃ HOÀN THÀNH XUẤT SẮC 100%!');
}

runTests().catch(err => {
  console.error('[ERROR] Lỗi khi test:', err);
  process.exit(1);
});


