import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { tthcDataService } from './data-service.js';
import { APP_NAME, APP_VERSION, APP_AUTHOR, APP_TITLE, MCP_PROTOCOL_VERSION } from './version.js';
import { isAuthRequired } from './auth.js';
import type { SearchResult, TTHCIndexItem } from './types.js';

/** Annotations chuẩn MCP: toàn bộ tool TTHC chỉ đọc dữ liệu công khai -> ChatGPT/Codex không cần hỏi xác nhận */
export const READ_ONLY_TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true
} as const;

const DVC_BASE_URL = 'https://dichvucong.gov.vn/thu-tuc-hanh-chinh';

export function formatSearchResultsToMarkdown(
  title: string,
  result: SearchResult<TTHCIndexItem>,
  keywordInfo?: string
): string {
  const lines: string[] = [];
  lines.push(`## ${title}`);
  if (keywordInfo) lines.push(`*${keywordInfo}*`);
  lines.push(
    `> Tìm thấy **${result.total}** thủ tục (Trang **${result.page}/${result.totalPages}**, hiển thị tối đa ${result.limit} mục/trang)\n`
  );

  if (result.data.length === 0) {
    lines.push('Không tìm thấy thủ tục hành chính nào phù hợp với tiêu chí.');
    return lines.join('\n');
  }

  for (let i = 0; i < result.data.length; i++) {
    const item = result.data[i];
    const itemNum = (result.page - 1) * result.limit + i + 1;
    const phi = item.co_thu_phi
      ? `Có phí${item.chi_tiet_phi ? ` (${item.chi_tiet_phi})` : ''}`
      : 'Miễn phí';

    const itemDvcUrl = item.id
      ? `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${item.id}`
      : undefined;

    lines.push(`### ${itemNum}. ${item.ten_tthc}`);
    lines.push(`- **Mã TTHC**: \`${item.ma_tthc}\``);
    lines.push(
      `- **Cấp thực hiện**: ${item.cap_thuc_hien || 'Chưa rõ'} | **Lĩnh vực**: ${item.linh_vuc || 'Chưa rõ'}`
    );
    lines.push(
      `- **Cơ quan thực hiện**: ${item.co_quan_thuc_hien || 'Chưa rõ'} | **Lệ phí**: ${phi}`
    );
    if (itemDvcUrl) {
      lines.push(
        `- **Link DVC Quốc gia**: [${itemDvcUrl}](${itemDvcUrl})`
      );
    }
    lines.push(
      `*Gợi ý: Dùng tool \`tra_cuu_theo_ma_tthc\` với mã \`${item.ma_tthc}\` để xem chi tiết hồ sơ & các bước thực hiện.*\n`
    );
  }

  if (result.page < result.totalPages) {
    lines.push(
      `--- \nĐể xem trang tiếp theo, gọi lại tool với tham số \`page: ${result.page + 1}\``
    );
  }

  return lines.join('\n');
}

// ==========================================
// ĐỊNH NGHĨA SCHEMA THAM SỐ CHO CÁC MCP TOOLS
// ==========================================

export const TraCuuChiTietSchema = z.object({
  ma_tthc: z
    .string()
    .min(1, 'Mã TTHC hoặc tên thủ tục không được để trống')
    .describe(
      'Mã thủ tục hành chính (ví dụ: "6.006781", "1.117102"), ID hoặc tên thủ tục cần truy xuất chi tiết'
    ),
  phan_muc: z
    .enum([
      'tat_ca',
      'ho_so',
      'trinh_tu',
      'chi_phi',
      'thoi_han',
      'can_cu_phap_ly',
      'yeu_cau_dieu_kien'
    ])
    .optional()
    .default('tat_ca')
    .describe(
      'Phân mục cụ thể cần trích xuất: "tat_ca" (toàn bộ), "ho_so" (thành phần & số lượng hồ sơ), "trinh_tu" (các bước thực hiện), "chi_phi" (phí, lệ phí), "thoi_han" (thời hạn giải quyết), "can_cu_phap_ly" (văn bản quy phạm pháp luật), "yeu_cau_dieu_kien" (điều kiện thực hiện)'
    ),
  dinh_dang: z
    .enum(['markdown', 'json'])
    .optional()
    .default('markdown')
    .describe(
      'Định dạng trả về: "markdown" (văn bản trình bày đẹp cho người dùng) hoặc "json" (dữ liệu có cấu trúc sạch cho AI agent xử lý logic)'
    )
});

export const TimKiemTheoTenSchema = z.object({
  ten_tthc: z
    .string()
    .min(1, 'Tên thủ tục hoặc từ khóa không được để trống')
    .describe(
      'Tên thủ tục hoặc từ khóa tìm kiếm (ví dụ: "đăng ký kết hôn", "hộ chiếu", "cấp giấy phép lái xe", "đất đai")'
    ),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Số lượng kết quả tối đa trên mỗi trang (1-50, mặc định: 10)'),
  page: z
    .number()
    .min(1)
    .optional()
    .default(1)
    .describe('Số trang kết quả cần lấy (mặc định: 1)')
});

export const LocTheoCapSchema = z.object({
  cap_thuc_hien: z
    .string()
    .min(1, 'Cấp thực hiện không được để trống')
    .describe(
      'Cấp thực hiện cần lọc (ví dụ: "Cấp Bộ", "Cấp tỉnh", "Cấp xã", "Cơ quan khác")'
    ),
  tu_khoa: z
    .string()
    .optional()
    .describe('Từ khóa tìm kiếm bổ sung trong danh sách lọc (tùy chọn)'),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Số lượng kết quả tối đa trên mỗi trang (1-50, mặc định: 10)'),
  page: z
    .number()
    .min(1)
    .optional()
    .default(1)
    .describe('Số trang kết quả (mặc định: 1)')
});

export const LocTheoLinhVucSchema = z.object({
  linh_vuc: z
    .string()
    .min(1, 'Lĩnh vực không được để trống')
    .describe(
      'Tên lĩnh vực cần lọc (ví dụ: "Hộ tịch", "Kinh doanh", "Xây dựng", "Đất đai", "Thuế", "Hải quan"...)'
    ),
  tu_khoa: z
    .string()
    .optional()
    .describe('Từ khóa tìm kiếm bổ sung trong lĩnh vực (tùy chọn)'),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Số lượng kết quả tối đa trên mỗi trang (1-50, mặc định: 10)'),
  page: z
    .number()
    .min(1)
    .optional()
    .default(1)
    .describe('Số trang kết quả (mặc định: 1)')
});

export const TimKiemTongHopSchema = z.object({
  tu_khoa: z
    .string()
    .optional()
    .describe('Từ khóa tên thủ tục hoặc nội dung cần tìm'),
  linh_vuc: z
    .string()
    .optional()
    .describe('Lĩnh vực cần lọc (ví dụ: "Hộ tịch", "Kinh doanh", "Xây dựng", "Đất đai", "Thuế"...)'),
  cap_thuc_hien: z
    .string()
    .optional()
    .describe('Cấp thực hiện cần lọc (ví dụ: "Cấp Bộ", "Cấp tỉnh", "Cấp xã")'),
  co_quan: z
    .string()
    .optional()
    .describe('Cơ quan thực hiện hoặc công bố/ban hành'),
  co_quan_ban_hanh: z
    .string()
    .optional()
    .describe('Cơ quan ban hành (tùy chọn)'),
  co_quan_thuc_hien: z
    .string()
    .optional()
    .describe('Cơ quan thực hiện (tùy chọn)'),
  co_thu_phi: z
    .boolean()
    .optional()
    .describe('true: chỉ lấy thủ tục có thu phí, false: chỉ lấy miễn phí'),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Số lượng kết quả tối đa (1-50, mặc định: 10)'),
  page: z.number().min(1).optional().default(1).describe('Số trang (mặc định: 1)')
});

export const GoiYThuTucLienQuanSchema = z.object({
  ma_hoac_ten_tthc: z
    .string()
    .optional()
    .describe(
      'Mã TTHC (ví dụ: "6.006781") hoặc tên thủ tục đang làm/đang xem để tìm các thủ tục liên quan tiếp nối (tùy chọn)'
    ),
  chu_de: z
    .string()
    .optional()
    .describe(
      'Chủ đề đời sống hoặc nghiệp vụ (ví dụ: "hộ kinh doanh", "cư trú", "y tế", "sinh con", "kết hôn", "mua đất", "doanh nghiệp", "đổi bằng lái xe", "hộ chiếu", "qua đời")'
    ),
  limit: z
    .number()
    .min(1)
    .max(20)
    .optional()
    .default(6)
    .describe('Số lượng thủ tục gợi ý tối đa (1-20, mặc định: 6)'),
  dinh_dang: z
    .enum(['markdown', 'json'])
    .optional()
    .default('markdown')
    .describe(
      'Định dạng trả về: "markdown" (văn bản phân tích dễ đọc) hoặc "json" (dữ liệu có cấu trúc cho AI agent)'
    )
});

export const TraCuuTthcGiaLaiSchema = z.object({
  tu_khoa: z
    .string()
    .optional()
    .describe(
      'Từ khóa tìm kiếm TTHC tỉnh Gia Lai (theo tên, mã thủ tục, nội dung nghiệp vụ... ví dụ: "đất đai", "cấp phép thi công", "lấn biển", "giao đất", "thu hồi giấy chứng nhận")'
    ),
  ma_tthc: z
    .string()
    .optional()
    .describe(
      'Mã TTHC cụ thể thuộc tỉnh Gia Lai nếu muốn truy xuất ngay chi tiết chuyên sâu (ví dụ: "1.115379", "1.014758", "1.115365")'
    ),
  cap_thuc_hien: z
    .enum(['tat_ca', 'cap_tinh', 'cap_xa', 'cap_xa_va_tinh'])
    .optional()
    .default('tat_ca')
    .describe(
      'Lọc theo cấp thực hiện tại Gia Lai: "tat_ca" (toàn bộ), "cap_tinh" (cấp tỉnh, sở ngành, VPĐKĐĐ), "cap_xa" (cấp xã/phường/thị trấn), "cap_xa_va_tinh" (liên thông cấp xã & tỉnh)'
    ),
  co_quan_thuc_hien: z
    .string()
    .optional()
    .describe(
      'Lọc theo cơ quan thực hiện: "Sở ngành", "Sở Xây dựng", "Sở Nông nghiệp và Môi trường", "Văn phòng Đăng ký đất đai", "Chi nhánh", "UBND cấp xã", "Chủ tịch UBND", "Ban Quản lý Khu kinh tế" hoặc tên địa phương: "Pleiku", "Chư Sê", "An Khê", "Ayun Pa", "Kbang", "Mang Yang"...'
    ),
  linh_vuc: z
    .string()
    .optional()
    .describe('Lọc theo lĩnh vực (ví dụ: "Đất đai", "Xây dựng", "Giao thông"...)'),
  chi_tiet: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Hiển thị chi tiết chuyên sâu các TTHC (hồ sơ, trình tự các bước, thời hạn, phí, căn cứ pháp lý, ngày công khai, cập nhật, điều chỉnh). Mặc định: false. Nếu truyền ma_tthc sẽ tự động hiển thị chi tiết.'
    ),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Số lượng kết quả hiển thị trên mỗi trang (1-50, mặc định: 10)'),
  page: z
    .number()
    .min(1)
    .optional()
    .default(1)
    .describe('Số trang kết quả (mặc định: 1)'),
  dinh_dang: z
    .enum(['markdown', 'json'])
    .optional()
    .default('markdown')
    .describe(
      'Định dạng kết quả trả về: "markdown" (văn bản đẹp) hoặc "json" (dữ liệu có cấu trúc cho AI agent)'
    )
});

export const TraCuuTthcNoiBoSchema = z.object({
  tu_khoa: z
    .string()
    .optional()
    .describe(
      'Từ khóa tìm kiếm TTHC nội bộ (theo tên thủ tục, mã, hoặc nội dung, ví dụ: "khoáng sản", "thi đua khen thưởng", "công chức", "bổ nhiệm", "giáo dục", "tài sản công", "ngân sách")'
    ),
  ma_tthc: z
    .string()
    .optional()
    .describe(
      'Mã TTHC nội bộ cụ thể nếu muốn truy xuất ngay chi tiết chuyên sâu (ví dụ: "6.006791", "5.003975", "5.003974")'
    ),
  co_quan: z
    .string()
    .optional()
    .describe(
      'Cơ quan thực hiện hoặc ban hành/công bố (ví dụ: "Bộ Nội vụ", "Bộ Công thương", "Bộ Giáo dục và Đào tạo", "Bộ Xây dựng", "UBND cấp tỉnh", "Thanh Hóa", "Lào Cai"...)'
    ),
  linh_vuc: z
    .string()
    .optional()
    .describe(
      'Lĩnh vực nghiệp vụ nội bộ (ví dụ: "Địa chất và khoáng sản", "Thi đua, khen thưởng", "Công chức, viên chức", "Bảo vệ môi trường", "Giáo dục"...)'
    ),
  cap_thuc_hien: z
    .enum(['tat_ca', 'cap_bo', 'cap_tinh', 'cap_xa'])
    .optional()
    .default('tat_ca')
    .describe('Lọc theo cấp thực hiện: "tat_ca" (toàn bộ), "cap_bo" (Cấp Bộ), "cap_tinh" (Cấp tỉnh), "cap_xa" (Cấp xã)'),
  nhom_noi_bo: z
    .enum(['tat_ca', 'giua_cac_co_quan', 'trong_noi_bo'])
    .optional()
    .default('tat_ca')
    .describe(
      'Phân nhóm TTHC nội bộ theo Nghị định số 385/2026/NĐ-CP của Chính phủ về kiểm soát thủ tục hành chính: "tat_ca" (toàn bộ), "giua_cac_co_quan" (giữa các cơ quan hành chính nhà nước), "trong_noi_bo" (nội bộ từng cơ quan)'
    ),
  chi_tiet: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Hiển thị chi tiết chuyên sâu các TTHC (hồ sơ, trình tự các bước, thời hạn giải quyết, căn cứ pháp lý). Mặc định: false. Nếu truyền ma_tthc sẽ tự động hiển thị chi tiết.'
    ),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Số lượng kết quả hiển thị trên mỗi trang (1-50, mặc định: 10)'),
  page: z
    .number()
    .min(1)
    .optional()
    .default(1)
    .describe('Số trang kết quả (mặc định: 1)'),
  dinh_dang: z
    .enum(['markdown', 'json'])
    .optional()
    .default('markdown')
    .describe('Định dạng kết quả trả về: "markdown" (văn bản đẹp) hoặc "json" (dữ liệu có cấu trúc cho AI agent)')
});

export const TraCuuTthcNoiBoGiaLaiSchema = z.object({
  tu_khoa: z
    .string()
    .optional()
    .describe(
      'Từ khóa tìm kiếm TTHC nội bộ tỉnh Gia Lai (theo tên thủ tục, mã, hoặc nội dung, ví dụ: "khoáng sản", "đất đai", "khen thưởng", "công chức", "ngân sách", "pleiku")'
    ),
  ma_tthc: z
    .string()
    .optional()
    .describe(
      'Mã TTHC nội bộ cụ thể (ví dụ: "5.003972", "5.003971") để xem toàn văn chi tiết hồ sơ, trình tự và căn cứ pháp lý'
    ),
  cap_thuc_hien: z
    .enum(['tat_ca', 'cap_tinh', 'cap_xa'])
    .optional()
    .default('tat_ca')
    .describe('Cấp thực hiện tại tỉnh Gia Lai: "tat_ca" (toàn bộ), "cap_tinh" (cấp tỉnh), "cap_xa" (cấp xã)'),
  co_quan: z
    .string()
    .optional()
    .describe(
      'Cơ quan thực hiện hoặc công bố tại tỉnh Gia Lai (ví dụ: "Chủ tịch Ủy ban nhân dân cấp tỉnh", "UBND tỉnh Gia Lai", "Sở Tài nguyên và Môi trường", "Sở Nông nghiệp", "VPĐKĐĐ...")'
    ),
  co_quan_thuc_hien: z
    .string()
    .optional()
    .describe('Alias cho tham số co_quan'),
  linh_vuc: z
    .string()
    .optional()
    .describe(
      'Lĩnh vực nghiệp vụ nội bộ (ví dụ: "Địa chất và khoáng sản", "Đất đai", "Nội vụ", "Tài chính", "Xây dựng", "Thi đua, khen thưởng")'
    ),
  nhom_noi_bo: z
    .enum(['tat_ca', 'giua_cac_co_quan', 'trong_noi_bo'])
    .optional()
    .default('tat_ca')
    .describe(
      'Phân nhóm TTHC nội bộ: "tat_ca" (toàn bộ), "giua_cac_co_quan" (giữa các cơ quan hành chính nhà nước), "trong_noi_bo" (nội bộ từng cơ quan)'
    ),
  chi_tiet: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Hiển thị chi tiết chuyên sâu các TTHC (hồ sơ, trình tự các bước, thời hạn giải quyết, căn cứ pháp lý). Mặc định: false. Nếu truyền ma_tthc sẽ tự động hiển thị chi tiết.'
    ),
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Số lượng kết quả hiển thị trên mỗi trang (1-50, mặc định: 10)'),
  page: z
    .number()
    .min(1)
    .optional()
    .default(1)
    .describe('Số trang kết quả (mặc định: 1)'),
  dinh_dang: z
    .enum(['markdown', 'json'])
    .optional()
    .default('markdown')
    .describe('Định dạng kết quả trả về: "markdown" (văn bản đẹp) hoặc "json" (dữ liệu có cấu trúc cho AI agent)')
});

export const ThongTinMcpServerSchema = z.object({});

export const LamMoiDuLieuSchema = z.object({
  bat_buoc: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'true: Bắt buộc tải lại toàn bộ cơ sở dữ liệu và dọn dẹp cache, false: tự động phát hiện thay đổi theo phiên bản mới nhất'
    )
});

/** Schema tool `search` chuẩn OpenAI (ChatGPT Connectors / Deep Research / Responses API) */
export const OpenAiSearchSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Câu truy vấn tìm thủ tục hành chính (tiếng Việt có dấu hoặc không dấu, hoặc mã TTHC)')
});

/** Schema tool `fetch` chuẩn OpenAI: lấy toàn văn tài liệu theo id trả về từ `search` */
export const OpenAiFetchSchema = z.object({
  id: z.string().min(1).describe('ID tài liệu (mã TTHC) nhận được từ kết quả tool `search`')
});

/**
 * Creates and configures the MCP Server instance with all TTHC tools
 */
export function createTTHCMcpServer(): McpServer {
  const server = new McpServer({
    name: APP_NAME,
    version: APP_VERSION
  });

  // TOOL 1: Tra cứu & Truy xuất dữ liệu chi tiết TTHC
  server.tool(
    'tra_cuu_theo_ma_tthc',
    'Tra cứu và truy xuất thông tin chi tiết chuyên sâu của Thủ tục Hành chính theo mã TTHC (ví dụ: "6.006781", "1.117102") hoặc tên/ID thủ tục. Hỗ trợ lọc theo từng phân mục cụ thể (hồ sơ, trình tự, chi phí, thời hạn giải quyết, căn cứ pháp lý, yêu cầu điều kiện) và tùy chọn định dạng trả về (Markdown hoặc JSON có cấu trúc).',
    TraCuuChiTietSchema.shape,
    async ({ ma_tthc, phan_muc, dinh_dang }) => {
      const result = await tthcDataService.getDetail(ma_tthc, {
        phan_muc,
        dinh_dang
      });

      if (dinh_dang === 'json') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: result.markdown
          }
        ]
      };
    }
  );

  // TOOL 2: Tìm kiếm theo tên TTHC
  server.tool(
    'tim_kiem_theo_ten_tthc',
    'Tìm kiếm danh sách Thủ tục Hành chính theo tên hoặc từ khóa (hỗ trợ cả tiếng Việt có dấu và không dấu). Trả về danh sách tóm tắt gồm mã TTHC, tên, cấp thực hiện, lĩnh vực và cơ quan thực hiện.',
    TimKiemTheoTenSchema.shape,
    async ({ ten_tthc, limit, page }) => {
      const result = await tthcDataService.searchByName(ten_tthc, page, limit);
      const md = formatSearchResultsToMarkdown(
        'Kết quả tìm kiếm theo tên thủ tục',
        result,
        `Từ khóa tìm kiếm: "${ten_tthc}"`
      );
      return {
        content: [
          {
            type: 'text',
            text: md
          }
        ]
      };
    }
  );

  // TOOL 3: Lọc theo Cấp thực hiện
  server.tool(
    'loc_theo_cap_thuc_hien',
    'Lọc danh sách Thủ tục Hành chính theo Cấp thực hiện (ví dụ: "Cấp Bộ", "Cấp tỉnh", "Cấp xã", "Cơ quan khác"). Có thể kết hợp thêm từ khóa tìm kiếm.',
    LocTheoCapSchema.shape,
    async ({ cap_thuc_hien, tu_khoa, limit, page }) => {
      const result = await tthcDataService.filterByCap(
        cap_thuc_hien,
        tu_khoa,
        page,
        limit
      );
      const md = formatSearchResultsToMarkdown(
        `Danh sách thủ tục thuộc: ${cap_thuc_hien}`,
        result,
        tu_khoa ? `Từ khóa kết hợp: "${tu_khoa}"` : undefined
      );
      return {
        content: [
          {
            type: 'text',
            text: md
          }
        ]
      };
    }
  );

  // TOOL 4: Lọc theo Lĩnh vực
  server.tool(
    'loc_theo_linh_vuc',
    'Lọc danh sách Thủ tục Hành chính theo Lĩnh vực thiết yếu (ví dụ: "Hộ tịch", "Kinh doanh", "Xây dựng", "Đất đai", "Thuế", "Hải quan", "Xuất nhập khẩu", "Đăng kiểm"...). Có thể kết hợp từ khóa tìm kiếm.',
    LocTheoLinhVucSchema.shape,
    async ({ linh_vuc, tu_khoa, limit, page }) => {
      const result = await tthcDataService.filterByLinhVuc(
        linh_vuc,
        tu_khoa,
        page,
        limit
      );
      const md = formatSearchResultsToMarkdown(
        `Danh sách thủ tục thuộc Lĩnh vực: ${linh_vuc}`,
        result,
        tu_khoa ? `Từ khóa kết hợp: "${tu_khoa}"` : undefined
      );
      return {
        content: [
          {
            type: 'text',
            text: md
          }
        ]
      };
    }
  );

  // TOOL 5: Tìm kiếm tổng hợp đa tiêu chí
  server.tool(
    'tim_kiem_tong_hop',
    'Tìm kiếm nâng cao kết hợp nhiều tiêu chí cùng lúc: từ khóa tên, lĩnh vực, cấp thực hiện, cơ quan thực hiện/ban hành và trạng thái thu phí.',
    TimKiemTongHopSchema.shape,
    async options => {
      const coQuan =
        options.co_quan ||
        options.co_quan_ban_hanh ||
        options.co_quan_thuc_hien;
      const result = await tthcDataService.searchAdvanced({
        ...options,
        co_quan: coQuan
      });
      const criteria: string[] = [];
      if (options.tu_khoa) criteria.push(`Từ khóa: "${options.tu_khoa}"`);
      if (options.linh_vuc) criteria.push(`Lĩnh vực: "${options.linh_vuc}"`);
      if (options.cap_thuc_hien) criteria.push(`Cấp: "${options.cap_thuc_hien}"`);
      if (coQuan) criteria.push(`Cơ quan: "${coQuan}"`);
      if (options.co_thu_phi !== undefined)
        criteria.push(options.co_thu_phi ? 'Có thu phí' : 'Miễn phí');

      const md = formatSearchResultsToMarkdown(
        'Kết quả tìm kiếm tổng hợp TTHC',
        result,
        criteria.join(' | ') || 'Tất cả tiêu chí'
      );
      return {
        content: [
          {
            type: 'text',
            text: md
          }
        ]
      };
    }
  );

  // TOOL 6: Gợi ý các thủ tục hành chính liên quan
  server.tool(
    'goi_y_thu_tuc_lien_quan',
    'Gợi ý các thủ tục hành chính liên quan theo chuỗi sự kiện đời sống / sản xuất kinh doanh (ví dụ: hộ kinh doanh, cư trú, y tế, sinh con, kết hôn, khai tử, mua bán chuyển nhượng nhà đất, cấp đổi giấy phép lái xe, thành lập doanh nghiệp, xuất nhập cảnh, hộ chiếu...) hoặc gợi ý các thủ tục liên thông cùng lĩnh vực/cơ quan với một thủ tục cụ thể. Rất hữu ích khi người dân/doanh nghiệp cần biết các bước tiếp theo phải làm.',
    GoiYThuTucLienQuanSchema.shape,
    async ({ ma_hoac_ten_tthc, chu_de, limit, dinh_dang }) => {
      const result = await tthcDataService.getRelatedProcedures({
        ma_hoac_ten_tthc,
        chu_de,
        limit
      });

      if (dinh_dang === 'json') {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: result.markdown
          }
        ]
      };
    }
  );

  // TOOL 7: Thông tin phiên bản & Hệ thống MCP
  server.tool(
    'thong_tin_mcp_server',
    'Lấy thông tin chi tiết về phiên bản ứng dụng MCP, tác giả, giao thức và tình trạng cơ sở dữ liệu.',
    ThongTinMcpServerSchema.shape,
    async () => {
      const stats = await tthcDataService.getStats();
      const lines: string[] = [];
      lines.push(`## ${APP_TITLE} (v${APP_VERSION})`);
      lines.push(`- **Tên hệ thống**: \`${APP_NAME}\``);
      lines.push(`- **Phiên bản ứng dụng**: **v${APP_VERSION}**`);
      lines.push(`- **Phát triển bởi**: **${APP_AUTHOR}**`);
      lines.push(`- **Chuẩn giao thức MCP**: \`${MCP_PROTOCOL_VERSION}\``);
      lines.push(`- **Tổng số thủ tục hành chính**: **${stats.totalRecords.toLocaleString('vi-VN')}** thủ tục`);
      lines.push(`- **Cập nhật dữ liệu quốc gia**: ${stats.lastUpdated}`);
      lines.push(`- **Nền tảng hỗ trợ**: SSE (Cursor AI, Claude Desktop, Windsurf) & Direct HTTP JSON-RPC`);

      return {
        content: [
          {
            type: 'text',
            text: lines.join('\n')
          }
        ]
      };
    }
  );

  // TOOL 8: Tra cứu chuyên sâu TTHC tỉnh Gia Lai
  const giaLaiHandler = async (params: z.infer<typeof TraCuuTthcGiaLaiSchema>) => {
    const result = await tthcDataService.searchGiaLaiProcedures(params);
    if (params.dinh_dang === 'json') {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: result.markdown
        }
      ]
    };
  };

  server.tool(
    'tra_cuu_tthc_gia_lai',
    'Tra cứu chuyên sâu các Thủ tục Hành chính thuộc tỉnh Gia Lai. Cơ quan thực hiện: tỉnh Gia Lai, các TTHC cấp tỉnh, cấp xã, sở ngành (Sở Xây dựng, Sở Nông nghiệp và Môi trường...), Văn phòng Đăng ký đất đai và các Chi nhánh cấp huyện (Pleiku, Chư Sê, Chư Prông, Đak Đoa, An Khê, Ayun Pa, Kbang...), Ban Quản lý Khu kinh tế, Chủ tịch UBND tỉnh Gia Lai... Hỗ trợ lọc theo cấp, cơ quan, lĩnh vực, từ khóa hoặc tra cứu chi tiết đầy đủ từng thủ tục.',
    TraCuuTthcGiaLaiSchema.shape,
    giaLaiHandler
  );

  server.tool(
    'tthc_gia_lai',
    'Tra cứu chi tiết các Thủ tục Hành chính thuộc tỉnh Gia Lai (Cơ quan thực hiện: tỉnh Gia Lai, cấp tỉnh, cấp xã, sở ngành, Chủ tịch UBND, Văn phòng Đăng ký đất đai...). Hỗ trợ tra cứu chi tiết các bước, hồ sơ hoặc danh sách.',
    TraCuuTthcGiaLaiSchema.shape,
    giaLaiHandler
  );

  // TOOL 9: Tra cứu chuyên sâu TTHC Nội bộ
  const noiBoHandler = async (params: z.infer<typeof TraCuuTthcNoiBoSchema>) => {
    const result = await tthcDataService.searchNoiBoProcedures(params);
    if (params.dinh_dang === 'json') {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: result.markdown
        }
      ]
    };
  };

  server.tool(
    'tra_cuu_tthc_noi_bo',
    'Tra cứu chuyên sâu các Thủ tục Hành chính nội bộ trong hệ thống hành chính nhà nước (theo Nghị định số 385/2026/NĐ-CP của Chính phủ về kiểm soát thủ tục hành chính). Gồm 2 nhóm: TTHC giữa các cơ quan hành chính nhà nước (liên thông, đa cơ quan/cấp) và TTHC nội bộ trong từng cơ quan (Bộ ngành, UBND cấp tỉnh, Sở ngành...). Hỗ trợ lọc theo từ khóa, mã TTHC, cơ quan thực hiện/công bố, lĩnh vực, cấp thực hiện, nhóm nội bộ và xuất chi tiết hồ sơ & quy trình.',
    TraCuuTthcNoiBoSchema.shape,
    noiBoHandler
  );

  server.tool(
    'tthc_noi_bo',
    'Tra cứu chi tiết các Thủ tục Hành chính nội bộ (giữa các cơ quan nhà nước và trong nội bộ cơ quan theo Nghị định số 385/2026/NĐ-CP của Chính phủ về kiểm soát thủ tục hành chính). Hỗ trợ lọc theo cơ quan, lĩnh vực, cấp thực hiện hoặc xuất chi tiết theo mã thủ tục.',
    TraCuuTthcNoiBoSchema.shape,
    noiBoHandler
  );

  // TOOL 10: Tra cứu chuyên sâu TTHC Nội bộ tỉnh Gia Lai
  const noiBoGiaLaiHandler = async (params: z.infer<typeof TraCuuTthcNoiBoGiaLaiSchema>) => {
    const result = await tthcDataService.searchNoiBoGiaLaiProcedures(params);
    if (params.dinh_dang === 'json') {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
    return {
      content: [
        {
          type: 'text' as const,
          text: result.markdown
        }
      ]
    };
  };

  server.tool(
    'tra_cuu_tthc_noi_bo_gia_lai',
    'Tra cứu chuyên sâu các Thủ tục Hành chính Nội bộ thuộc phạm vi tỉnh Gia Lai (cấp tỉnh, cấp xã, UBND tỉnh Gia Lai, Chủ tịch UBND tỉnh, các Sở ban ngành địa phương). Bao gồm TTHC giữa các cơ quan hành chính nhà nước và TTHC nội bộ trong từng cơ quan trên địa bàn tỉnh Gia Lai theo Nghị định số 385/2026/NĐ-CP. Hỗ trợ lọc theo từ khóa, mã TTHC, cơ quan, lĩnh vực, cấp thực hiện, nhóm nội bộ và xuất chi tiết quy trình & hồ sơ.',
    TraCuuTthcNoiBoGiaLaiSchema.shape,
    noiBoGiaLaiHandler
  );

  server.tool(
    'tthc_noi_bo_gia_lai',
    'Tra cứu chi tiết các Thủ tục Hành chính Nội bộ tỉnh Gia Lai (alias của tra_cuu_tthc_noi_bo_gia_lai). Hỗ trợ lọc theo cấp tỉnh, cấp xã, cơ quan ban ngành hoặc tra cứu toàn văn theo mã TTHC.',
    TraCuuTthcNoiBoGiaLaiSchema.shape,
    noiBoGiaLaiHandler
  );

  server.tool(
    'tthc_gia_lai_noi_bo',
    'Tra cứu TTHC Nội bộ tỉnh Gia Lai (alias rút gọn của tra_cuu_tthc_noi_bo_gia_lai).',
    TraCuuTthcNoiBoGiaLaiSchema.shape,
    noiBoGiaLaiHandler
  );

  // TOOL 9: `search` chuẩn OpenAI (bắt buộc cho ChatGPT Deep Research / Company Knowledge connectors)
  server.tool(
    'search',
    'Tìm kiếm thủ tục hành chính Việt Nam trong CSDL quốc gia. Trả về JSON {"results":[{"id","title","url"}]}; dùng tool `fetch` với `id` để lấy toàn văn.',
    OpenAiSearchSchema.shape,
    async ({ query }) => {
      const result = await tthcDataService.searchByName(query, 1, 10);
      const results = result.data.map(item => ({
        id: item.ma_tthc || item.id,
        title: item.ten_tthc,
        url: item.id ? `${DVC_BASE_URL}/${item.id}` : DVC_BASE_URL
      }));
      return { content: [{ type: 'text', text: JSON.stringify({ results }) }] };
    }
  );

  // TOOL 10: `fetch` chuẩn OpenAI
  server.tool(
    'fetch',
    'Lấy toàn văn chi tiết một thủ tục hành chính theo `id` (mã TTHC) trả về từ tool `search`. Trả về JSON {"id","title","text","url","metadata"}.',
    OpenAiFetchSchema.shape,
    async ({ id }) => {
      const detail = await tthcDataService.getDetail(id, { phan_muc: 'tat_ca', dinh_dang: 'markdown' });
      const item = detail.indexItem;
      const systemId = detail.detail?.id || item?.id;
      const doc = {
        id,
        title: detail.detail?.name || item?.ten_tthc || id,
        text: detail.markdown,
        url: systemId ? `${DVC_BASE_URL}/${systemId}` : DVC_BASE_URL,
        metadata: {
          ma_tthc: item?.ma_tthc || detail.detail?.code || id,
          cap_thuc_hien: item?.cap_thuc_hien,
          linh_vuc: item?.linh_vuc,
          co_quan_thuc_hien: item?.co_quan_thuc_hien,
          co_thu_phi: item?.co_thu_phi
        }
      };
      return { content: [{ type: 'text', text: JSON.stringify(doc) }] };
    }
  );

  // TOOL 11: Làm mới & Tự động cập nhật dữ liệu TTHC
  server.tool(
    'lam_moi_du_lieu_tthc',
    'Kiểm tra và tự động cập nhật cơ sở dữ liệu TTHC Quốc gia mới nhất từ CDN/GitHub. Nếu phát hiện phiên bản mới, hệ thống tự động tải lại index, làm mới danh mục và dọn dẹp bộ nhớ đệm (cache invalidation). Hỗ trợ tùy chọn bat_buoc để nạp mới hoàn toàn.',
    LamMoiDuLieuSchema.shape,
    async ({ bat_buoc }) => {
      const updateResult = await tthcDataService.checkAndAutoUpdate(bat_buoc);
      const lines: string[] = [];
      lines.push('## Cập Nhật & Đồng Bộ Dữ Liệu TTHC Quốc Gia');
      lines.push(`- **Trạng thái**: ${updateResult.hasUpdate ? 'Đã cập nhật dữ liệu mới' : 'Dữ liệu đã là mới nhất'}`);
      lines.push(`- **Thông điệp**: ${updateResult.message}`);
      lines.push(`- **Phiên bản trước**: ${updateResult.oldVersion || 'N/A'}`);
      lines.push(`- **Phiên bản mới nhất**: ${updateResult.newVersion}`);
      lines.push(`- **Tổng số thủ tục hiện hành**: **${updateResult.totalRecords.toLocaleString('vi-VN')}** thủ tục`);
      lines.push(`- **Thời gian đồng bộ**: ${new Date().toLocaleString('vi-VN')}`);
      return {
        content: [
          {
            type: 'text',
            text: lines.join('\n')
          }
        ]
      };
    }
  );

  return server;
}

type JsonRpcLike = { jsonrpc?: string; id?: unknown; method?: unknown; result?: unknown; error?: unknown };

/** JSON-RPC notification (không có id) hoặc response từ client -> server KHÔNG phải trả lời */
export function isJsonRpcNotificationOrResponse(message: unknown): boolean {
  if (!message || typeof message !== 'object') return false;
  const msg = message as JsonRpcLike;
  const hasId = msg.id !== undefined && msg.id !== null;
  const isResponse = msg.method === undefined && (msg.result !== undefined || msg.error !== undefined);
  return isResponse || (typeof msg.method === 'string' && !hasId);
}

/**
 * Execute a JSON-RPC message directly through the MCP Server using InMemoryTransport
 */
export async function executeJsonRpcMessage(message: unknown): Promise<unknown> {
  // Chuẩn hóa tên tool nếu client gọi alias (đảm bảo không bao giờ bị lỗi Tool not found)
  if (message && typeof message === 'object') {
    const msg = message as { method?: string; params?: { name?: string } };
    if (msg.method === 'tools/call' && msg.params && typeof msg.params.name === 'string') {
      const aliasMap: Record<string, string> = {
        chi_tiet_tthc: 'tra_cuu_theo_ma_tthc',
        chi_tiet: 'tra_cuu_theo_ma_tthc',
        tra_cuu_chi_tiet: 'tra_cuu_theo_ma_tthc',
        truy_xuat_chi_tiet_tthc: 'tra_cuu_theo_ma_tthc',
        truy_xuat_chi_tiet: 'tra_cuu_theo_ma_tthc',
        xem_chi_tiet: 'tra_cuu_theo_ma_tthc',
        xem_chi_tiet_tthc: 'tra_cuu_theo_ma_tthc',
        chi_tiet_thu_tuc: 'tra_cuu_theo_ma_tthc',
        gia_lai: 'tra_cuu_tthc_gia_lai',
        tra_cuu_gia_lai: 'tra_cuu_tthc_gia_lai',
        thu_tuc_gia_lai: 'tra_cuu_tthc_gia_lai',
        tthc_tinh_gia_lai: 'tra_cuu_tthc_gia_lai',
        tthc_gia_lai: 'tra_cuu_tthc_gia_lai',
        tra_cuu_tthc_gia_lai: 'tra_cuu_tthc_gia_lai',
        goi_y_thu_tuc_lien_quan: 'goi_y_thu_tuc_lien_quan',
        thu_tuc_lien_quan: 'goi_y_thu_tuc_lien_quan',
        goi_y_lien_quan: 'goi_y_thu_tuc_lien_quan',
        related_procedures: 'goi_y_thu_tuc_lien_quan',
        tra_cuu_theo_co_quan_ban_hanh: 'tim_kiem_tong_hop',
        tra_cuu_theo_co_quan_cong_bo: 'tim_kiem_tong_hop',
        loc_theo_co_quan_ban_hanh: 'tim_kiem_tong_hop',
        loc_theo_co_quan_cong_bo: 'tim_kiem_tong_hop',
        co_quan_ban_hanh: 'tim_kiem_tong_hop',
        co_quan_cong_bo: 'tim_kiem_tong_hop',
        tra_cuu_theo_co_quan_thuc_hien: 'tim_kiem_tong_hop',
        tra_cuu_theo_co_quan: 'tim_kiem_tong_hop',
        tim_kiem_theo_co_quan: 'tim_kiem_tong_hop',
        loc_theo_co_quan: 'tim_kiem_tong_hop',
        loc_theo_co_quan_thuc_hien: 'tim_kiem_tong_hop',
        tra_cuu_co_quan: 'tim_kiem_tong_hop',
        tthc_noi_bo: 'tra_cuu_tthc_noi_bo',
        tra_cuu_noi_bo: 'tra_cuu_tthc_noi_bo',
        thu_tuc_noi_bo: 'tra_cuu_tthc_noi_bo',
        noi_bo: 'tra_cuu_tthc_noi_bo',
        tthc_noibo: 'tra_cuu_tthc_noi_bo',
        tra_cuu_tthc_noibo: 'tra_cuu_tthc_noi_bo',
        lam_moi_du_lieu: 'lam_moi_du_lieu_tthc',
        cap_nhat_du_lieu: 'lam_moi_du_lieu_tthc',
        cap_nhat_du_lieu_tthc: 'lam_moi_du_lieu_tthc',
        refresh_tthc_data: 'lam_moi_du_lieu_tthc',
        refresh_data: 'lam_moi_du_lieu_tthc',
        refresh_cache: 'lam_moi_du_lieu_tthc',
        dong_bo_du_lieu: 'lam_moi_du_lieu_tthc',
        reload_database: 'lam_moi_du_lieu_tthc'
      };
      if (aliasMap[msg.params.name]) {
        msg.params.name = aliasMap[msg.params.name];
      }
    }
  }

  const mcpServer = createTTHCMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await mcpServer.connect(serverTransport);
  await clientTransport.start();

  // Notification (vd notifications/initialized) & response: chỉ chuyển tiếp, không chờ phản hồi
  // (trước đây bị treo 30 giây rồi lỗi 500 -> làm hỏng handshake của OpenAI / Codex / Claude)
  if (isJsonRpcNotificationOrResponse(message)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await clientTransport.send(message as any).catch(() => {});
    await mcpServer.close().catch(() => {});
    return null;
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('JSON-RPC request timed out after 30 seconds'));
    }, 30000);

    clientTransport.onmessage = responseMsg => {
      // Bỏ qua notification phát sinh từ server (logging, list_changed...) - chỉ nhận response khớp id
      const incoming = responseMsg as JsonRpcLike;
      if (incoming.id === undefined || incoming.id !== (message as JsonRpcLike).id) {
        return;
      }
      clearTimeout(timeout);
      mcpServer.close().catch(() => {});
      // Chuẩn hóa schema cho tất cả các tools nếu đây là phản hồi tools/list
      // Đảm bảo không bao giờ bị lỗi thiếu schema trên bất kỳ client nào (Claude, Cursor, OpenAI, Dify, v.v.)
      const res = responseMsg as {
        result?: {
          tools?: Array<{
            name: string;
            inputSchema?: {
              type?: string;
              properties?: Record<string, unknown>;
              required?: string[];
              $schema?: string;
              additionalProperties?: boolean;
            };
          }>;
        };
      };

      if (res?.result?.tools && Array.isArray(res.result.tools)) {
        for (const tool of res.result.tools as Array<(typeof res.result.tools)[number] & { annotations?: Record<string, unknown> }>) {
          tool.annotations = { ...READ_ONLY_TOOL_ANNOTATIONS, ...(tool.annotations || {}) };
          if (!tool.inputSchema) {
            tool.inputSchema = {
              $schema: 'http://json-schema.org/draft-07/schema#',
              type: 'object',
              properties: {},
              required: [],
              additionalProperties: false
            };
          } else {
            if (!tool.inputSchema.type) tool.inputSchema.type = 'object';
            if (!tool.inputSchema.properties) tool.inputSchema.properties = {};
            if (!tool.inputSchema.required) tool.inputSchema.required = [];
            if (!tool.inputSchema.$schema) {
              tool.inputSchema.$schema = 'http://json-schema.org/draft-07/schema#';
            }
          }
        }
      }

      resolve(responseMsg);
    };

    clientTransport.onerror = err => {
      clearTimeout(timeout);
      reject(err);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientTransport.send(message as any).catch(err => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Manifest chuẩn hóa tương thích 100% với OpenAI Plugins (https://developers.openai.com/plugins) và Custom GPT Actions
 */
export function getOpenAiPluginManifest(baseUrl = 'https://mcp-tthc.netlify.app') {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return {
    schema_version: 'v1',
    name_for_human: 'Tra cứu TTHC Quốc Gia',
    name_for_model: 'tra_cuu_tthc_dvcqg',
    description_for_human:
      'Tra cứu thông tin thủ tục hành chính, dịch vụ công quốc gia Việt Nam (hồ sơ, lệ phí, thời hạn, cơ quan giải quyết, gợi ý thủ tục liên quan).',
    description_for_model:
      'Plugin tra cứu toàn diện cơ sở dữ liệu quốc gia về Thủ tục Hành chính (TTHC) Việt Nam. Cho phép tìm kiếm thủ tục theo tên hoặc từ khóa (hỗ trợ cả tiếng Việt có dấu và không dấu), truy xuất chi tiết chuyên sâu theo mã TTHC hoặc tên thủ tục (tùy chọn trích xuất từng phân mục: hồ sơ, trình tự, chi phí, thời hạn, căn cứ pháp lý; tùy chọn định dạng Markdown hoặc JSON có cấu trúc), lọc theo cấp thực hiện (Cấp Bộ, Cấp tỉnh, Cấp xã), lọc theo lĩnh vực, tìm kiếm đa tiêu chí kết hợp cơ quan ban hành hoặc thực hiện, và gợi ý các thủ tục liên quan theo chuỗi sự kiện đời sống / kinh doanh (hộ kinh doanh, cư trú, y tế, sinh con, kết hôn, nhà đất, doanh nghiệp, lái xe, hộ chiếu...).',
    // Khi bật API key chia sẻ: người dùng nhập key (Bearer) lúc cài đặt; ngược lại mở công khai
    auth: isAuthRequired()
      ? { type: 'user_http', authorization_type: 'bearer' }
      : { type: 'none' },
    api: {
      type: 'openapi',
      url: `${cleanBase}/openapi.json`
    },
    logo_url: `${cleanBase}/logo.svg`,
    contact_email: 'info@dnncloud.net',
    legal_info_url: `${cleanBase}/`
  };
}

/**
 * Manifest Agent Plugins chuẩn mới của OpenAI (https://agent-plugins.org / OpenAI Codex & ChatGPT Plugins)
 */
export function getOpenAiAgentPluginManifest(baseUrl = 'https://mcp-tthc.netlify.app') {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: APP_NAME,
    version: APP_VERSION,
    description: 'Tra cứu cơ sở dữ liệu quốc gia về Thủ tục Hành chính (TTHC) Việt Nam qua MCP Protocol.',
    author: {
      name: APP_AUTHOR,
      email: 'info@dnncloud.net',
      url: cleanBase
    },
    homepage: cleanBase,
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
          websiteURL: cleanBase,
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
}

/**
 * Cấu hình MCP Server chuẩn OpenAI Agent Plugins (mcp.json) hỗ trợ xác thực Shared API Key qua Bearer header
 */
export function getOpenAiMcpConfig(baseUrl = 'https://mcp-tthc.netlify.app') {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const authConfig = isAuthRequired()
    ? {
        type: 'api_key',
        headerScheme: 'bearer'
      }
    : {
        type: 'none'
      };

  return {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: {
      'tthc-dvcqg': {
        type: 'streamable-http',
        url: `${cleanBase}/mcp`,
        description: 'MCP Server tra cứu TTHC Việt Nam triển khai tối ưu trên Netlify Functions',
        extensions: {
          'com.openai': {
            auth: authConfig
          }
        }
      }
    }
  };
}

/**
 * Cấu hình OpenAI Codex Plugin (.mcp.json) sử dụng biến môi trường client để tiêm Bearer token tự động
 */
export function getOpenAiCodexMcpConfig(baseUrl = 'https://mcp-tthc.netlify.app') {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return {
    mcpServers: {
      tthc_dvcqg: {
        type: 'http',
        url: `${cleanBase}/mcp`,
        bearer_token_env_var: 'MCP_TTHC_API_KEY'
      }
    }
  };
}

/**
 * Tạo tài liệu OpenAPI 3.1.0 chuẩn hóa để tích hợp với OpenAI Plugins, Custom GPTs, Dify, Coze, n8n, Postman & Swagger
 */
export function getOpenApiSchema(baseUrl = 'https://mcp-tthc.netlify.app') {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return {
    openapi: '3.1.0',
    info: {
      title: APP_TITLE,
      version: APP_VERSION,
      description:
        'API & MCP Server tra cứu Thủ tục Hành chính Quốc gia Việt Nam. Hỗ trợ tra cứu theo mã TTHC, tìm kiếm theo tên, phân cấp thực hiện, phân lĩnh vực và thống kê tổng hợp.',
      contact: {
        name: APP_AUTHOR
      }
    },
    servers: [
      {
        url: cleanBase,
        description: 'Server hiện tại'
      }
    ],
    // Bảo mật API key chia sẻ: hỗ trợ Bearer header, X-API-Key header, hoặc tham số URL ?api-key=... (?key=...)
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }, { apiKeyQuery: [] }, { apiKeyQueryLegacy: [] }],
    paths: {
      '/.well-known/ai-plugin.json': {
        get: {
          security: [],
          operationId: 'getAiPluginManifest',
          summary: 'Lấy manifest cấu hình OpenAI Plugin (ai-plugin.json)',
          responses: {
            '200': {
              description: 'Manifest OpenAI Plugin v1 hợp lệ'
            }
          }
        }
      },
      '/mcp': {
        get: {
          operationId: 'getMcpServerInfo',
          summary: 'Lấy thông tin máy chủ MCP, trạng thái và hướng dẫn kết nối',
          responses: {
            '200': {
              description: 'Thông tin hệ thống và hướng dẫn kết nối MCP'
            }
          }
        },
        post: {
          operationId: 'executeMcpJsonRpc',
          summary: 'Thực thi giao thức MCP JSON-RPC 2.0',
          description:
            'Gửi payload JSON-RPC 2.0 để gọi các MCP tools hoặc khởi tạo phiên giao thức Model Context Protocol.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['jsonrpc', 'method', 'id'],
                  properties: {
                    jsonrpc: { type: 'string', example: '2.0' },
                    id: { type: 'integer', example: 1 },
                    method: { type: 'string', example: 'tools/call' },
                    params: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', example: 'tim_kiem_theo_ten_tthc' },
                        arguments: { type: 'object' }
                      }
                    }
                  }
                }
              }
            }
          },
          responses: {
            '200': {
              description: 'Kết quả phản hồi JSON-RPC 2.0 hợp lệ'
            }
          }
        }
      },
      '/api/tthc/search': {
        get: {
          operationId: 'searchTTHC',
          summary: 'Tìm kiếm thủ tục hành chính theo tên hoặc từ khóa',
          parameters: [
            {
              name: 'q',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Từ khóa tìm kiếm (ví dụ: "đăng ký kết hôn", "hộ chiếu")'
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 10 },
              description: 'Số lượng kết quả mỗi trang (1-50)'
            },
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 },
              description: 'Số trang'
            }
          ],
          responses: {
            '200': {
              description: 'Danh sách kết quả tìm kiếm thủ tục hành chính'
            }
          }
        }
      },
      '/api/tthc/detail': {
        get: {
          operationId: 'getTTHCDetail',
          summary: 'Truy xuất thông tin chi tiết chuyên sâu của thủ tục hành chính',
          parameters: [
            {
              name: 'ma_tthc',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Mã TTHC (ví dụ: "6.006781"), ID hoặc tên thủ tục'
            },
            {
              name: 'phan_muc',
              in: 'query',
              schema: {
                type: 'string',
                enum: [
                  'tat_ca',
                  'ho_so',
                  'trinh_tu',
                  'chi_phi',
                  'thoi_han',
                  'can_cu_phap_ly',
                  'yeu_cau_dieu_kien'
                ],
                default: 'tat_ca'
              },
              description: 'Phân mục chi tiết cần lấy'
            },
            {
              name: 'dinh_dang',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['markdown', 'json'],
                default: 'markdown'
              },
              description: 'Định dạng dữ liệu trả về'
            }
          ],
          responses: {
            '200': {
              description: 'Chi tiết hồ sơ, trình tự, chi phí và căn cứ pháp lý của thủ tục'
            }
          }
        }
      },
      '/api/tthc/related': {
        get: {
          operationId: 'getRelatedProcedures',
          summary: 'Gợi ý các thủ tục hành chính liên quan theo ngữ cảnh đời sống hoặc thủ tục gốc',
          parameters: [
            {
              name: 'ma_tthc',
              in: 'query',
              schema: { type: 'string' },
              description: 'Mã TTHC hoặc tên thủ tục gốc đang xem xét'
            },
            {
              name: 'chu_de',
              in: 'query',
              schema: { type: 'string' },
              description: 'Chủ đề đời sống / kinh doanh (ví dụ: "hộ kinh doanh", "cư trú", "y tế", "sinh con", "kết hôn", "mua bán nhà đất", "thành lập doanh nghiệp")'
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 6 },
              description: 'Số lượng thủ tục gợi ý tối đa'
            },
            {
              name: 'dinh_dang',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['markdown', 'json'],
                default: 'markdown'
              },
              description: 'Định dạng trả về'
            }
          ],
          responses: {
            '200': {
              description: 'Danh sách các thủ tục hành chính liên quan',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/RelatedProceduresResult' }
                }
              }
            }
          }
        },
        post: {
          operationId: 'postRelatedProcedures',
          summary: 'Gợi ý thủ tục hành chính liên quan (gửi payload JSON)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GoiYThuTucLienQuanInput' }
              }
            }
          },
          responses: {
            '200': {
              description: 'Danh sách các thủ tục hành chính liên quan',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/RelatedProceduresResult' }
                }
              }
            }
          }
        }
      },
      '/api/tthc/cap': {
        get: {
          operationId: 'filterByCap',
          summary: 'Lọc thủ tục hành chính theo Cấp thực hiện',
          parameters: [
            {
              name: 'cap',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Cấp thực hiện (ví dụ: "Cấp Bộ", "Cấp tỉnh", "Cấp xã")'
            },
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string' },
              description: 'Từ khóa tìm kiếm phụ'
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 10 }
            },
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 }
            }
          ],
          responses: {
            '200': { description: 'Danh sách thủ tục thuộc cấp thực hiện' }
          }
        }
      },
      '/api/tthc/linhvuc': {
        get: {
          operationId: 'filterByLinhVuc',
          summary: 'Lọc thủ tục hành chính theo Lĩnh vực',
          parameters: [
            {
              name: 'linhvuc',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Tên lĩnh vực (ví dụ: "Đất đai", "Thuế", "Hải quan")'
            },
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string' },
              description: 'Từ khóa tìm kiếm phụ'
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 10 }
            },
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 }
            }
          ],
          responses: {
            '200': { description: 'Danh sách thủ tục thuộc lĩnh vực' }
          }
        }
      },
      '/api/tthc/coquan': {
        get: {
          operationId: 'filterByCoQuan',
          summary: 'Lọc thủ tục hành chính theo Cơ quan thực hiện',
          parameters: [
            {
              name: 'co_quan',
              in: 'query',
              required: true,
              schema: { type: 'string' },
              description: 'Tên cơ quan (ví dụ: "Cục Đăng kiểm Việt Nam", "Bộ Tài chính")'
            },
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string' },
              description: 'Từ khóa tìm kiếm phụ'
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 10 }
            },
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 }
            }
          ],
          responses: {
            '200': { description: 'Danh sách thủ tục thuộc cơ quan thực hiện' }
          }
        }
      },
      '/api/tthc/advanced': {
        get: {
          operationId: 'advancedSearchTTHC',
          summary: 'Tìm kiếm tổng hợp TTHC đa tiêu chí (tên, cấp, lĩnh vực, cơ quan, phí)',
          parameters: [
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string' },
              description: 'Từ khóa tìm kiếm tên thủ tục'
            },
            {
              name: 'linhvuc',
              in: 'query',
              schema: { type: 'string' },
              description: 'Lĩnh vực (ví dụ: "Hộ tịch", "Kinh doanh", "Xây dựng", "Đất đai")'
            },
            {
              name: 'cap',
              in: 'query',
              schema: { type: 'string' },
              description: 'Cấp thực hiện (ví dụ: "Cấp Bộ", "Cấp tỉnh", "Cấp xã")'
            },
            {
              name: 'co_quan',
              in: 'query',
              schema: { type: 'string' },
              description: 'Cơ quan thực hiện hoặc ban hành'
            },
            {
              name: 'co_thu_phi',
              in: 'query',
              schema: { type: 'boolean' },
              description: 'true: chỉ lấy thủ tục có thu phí, false: chỉ lấy miễn phí'
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 10 }
            },
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 }
            }
          ],
          responses: {
            '200': { description: 'Danh sách kết quả tìm kiếm tổng hợp' }
          }
        }
      },
      '/api/tthc/gialai': {
        get: {
          operationId: 'searchGiaLaiProcedures',
          summary: 'Tra cứu chuyên sâu các Thủ tục Hành chính thuộc tỉnh Gia Lai (Cơ quan thực hiện: tỉnh Gia Lai, cấp tỉnh, cấp xã, sở ngành, Chủ tịch UBND...)',
          parameters: [
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string' },
              description: 'Từ khóa tìm kiếm TTHC tỉnh Gia Lai'
            },
            {
              name: 'ma_tthc',
              in: 'query',
              schema: { type: 'string' },
              description: 'Mã TTHC cụ thể nếu muốn xem chi tiết'
            },
            {
              name: 'cap',
              in: 'query',
              schema: { type: 'string', enum: ['tat_ca', 'cap_tinh', 'cap_xa', 'cap_xa_va_tinh'] },
              description: 'Cấp thực hiện tại Gia Lai'
            },
            {
              name: 'co_quan',
              in: 'query',
              schema: { type: 'string' },
              description: 'Cơ quan thực hiện (Sở ngành, Chi nhánh VPĐKĐĐ, UBND cấp xã, Chủ tịch UBND...)'
            },
            {
              name: 'linh_vuc',
              in: 'query',
              schema: { type: 'string' },
              description: 'Lĩnh vực thực hiện'
            },
            {
              name: 'chi_tiet',
              in: 'query',
              schema: { type: 'boolean', default: false },
              description: 'Hiển thị chi tiết toàn bộ hồ sơ và quy trình'
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 10 }
            },
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 }
            }
          ],
          responses: {
            '200': { description: 'Danh sách và thông tin chi tiết TTHC tỉnh Gia Lai' }
          }
        }
      },
      '/api/tthc/noi-bo': {
        get: {
          operationId: 'searchNoiBoProcedures',
          summary: 'Tra cứu chuyên sâu các Thủ tục Hành chính nội bộ trong hệ thống hành chính nhà nước (theo Nghị định số 385/2026/NĐ-CP của Chính phủ về kiểm soát thủ tục hành chính)',
          parameters: [
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string' },
              description: 'Từ khóa tìm kiếm TTHC nội bộ'
            },
            {
              name: 'ma_tthc',
              in: 'query',
              schema: { type: 'string' },
              description: 'Mã TTHC nội bộ cụ thể nếu muốn xem chi tiết'
            },
            {
              name: 'cap',
              in: 'query',
              schema: { type: 'string', enum: ['tat_ca', 'cap_bo', 'cap_tinh', 'cap_xa'] },
              description: 'Cấp thực hiện'
            },
            {
              name: 'co_quan',
              in: 'query',
              schema: { type: 'string' },
              description: 'Cơ quan thực hiện hoặc ban hành/công bố'
            },
            {
              name: 'linh_vuc',
              in: 'query',
              schema: { type: 'string' },
              description: 'Lĩnh vực nghiệp vụ nội bộ'
            },
            {
              name: 'nhom_noi_bo',
              in: 'query',
              schema: { type: 'string', enum: ['tat_ca', 'giua_cac_co_quan', 'trong_noi_bo'] },
              description: 'Phân nhóm TTHC nội bộ'
            },
            {
              name: 'chi_tiet',
              in: 'query',
              schema: { type: 'boolean', default: false },
              description: 'Hiển thị chi tiết toàn bộ hồ sơ và quy trình'
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 10 }
            },
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 }
            }
          ],
          responses: {
            '200': { description: 'Danh sách và thông tin chi tiết TTHC nội bộ' }
          }
        }
      },
      '/api/tthc/noi-bo-gia-lai': {
        get: {
          operationId: 'searchNoiBoGiaLaiProcedures',
          summary: 'Tra cứu chuyên sâu các Thủ tục Hành chính Nội bộ thuộc phạm vi tỉnh Gia Lai',
          parameters: [
            {
              name: 'q',
              in: 'query',
              schema: { type: 'string' },
              description: 'Từ khóa tìm kiếm TTHC nội bộ tỉnh Gia Lai'
            },
            {
              name: 'ma_tthc',
              in: 'query',
              schema: { type: 'string' },
              description: 'Mã TTHC nội bộ cụ thể nếu muốn xem chi tiết'
            },
            {
              name: 'cap',
              in: 'query',
              schema: { type: 'string', enum: ['tat_ca', 'cap_tinh', 'cap_xa'] },
              description: 'Cấp thực hiện tại tỉnh Gia Lai'
            },
            {
              name: 'co_quan',
              in: 'query',
              schema: { type: 'string' },
              description: 'Cơ quan thực hiện hoặc ban hành/công bố'
            },
            {
              name: 'linh_vuc',
              in: 'query',
              schema: { type: 'string' },
              description: 'Lĩnh vực nghiệp vụ nội bộ'
            },
            {
              name: 'nhom_noi_bo',
              in: 'query',
              schema: { type: 'string', enum: ['tat_ca', 'giua_cac_co_quan', 'trong_noi_bo'] },
              description: 'Phân nhóm TTHC nội bộ'
            },
            {
              name: 'chi_tiet',
              in: 'query',
              schema: { type: 'boolean', default: false },
              description: 'Hiển thị chi tiết toàn bộ hồ sơ và quy trình'
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 10 }
            },
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 }
            }
          ],
          responses: {
            '200': { description: 'Danh sách và thông tin chi tiết TTHC nội bộ tỉnh Gia Lai' }
          }
        }
      },
      '/api/tthc/stats': {
        get: {
          operationId: 'getStats',
          summary: 'Thống kê tổng quan cơ sở dữ liệu TTHC',
          responses: {
            '200': {
              description: 'Thống kê tổng số bản ghi và phân bổ',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SystemStats' }
                }
              }
            }
          }
        }
      },
      '/api/health': {
        get: {
          security: [],
          operationId: 'getHealth',
          summary: 'Kiểm tra trạng thái hoạt động của hệ thống',
          responses: {
            '200': { description: 'Thông tin hệ thống, phiên bản và dữ liệu' }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Authorization: Bearer <API_KEY chia sẻ>'
        },
        apiKeyHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Header X-API-Key: <API_KEY chia sẻ>'
        },
        apiKeyQuery: {
          type: 'apiKey',
          in: 'query',
          name: 'api-key',
          description: 'Tham số URL ?api-key=<API_KEY chia sẻ>'
        },
        apiKeyQueryLegacy: {
          type: 'apiKey',
          in: 'query',
          name: 'key',
          description: 'Tham số URL dự phòng ?key=<API_KEY chia sẻ>'
        }
      },
      schemas: {
        TraCuuChiTietInput: {
          type: 'object',
          required: ['ma_tthc'],
          properties: {
            ma_tthc: {
              type: 'string',
              description: 'Mã TTHC (ví dụ: "6.006781"), ID hệ thống hoặc tên thủ tục',
              example: '6.006781'
            },
            phan_muc: {
              type: 'string',
              enum: [
                'tat_ca',
                'ho_so',
                'trinh_tu',
                'chi_phi',
                'thoi_han',
                'can_cu_phap_ly',
                'yeu_cau_dieu_kien'
              ],
              default: 'tat_ca',
              description: 'Phân mục chi tiết cụ thể cần trích xuất'
            },
            dinh_dang: {
              type: 'string',
              enum: ['markdown', 'json'],
              default: 'markdown',
              description: 'Định dạng dữ liệu trả về: "markdown" hoặc "json"'
            }
          }
        },
        TimKiemTheoTenInput: {
          type: 'object',
          required: ['ten_tthc'],
          properties: {
            ten_tthc: {
              type: 'string',
              description: 'Tên thủ tục hoặc từ khóa tìm kiếm (hỗ trợ có dấu và không dấu)',
              example: 'đăng ký kết hôn'
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 50,
              default: 10,
              description: 'Số lượng kết quả tối đa mỗi trang (1-50)'
            },
            page: {
              type: 'integer',
              minimum: 1,
              default: 1,
              description: 'Số trang kết quả cần lấy'
            }
          }
        },
        LocTheoCapInput: {
          type: 'object',
          required: ['cap_thuc_hien'],
          properties: {
            cap_thuc_hien: {
              type: 'string',
              description: 'Cấp thực hiện cần lọc (ví dụ: "Cấp Bộ", "Cấp tỉnh", "Cấp xã", "Cơ quan khác")',
              example: 'Cấp Bộ'
            },
            tu_khoa: {
              type: 'string',
              description: 'Từ khóa tìm kiếm bổ sung trong danh sách lọc'
            },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            page: { type: 'integer', minimum: 1, default: 1 }
          }
        },
        LocTheoLinhVucInput: {
          type: 'object',
          required: ['linh_vuc'],
          properties: {
            linh_vuc: {
              type: 'string',
              description: 'Tên lĩnh vực cần lọc (ví dụ: "Hộ tịch", "Kinh doanh", "Xây dựng", "Đất đai", "Thuế")',
              example: 'Hộ tịch'
            },
            tu_khoa: {
              type: 'string',
              description: 'Từ khóa tìm kiếm bổ sung trong lĩnh vực'
            },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            page: { type: 'integer', minimum: 1, default: 1 }
          }
        },
        TimKiemTongHopInput: {
          type: 'object',
          properties: {
            tu_khoa: { type: 'string', description: 'Từ khóa tên thủ tục hoặc nội dung' },
            linh_vuc: { type: 'string', description: 'Lĩnh vực cần lọc' },
            cap_thuc_hien: { type: 'string', description: 'Cấp thực hiện cần lọc' },
            co_quan: { type: 'string', description: 'Cơ quan thực hiện hoặc ban hành' },
            co_thu_phi: { type: 'boolean', description: 'true: có thu phí, false: miễn phí' },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            page: { type: 'integer', minimum: 1, default: 1 }
          }
        },
        GoiYThuTucLienQuanInput: {
          type: 'object',
          properties: {
            ma_hoac_ten_tthc: {
              type: 'string',
              description: 'Mã TTHC hoặc tên thủ tục gốc đang xem xét',
              example: '6.006781'
            },
            chu_de: {
              type: 'string',
              description: 'Chủ đề đời sống hoặc nghiệp vụ (ví dụ: "hộ kinh doanh", "cư trú", "y tế", "sinh con", "kết hôn", "mua bán nhà đất", "thành lập doanh nghiệp")',
              example: 'hộ kinh doanh'
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 20,
              default: 6,
              description: 'Số lượng thủ tục gợi ý tối đa (1-20)'
            },
            dinh_dang: {
              type: 'string',
              enum: ['markdown', 'json'],
              default: 'markdown',
              description: 'Định dạng trả về'
            }
          }
        },
        ThongTinMcpServerInput: {
          type: 'object',
          properties: {}
        },
        TTHCIndexItem: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            ma_tthc: { type: 'string' },
            ten_tthc: { type: 'string' },
            cap_thuc_hien: { type: 'string' },
            linh_vuc: { type: 'string' },
            co_quan_thuc_hien: { type: 'string' },
            co_thu_phi: { type: 'boolean' },
            chi_tiet_phi: { type: 'string' }
          }
        },
        RelatedSuggestion: {
          type: 'object',
          properties: {
            ma_tthc: { type: 'string' },
            ten_tthc: { type: 'string' },
            cap_thuc_hien: { type: 'string' },
            linh_vuc: { type: 'string' },
            co_quan_thuc_hien: { type: 'string' },
            ly_do_lien_quan: { type: 'string' },
            dvc_url: { type: 'string' }
          }
        },
        RelatedProceduresResult: {
          type: 'object',
          properties: {
            goc: { type: 'object' },
            chu_de: { type: 'string' },
            tong_so_goi_y: { type: 'integer' },
            danh_sach: {
              type: 'array',
              items: { $ref: '#/components/schemas/RelatedSuggestion' }
            },
            markdown: { type: 'string' }
          }
        },
        SystemStats: {
          type: 'object',
          properties: {
            totalRecords: { type: 'integer' },
            lastUpdated: { type: 'string' },
            capThucHienCounts: { type: 'object' },
            linhVucCounts: { type: 'object' }
          }
        }
      }
    }
  };
}
