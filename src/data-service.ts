import type {
  TTHCIndexItem,
  TTHCDetail,
  TTHCVersion,
  SearchResult,
  SystemStats,
  DetailSection,
  RelatedSuggestion,
  RelatedProceduresResult,
  NoiBoSearchParams,
  NoiBoGiaLaiSearchParams
} from './types.js';

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

// Danh sách link tăng tốc qua Anycast CDN jsDelivr và fallback tự động
export const BACKUP_INDEX_URLS = [
  'https://cdn.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/index.json',
  'https://fastly.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/index.json',
  'https://gcore.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/index.json',
  'https://raw.githubusercontent.com/ChippedTopaz/am-sieu-toc-data/data/index.json',
  'https://cdn.statically.io/gh/ChippedTopaz/am-sieu-toc-data/data/index.json'
];

export const BACKUP_VERSION_URLS = [
  'https://cdn.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/version.json',
  'https://fastly.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/version.json',
  'https://raw.githubusercontent.com/ChippedTopaz/am-sieu-toc-data/data/version.json'
];

export const BACKUP_DETAILS_BASE_URLS = [
  'https://cdn.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/details',
  'https://fastly.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/details',
  'https://raw.githubusercontent.com/ChippedTopaz/am-sieu-toc-data/data/details'
];

export function getIndexUrls(): string[] {
  const envUrl = process.env.INDEX_URL || process.env.TTHC_INDEX_URL;
  const urls: string[] = [
    'https://cdn.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/index.json',
    ...(envUrl ? [envUrl] : []),
    ...BACKUP_INDEX_URLS
  ];
  return Array.from(new Set(urls.filter(Boolean)));
}

export function getIndexUrl(): string {
  return getIndexUrls()[0];
}

export function getVersionUrls(): string[] {
  const envUrl = process.env.VERSION_URL || process.env.TTHC_VERSION_URL;
  const urls: string[] = [
    'https://cdn.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/version.json',
    ...(envUrl ? [envUrl] : []),
    ...BACKUP_VERSION_URLS
  ];
  return Array.from(new Set(urls.filter(Boolean)));
}

export function getVersionUrl(): string {
  return getVersionUrls()[0];
}

export function getDetailsBaseUrls(): string[] {
  const envUrl = process.env.DETAILS_BASE_URL || process.env.TTHC_DETAILS_BASE_URL;
  const urls: string[] = [
    'https://cdn.jsdelivr.net/gh/ChippedTopaz/am-sieu-toc-data@data/details',
    ...(envUrl ? [envUrl] : []),
    ...BACKUP_DETAILS_BASE_URLS
  ];
  return Array.from(new Set(urls.filter(Boolean))).map(u => u.replace(/\/+$/, ''));
}

export function getDetailsBaseUrl(): string {
  return getDetailsBaseUrls()[0];
}

// Vietnamese tone removal for intelligent search
export function removeVietnameseTones(str: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export function formatSubmissionMethodName(method?: string): string {
  if (!method) return 'Theo quy định';
  const m = method.toUpperCase();
  if (m === 'DIRECT') return 'Nộp trực tiếp';
  if (m === 'POSTAL') return 'Dịch vụ bưu chính';
  if (m === 'ONLINE') return 'Nộp trực tuyến (Cổng dịch vụ công)';
  return method;
}

export function formatProcessingTime(time?: number | string, unit?: string): string {
  if (time === undefined || time === null || time === '') return 'Theo quy định';
  const u = (unit || '').toUpperCase();
  if (u === 'WORKING_DAY') return `${time} ngày làm việc`;
  if (u === 'DAY') return `${time} ngày`;
  if (u === 'HOUR') return `${time} giờ`;
  if (u === 'MONTH') return `${time} tháng`;
  if (u === 'OTHER' || !u) return `${time} ngày (theo quy định cụ thể)`;
  return `${time} ${unit}`.trim();
}

export function formatReturningMethodName(method?: string): string {
  if (!method) return '';
  const m = method.toUpperCase();
  if (m === 'AT_HOME') return 'Chuyển phát qua bưu chính về nhà / địa chỉ đăng ký';
  if (m === 'AT_SUBMISSION_PLACE') return 'Nhận trực tiếp tại nơi nộp hồ sơ (Bộ phận Một cửa)';
  if (m === 'ONLINE') return 'Nhận bản điện tử trực tuyến qua Cổng dịch vụ công';
  return method;
}

class TTHCDataService {
  private indexData: TTHCIndexItem[] | null = null;
  private idMap = new Map<string, TTHCIndexItem>();
  private codeMap = new Map<string, TTHCIndexItem>();
  private detailCache = new Map<string, { data: TTHCDetail; timestamp: number }>();
  private versionInfo: TTHCVersion | null = null;
  private lastIndexFetchTime = 0;
  private lastVersionCheckTime = 0;
  private updatePollingTimer: NodeJS.Timeout | null = null;
  private isFetchingIndex = false;
  private fetchIndexPromise: Promise<TTHCIndexItem[]> | null = null;

  // Maximum age for cached index (1 hour)
  private readonly CACHE_TTL_MS = 60 * 60 * 1000;
  // Maximum detail cache items (LRU style)
  private readonly MAX_DETAIL_CACHE = 500;

  async getVersion(): Promise<TTHCVersion> {
    let lastUpdated = new Date().toISOString();
    const candidateUrls = getVersionUrls();
    for (const vUrl of candidateUrls) {
      try {
        const res = await fetch(vUrl, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const v = (await res.json()) as TTHCVersion;
          if (v.last_updated) {
            lastUpdated = v.last_updated;
            break;
          }
        }
      } catch {
        // Thử link dự phòng tiếp theo
      }
    }

    // Luôn truy vấn dữ liệu thật từ index (sau khi đã lọc) để đảm bảo số liệu thực tế, không dùng mockup
    const index = await this.loadIndex();
    this.versionInfo = {
      last_updated: lastUpdated,
      total_records: index.length
    };
    return this.versionInfo;
  }

  getLastVersionCheckTime(): number {
    return this.lastVersionCheckTime;
  }

  /**
   * Tự động kiểm tra phiên bản mới nhất từ CDN/GitHub và cập nhật lại dữ liệu khi có thay đổi
   * @param force Nếu là true sẽ bắt buộc tải lại toàn bộ index và xóa cache
   */
  async checkAndAutoUpdate(force = false): Promise<{
    hasUpdate: boolean;
    oldVersion: string | null;
    newVersion: string;
    totalRecords: number;
    message: string;
  }> {
    this.lastVersionCheckTime = Date.now();
    const candidateUrls = getVersionUrls();
    let remoteVersion: TTHCVersion | null = null;

    for (const vUrl of candidateUrls) {
      try {
        const res = await fetch(vUrl, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const v = (await res.json()) as TTHCVersion;
          if (v.last_updated) {
            remoteVersion = v;
            break;
          }
        }
      } catch {}
    }

    const currentVersionStr = this.versionInfo?.last_updated || null;
    const remoteVersionStr = remoteVersion?.last_updated || new Date().toISOString();

    const isDifferent =
      !this.indexData ||
      !currentVersionStr ||
      remoteVersionStr !== currentVersionStr ||
      (remoteVersion?.total_records &&
        this.indexData &&
        Math.abs(remoteVersion.total_records - this.indexData.length) > 50);

    if (force || isDifferent) {
      console.log(
        `[TTHC DataService] [TỰ ĐỘNG CẬP NHẬT] Phát hiện dữ liệu mới hoặc yêu cầu làm mới. Version: ${currentVersionStr || 'N/A'} -> ${remoteVersionStr}`
      );
      const newIndex = await this.loadIndex(true);
      this.detailCache.clear();
      this.versionInfo = {
        last_updated: remoteVersionStr,
        total_records: newIndex.length
      };

      return {
        hasUpdate: true,
        oldVersion: currentVersionStr,
        newVersion: remoteVersionStr,
        totalRecords: newIndex.length,
        message: `Đã tự động cập nhật cơ sở dữ liệu TTHC thành công! Tổng số: ${newIndex.length.toLocaleString('vi-VN')} thủ tục hành chính.`
      };
    }

    return {
      hasUpdate: false,
      oldVersion: currentVersionStr,
      newVersion: currentVersionStr || remoteVersionStr,
      totalRecords: this.indexData?.length || 0,
      message: 'Cơ sở dữ liệu TTHC hiện tại đã là phiên bản mới nhất, không có thay đổi.'
    };
  }

  /**
   * Kích hoạt chu kỳ kiểm tra tự động cập nhật nền theo thời gian (mặc định 15 phút)
   */
  startAutoUpdatePolling(intervalMs = 15 * 60 * 1000): void {
    if (this.updatePollingTimer) return;

    console.log(
      `[TTHC DataService] Đã kích hoạt cơ chế tự động cập nhật dữ liệu nền (chu kỳ: ${(intervalMs / 60000).toFixed(0)} phút/lần).`
    );

    this.updatePollingTimer = setInterval(async () => {
      try {
        const res = await this.checkAndAutoUpdate(false);
        if (res.hasUpdate) {
          console.log(`[TTHC DataService] [AUTO-UPDATE HOÀN TẤT] ${res.message}`);
        }
      } catch (err) {
        console.warn('[TTHC DataService] Lỗi khi tự động kiểm tra cập nhật nền:', err);
      }
    }, intervalMs);

    if (this.updatePollingTimer.unref) {
      this.updatePollingTimer.unref();
    }
  }

  stopAutoUpdatePolling(): void {
    if (this.updatePollingTimer) {
      clearInterval(this.updatePollingTimer);
      this.updatePollingTimer = null;
    }
  }

  async loadIndex(force = false): Promise<TTHCIndexItem[]> {
    const now = Date.now();
    if (!force && this.indexData && now - this.lastIndexFetchTime < this.CACHE_TTL_MS) {
      return this.indexData;
    }

    if (this.isFetchingIndex && this.fetchIndexPromise) {
      return this.fetchIndexPromise;
    }

    this.isFetchingIndex = true;
    this.fetchIndexPromise = (async () => {
      try {
        const candidateUrls = getIndexUrls();
        let lastErr: unknown = null;
        let data: TTHCIndexItem[] | null = null;
        let successUrl = '';

        for (const url of candidateUrls) {
          try {
            console.log(`[TTHC DataService] Đang tải index TTHC từ: ${url}...`);
            const res = await fetch(url, {
              signal: AbortSignal.timeout(30000),
              headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate, br',
                'User-Agent': 'MCP-TTHC-Client/1.1.0'
              }
            });
            if (res.ok) {
              const json = (await res.json()) as TTHCIndexItem[];
              if (Array.isArray(json) && json.length > 0) {
                data = json;
                successUrl = url;
                console.log(`[TTHC DataService] Tải thành công ${json.length} bản ghi từ: ${url}`);
                break;
              }
            } else {
              console.warn(`[TTHC DataService] Nguồn ${url} trả về HTTP ${res.status}, chuyển sang link dự phòng...`);
            }
          } catch (err) {
            lastErr = err;
            console.warn(`[TTHC DataService] Lỗi khi kết nối ${url}: ${err instanceof Error ? err.message : String(err)}, chuyển sang link dự phòng...`);
          }
        }

        if (!data || !Array.isArray(data)) {
          throw new Error(
            `Không thể tải cơ sở dữ liệu TTHC từ tất cả các link dự phòng (GitHub Raw / jsDelivr CDN / Statically). Lỗi cuối: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
          );
        }

        // Loại bỏ toàn bộ thủ tục thuộc cấp huyện
        const filteredData = data.filter(item => {
          const normCap = removeVietnameseTones(item.cap_thuc_hien || '');
          return !normCap.includes('huyen');
        });

        this.indexData = filteredData;
        this.lastIndexFetchTime = Date.now();

        // Rebuild fast lookup maps
        this.idMap.clear();
        this.codeMap.clear();
        for (const item of filteredData) {
          if (item.id) this.idMap.set(item.id.toLowerCase(), item);
          if (item.ma_tthc) this.codeMap.set(item.ma_tthc.trim(), item);
        }

        console.log(`[TTHC DataService] Đã lập chỉ mục ${filteredData.length} thủ tục hợp lệ từ ${successUrl} (đã lọc cấp huyện).`);
        return filteredData;
      } finally {
        this.isFetchingIndex = false;
        this.fetchIndexPromise = null;
      }
    })();

    return this.fetchIndexPromise;
  }

  private paginate<T>(items: T[], page = 1, limit = 10): SearchResult<T> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const total = items.length;
    const totalPages = Math.ceil(total / safeLimit) || 1;
    const startIndex = (safePage - 1) * safeLimit;
    const paginatedItems = items.slice(startIndex, startIndex + safeLimit);

    return {
      data: paginatedItems,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages
    };
  }

  async findByCodeOrId(identifier: string): Promise<TTHCIndexItem | null> {
    await this.loadIndex();
    const clean = identifier.trim();
    // 1. Direct code lookup
    if (this.codeMap.has(clean)) {
      return this.codeMap.get(clean)!;
    }
    // 2. Direct ID lookup
    const lower = clean.toLowerCase();
    if (this.idMap.has(lower)) {
      return this.idMap.get(lower)!;
    }
    // 3. Partial or prefix match on ma_tthc
    const matched = this.indexData?.find(
      item => item.ma_tthc === clean || item.ma_tthc.toLowerCase().includes(lower)
    );
    if (matched) return matched;

    // 4. Fallback: tìm theo tên thủ tục nếu tham số truyền vào là tên/từ khóa
    const normClean = removeVietnameseTones(clean);
    if (normClean.length >= 3) {
      const nameMatched = this.indexData?.find(item =>
        removeVietnameseTones(item.ten_tthc || '').includes(normClean)
      );
      if (nameMatched) return nameMatched;
    }

    return null;
  }

  async getDetail(
    identifier: string,
    options?: {
      phan_muc?: DetailSection;
      dinh_dang?: 'markdown' | 'json';
    }
  ): Promise<{
    indexItem: TTHCIndexItem | null;
    detail: TTHCDetail | null;
    sections?: Record<string, unknown>;
    markdown: string;
    jsonData?: unknown;
  }> {
    const phanMuc = options?.phan_muc || 'tat_ca';
    const dinhDang = options?.dinh_dang || 'markdown';

    const indexItem = await this.findByCodeOrId(identifier);
    const targetId = indexItem ? indexItem.id : identifier.trim();

    // Check detail cache
    let detailData: TTHCDetail | null = null;
    const cached = this.detailCache.get(targetId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      detailData = cached.data;
    } else {
      try {
        const candidateBaseUrls = getDetailsBaseUrls();
        let is404 = false;

        for (const baseUrl of candidateBaseUrls) {
          try {
            const detailUrl = `${baseUrl}/${targetId}.json`;
            console.log(`[TTHC DataService] Đang tải chi tiết từ: ${detailUrl}`);
            const res = await fetch(detailUrl, {
              signal: AbortSignal.timeout(15000),
              headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate, br'
              }
            });
            if (res.ok) {
              detailData = (await res.json()) as TTHCDetail;
              break;
            } else if (res.status === 404) {
              is404 = true;
              break;
            }
          } catch {
            console.warn(`[TTHC DataService] Không tải được từ ${baseUrl}, thử link dự phòng...`);
          }
        }

        if (!detailData) {
          if (is404) {
            return {
              indexItem,
              detail: null,
              markdown: `Không tìm thấy thông tin chi tiết cho mã TTHC: **${identifier}** (HTTP 404).`,
              jsonData: { error: 'Not found', identifier }
            };
          }
          return {
            indexItem,
            detail: null,
            markdown: `Không thể tải chi tiết thủ tục **${identifier}** từ các nguồn dữ liệu dự phòng.`,
            jsonData: { error: 'Fetch failed', identifier }
          };
        }

        // Add to cache (evict oldest if cache limit reached)
        if (this.detailCache.size >= this.MAX_DETAIL_CACHE) {
          const firstKey = this.detailCache.keys().next().value;
          if (firstKey) this.detailCache.delete(firstKey);
        }
        this.detailCache.set(targetId, { data: detailData, timestamp: Date.now() });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          indexItem,
          detail: null,
          markdown: `Lỗi khi tải chi tiết thủ tục ${identifier}: ${msg}`,
          jsonData: { error: msg, identifier }
        };
      }
    }

    // Trích xuất cấu trúc dữ liệu tương ứng theo phân mục
    let structuredJson: unknown = detailData;
    if (dinhDang === 'json') {
      const baseHeader = {
        ma_tthc: detailData.code || indexItem?.ma_tthc,
        ten_tthc: detailData.name || indexItem?.ten_tthc,
        cap_thuc_hien: indexItem?.cap_thuc_hien,
        linh_vuc: indexItem?.linh_vuc,
        co_quan_thuc_hien: indexItem?.co_quan_thuc_hien || detailData.executingAgencies?.map(a => a.name).join(', '),
        phan_muc: phanMuc,
        link_dvc_quoc_gia: detailData.id ? `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${detailData.id}` : undefined
      };

      switch (phanMuc) {
        case 'ho_so':
          structuredJson = { ...baseHeader, profileComponents: detailData.profileComponents || [] };
          break;
        case 'trinh_tu':
          structuredJson = { ...baseHeader, executionSteps: detailData.executionSteps || [] };
          break;
        case 'chi_phi':
          structuredJson = { ...baseHeader, fees: detailData.fees || [], co_thu_phi: indexItem?.co_thu_phi, chi_tiet_phi: indexItem?.chi_tiet_phi };
          break;
        case 'thoi_han':
          structuredJson = { ...baseHeader, executionMethods: detailData.executionMethods || [], cases: detailData.cases || [] };
          break;
        case 'can_cu_phap_ly':
          structuredJson = { ...baseHeader, legalBasisesDetails: detailData.legalBasisesDetails || [] };
          break;
        case 'yeu_cau_dieu_kien':
          structuredJson = { ...baseHeader, requirementsAndConditions: detailData.requirementsAndConditions || [] };
          break;
        case 'tat_ca':
        default:
          structuredJson = { ...detailData, indexItem };
          break;
      }
    }

    const sections = {
      ho_so: detailData.profileComponents || [],
      trinh_tu: detailData.executionSteps || [],
      chi_phi: detailData.fees || [],
      thoi_han: {
        executionMethods: detailData.executionMethods || [],
        cases: detailData.cases || []
      },
      can_cu_phap_ly: detailData.legalBasisesDetails || [],
      yeu_cau_dieu_kien: detailData.requirementsAndConditions || []
    };

    const md = this.formatDetailMarkdown(detailData, indexItem || undefined, phanMuc);
    return {
      indexItem,
      detail: detailData,
      sections,
      markdown: md,
      jsonData: structuredJson
    };
  }

  async searchByName(
    nameOrKeyword: string,
    page = 1,
    limit = 10
  ): Promise<SearchResult<TTHCIndexItem>> {
    const data = await this.loadIndex();
    const query = removeVietnameseTones(nameOrKeyword);

    if (!query) {
      return this.paginate(data, page, limit);
    }

    const filtered = data.filter(item => {
      const normalizedName = removeVietnameseTones(item.ten_tthc || '');
      const normalizedLinhVuc = removeVietnameseTones(item.linh_vuc || '');
      const code = (item.ma_tthc || '').toLowerCase();
      return (
        normalizedName.includes(query) ||
        normalizedLinhVuc.includes(query) ||
        code.includes(query)
      );
    });

    return this.paginate(filtered, page, limit);
  }

  async filterByCap(
    capThucHien: string,
    keyword?: string,
    page = 1,
    limit = 10
  ): Promise<SearchResult<TTHCIndexItem>> {
    const data = await this.loadIndex();
    const normalizedCap = removeVietnameseTones(capThucHien);
    const normalizedKeyword = keyword ? removeVietnameseTones(keyword) : '';

    const filtered = data.filter(item => {
      const itemCap = removeVietnameseTones(item.cap_thuc_hien || '');
      const matchesCap = itemCap.includes(normalizedCap);
      if (!matchesCap) return false;

      if (normalizedKeyword) {
        const itemName = removeVietnameseTones(item.ten_tthc || '');
        const itemLinhVuc = removeVietnameseTones(item.linh_vuc || '');
        const code = (item.ma_tthc || '').toLowerCase();
        return (
          itemName.includes(normalizedKeyword) ||
          itemLinhVuc.includes(normalizedKeyword) ||
          code.includes(normalizedKeyword)
        );
      }
      return true;
    });

    return this.paginate(filtered, page, limit);
  }

  async filterByLinhVuc(
    linhVuc: string,
    keyword?: string,
    page = 1,
    limit = 10
  ): Promise<SearchResult<TTHCIndexItem>> {
    const data = await this.loadIndex();
    const normalizedLinhVuc = removeVietnameseTones(linhVuc);
    const normalizedKeyword = keyword ? removeVietnameseTones(keyword) : '';

    const filtered = data.filter(item => {
      const itemLinhVuc = removeVietnameseTones(item.linh_vuc || '');
      const matchesLinhVuc = itemLinhVuc.includes(normalizedLinhVuc);
      if (!matchesLinhVuc) return false;

      if (normalizedKeyword) {
        const itemName = removeVietnameseTones(item.ten_tthc || '');
        const itemCap = removeVietnameseTones(item.cap_thuc_hien || '');
        const code = (item.ma_tthc || '').toLowerCase();
        return (
          itemName.includes(normalizedKeyword) ||
          itemCap.includes(normalizedKeyword) ||
          code.includes(normalizedKeyword)
        );
      }
      return true;
    });

    return this.paginate(filtered, page, limit);
  }

  async filterByCoQuan(
    coQuan: string,
    keyword?: string,
    page = 1,
    limit = 10
  ): Promise<SearchResult<TTHCIndexItem>> {
    const data = await this.loadIndex();
    const normalizedCoQuan = removeVietnameseTones(coQuan);
    const normalizedKeyword = keyword ? removeVietnameseTones(keyword) : '';

    const filtered = data.filter(item => {
      const itemCoQuan = removeVietnameseTones(item.co_quan_thuc_hien || '');
      const itemCongBo = removeVietnameseTones(item.co_quan_cong_bo || '');
      const matchesCoQuan =
        itemCoQuan.includes(normalizedCoQuan) ||
        itemCongBo.includes(normalizedCoQuan);
      if (!matchesCoQuan) return false;

      if (normalizedKeyword) {
        const itemName = removeVietnameseTones(item.ten_tthc || '');
        const itemLinhVuc = removeVietnameseTones(item.linh_vuc || '');
        const itemCap = removeVietnameseTones(item.cap_thuc_hien || '');
        const code = (item.ma_tthc || '').toLowerCase();
        return (
          itemName.includes(normalizedKeyword) ||
          itemLinhVuc.includes(normalizedKeyword) ||
          itemCap.includes(normalizedKeyword) ||
          code.includes(normalizedKeyword)
        );
      }
      return true;
    });

    return this.paginate(filtered, page, limit);
  }

  async filterByCoQuanBanHanh(
    coQuan: string,
    keyword?: string,
    page = 1,
    limit = 10
  ): Promise<SearchResult<TTHCIndexItem>> {
    const data = await this.loadIndex();
    const normalizedCoQuan = removeVietnameseTones(coQuan);
    const normalizedKeyword = keyword ? removeVietnameseTones(keyword) : '';

    const filtered = data.filter(item => {
      const itemCongBo = removeVietnameseTones(item.co_quan_cong_bo || '');
      const matches = itemCongBo.includes(normalizedCoQuan);
      if (!matches) return false;

      if (normalizedKeyword) {
        const itemName = removeVietnameseTones(item.ten_tthc || '');
        const itemLinhVuc = removeVietnameseTones(item.linh_vuc || '');
        const itemCap = removeVietnameseTones(item.cap_thuc_hien || '');
        const code = (item.ma_tthc || '').toLowerCase();
        return (
          itemName.includes(normalizedKeyword) ||
          itemLinhVuc.includes(normalizedKeyword) ||
          itemCap.includes(normalizedKeyword) ||
          code.includes(normalizedKeyword)
        );
      }
      return true;
    });

    return this.paginate(filtered, page, limit);
  }

  async searchAdvanced(options: {
    keyword?: string;
    tu_khoa?: string;
    cap_thuc_hien?: string;
    linh_vuc?: string;
    co_quan?: string;
    co_thu_phi?: boolean;
    page?: number;
    limit?: number;
  }): Promise<SearchResult<TTHCIndexItem>> {
    const data = await this.loadIndex();
    const rawKw = options.keyword || options.tu_khoa;
    const normKeyword = rawKw ? removeVietnameseTones(rawKw) : '';
    const normCap = options.cap_thuc_hien
      ? removeVietnameseTones(options.cap_thuc_hien)
      : '';
    const normLinhVuc = options.linh_vuc
      ? removeVietnameseTones(options.linh_vuc)
      : '';
    const normCoQuan = options.co_quan ? removeVietnameseTones(options.co_quan) : '';

    const filtered = data.filter(item => {
      if (normCap) {
        const itemCap = removeVietnameseTones(item.cap_thuc_hien || '');
        if (!itemCap.includes(normCap)) return false;
      }

      if (normLinhVuc) {
        const itemLinhVuc = removeVietnameseTones(item.linh_vuc || '');
        if (!itemLinhVuc.includes(normLinhVuc)) return false;
      }

      if (normCoQuan) {
        const itemCoQuan = removeVietnameseTones(item.co_quan_thuc_hien || '');
        const itemCoQuanCongBo = removeVietnameseTones(item.co_quan_cong_bo || '');
        if (!itemCoQuan.includes(normCoQuan) && !itemCoQuanCongBo.includes(normCoQuan)) {
          return false;
        }
      }

      if (options.co_thu_phi !== undefined) {
        if (item.co_thu_phi !== options.co_thu_phi) return false;
      }

      if (normKeyword) {
        const itemName = removeVietnameseTones(item.ten_tthc || '');
        const itemLinhVuc = removeVietnameseTones(item.linh_vuc || '');
        const code = (item.ma_tthc || '').toLowerCase();
        if (
          !itemName.includes(normKeyword) &&
          !itemLinhVuc.includes(normKeyword) &&
          !code.includes(normKeyword)
        ) {
          return false;
        }
      }

      return true;
    });

    return this.paginate(filtered, options.page || 1, options.limit || 10);
  }

  async getStats(): Promise<SystemStats> {
    const data = await this.loadIndex();
    const version = await this.getVersion();

    const capCounts: Record<string, number> = {};
    const linhVucCounts: Record<string, number> = {};

    for (const item of data) {
      if (item.cap_thuc_hien) {
        const caps = item.cap_thuc_hien.split(',').map(c => c.trim());
        for (const cap of caps) {
          if (cap) capCounts[cap] = (capCounts[cap] || 0) + 1;
        }
      }
      if (item.linh_vuc) {
        const lv = item.linh_vuc.trim();
        linhVucCounts[lv] = (linhVucCounts[lv] || 0) + 1;
      }
    }

    return {
      totalRecords: data.length,
      lastUpdated: version.last_updated,
      capThucHienCounts: capCounts,
      linhVucCounts: linhVucCounts
    };
  }

  formatDetailMarkdown(
    detail: TTHCDetail,
    indexItem?: TTHCIndexItem,
    phanMuc: DetailSection = 'tat_ca'
  ): string {
    const lines: string[] = [];

    const name = detail.name || indexItem?.ten_tthc || 'Chưa có tên thủ tục';
    const code = detail.code || indexItem?.ma_tthc || 'Chưa cập nhật';
    // Trích xuất Số Quyết định công bố từ procedureProposal hoặc decisionNo
    const prop = (detail as any).procedureProposal;
    const rawProposalNo = prop?.proposalNumber || prop?.decisionNumber || (typeof prop === 'string' ? prop : '');
    let decisionNo = detail.decisionNo?.trim() || (typeof rawProposalNo === 'string' ? rawProposalNo.trim() : '');

    if (decisionNo && decisionNo !== 'Chưa cập nhật') {
      const ts = Number(prop?.decisionDate || prop?.publicationDate);
      if (!isNaN(ts) && ts > 0) {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = d.getFullYear();
          decisionNo += ` (ban hành ngày ${dd}/${mm}/${yyyy})`;
        }
      }
    } else {
      decisionNo = 'Chưa cập nhật';
    }

    // Cơ quan ban hành
    const propAgency = prop?.issuingAgency?.name;
    const coQuanBanHanh =
      (typeof propAgency === 'string' && propAgency.trim()) ||
      (typeof detail.departmentPromulgateName === 'string' && detail.departmentPromulgateName.trim()) ||
      indexItem?.co_quan_cong_bo ||
      (typeof detail.promulgateAgency === 'string' && detail.promulgateAgency.trim()) ||
      'Chưa cập nhật';

    // Cơ quan thực hiện
    let coQuan = indexItem?.co_quan_thuc_hien;
    if (!coQuan) {
      if (Array.isArray(detail.executingAgencies) && detail.executingAgencies.length > 0) {
        coQuan = detail.executingAgencies.map((a: any) => a?.name).filter(Boolean).join(', ');
      } else if (typeof (detail as any).executingAgencies === 'string' && (detail as any).executingAgencies.trim()) {
        coQuan = (detail as any).executingAgencies.trim();
      }
    }
    if (!coQuan) coQuan = 'Chưa cập nhật';

    // Cấp thực hiện
    const cap =
      indexItem?.cap_thuc_hien ||
      (detail.isWard ? 'Cấp xã' : detail.isProvince ? 'Cấp tỉnh' : detail.isMinistry ? 'Cấp Bộ' : 'Chưa cập nhật');

    // Loại thủ tục
    let loaiTthc = indexItem?.loai_tthc;
    if (!loaiTthc) {
      if (detail.type === 'SPECIFIC') loaiTthc = 'TTHC Đặc thù';
      else if (detail.type === 'COMMON') loaiTthc = 'TTHC Chung';
      else if (detail.type) loaiTthc = String(detail.type);
      else loaiTthc = 'Thủ tục hành chính';
    }

    // Đối tượng thực hiện
    let doiTuongThucHien = '';
    if (Array.isArray(detail.subjectTypesDetails) && detail.subjectTypesDetails.length > 0) {
      doiTuongThucHien = detail.subjectTypesDetails.map((s: any) => s?.name).filter(Boolean).join(', ');
    } else if (Array.isArray(detail.targetObjects) && detail.targetObjects.length > 0) {
      doiTuongThucHien = detail.targetObjects.map((t: any) => t?.name).filter(Boolean).join(', ');
    } else if (typeof detail.targetObjects === 'string' && detail.targetObjects) {
      doiTuongThucHien = detail.targetObjects;
    } else if (typeof detail.formalityTargetType === 'string' && detail.formalityTargetType) {
      doiTuongThucHien = detail.formalityTargetType;
    }
    if (!doiTuongThucHien) {
      doiTuongThucHien = 'Công dân Việt Nam, Doanh nghiệp, Tổ chức';
    }

    const linhVuc =
      indexItem?.linh_vuc ||
      (Array.isArray(detail.categoriesDetails) ? detail.categoriesDetails.map((c: any) => c?.name).filter(Boolean).join(', ') : '') ||
      'Chưa cập nhật';
    const coThuPhi = indexItem?.co_thu_phi ? 'Có thu phí' : 'Không thu phí';

    // Kết quả thực hiện tóm tắt
    const validResultsSummary = detail.resultsDetails
      ?.map((r: any) => (typeof r === 'string' ? r : r?.name)?.trim())
      .filter(Boolean);
    const ketQuaTomTat =
      validResultsSummary && validResultsSummary.length > 0
        ? validResultsSummary.join('; ')
        : 'Không quy định kết quả';

    // Trích xuất ngày công khai, ngày cập nhật, ngày điều chỉnh
    const formatTimestamp = (ts?: unknown): string => {
      if (!ts) return 'Chưa cập nhật';
      const num = Number(ts);
      if (isNaN(num) || num <= 0) return 'Chưa cập nhật';
      const d = new Date(num);
      if (isNaN(d.getTime())) return 'Chưa cập nhật';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    };

    const rawCreatedAt = (detail as any).createdAt;
    const rawUpdatedAt = (detail as any).updatedAt;
    const rawPubDate = prop?.publicationDate;
    const rawDecDate = prop?.decisionDate;

    const ngayCongKhai = formatTimestamp(rawPubDate || rawCreatedAt);
    const ngayCapNhat = formatTimestamp(rawUpdatedAt || rawPubDate || rawCreatedAt);

    let ngayDieuChinh = 'Chưa có điều chỉnh';
    if (rawDecDate && rawPubDate && Number(rawDecDate) !== Number(rawPubDate)) {
      ngayDieuChinh = formatTimestamp(rawDecDate);
    } else if (rawUpdatedAt && rawCreatedAt && Math.abs(Number(rawUpdatedAt) - Number(rawCreatedAt)) > 60000) {
      ngayDieuChinh = formatTimestamp(rawUpdatedAt);
    } else if (rawDecDate) {
      ngayDieuChinh = formatTimestamp(rawDecDate);
    } else if (rawUpdatedAt) {
      ngayDieuChinh = formatTimestamp(rawUpdatedAt);
    }

    const dvcUrl = detail.id
      ? `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${detail.id}`
      : undefined;

    lines.push(`# ${name}`);
    lines.push('');
    lines.push(`- **Mã TTHC**: \`${code}\``);
    lines.push(`- **Số Quyết định**: ${decisionNo}`);
    lines.push(`- **Ngày công khai**: ${ngayCongKhai}`);
    lines.push(`- **Ngày cập nhật**: ${ngayCapNhat}`);
    lines.push(`- **Ngày điều chỉnh**: ${ngayDieuChinh}`);
    lines.push(`- **Cơ quan ban hành**: ${coQuanBanHanh}`);
    lines.push(`- **Cơ quan thực hiện**: ${coQuan}`);
    lines.push(`- **Cấp thực hiện**: ${cap}`);
    lines.push(`- **Loại thủ tục**: ${loaiTthc}`);
    lines.push(`- **Đối tượng thực hiện**: ${doiTuongThucHien}`);
    lines.push(`- **Lĩnh vực**: ${linhVuc}`);
    lines.push(`- **Mức phí**: ${coThuPhi}${indexItem?.chi_tiet_phi ? ` (${indexItem.chi_tiet_phi})` : ''}`);
    lines.push(`- **Kết quả thực hiện**: ${ketQuaTomTat}`);
    if (dvcUrl) {
      lines.push(`- **Link TTHC gốc (Cổng DVC Quốc gia)**: [${dvcUrl}](${dvcUrl})`);
    }
    if (phanMuc !== 'tat_ca') {
      const phanMucTitles: Record<DetailSection, string> = {
        tat_ca: 'Toàn bộ thông tin',
        ho_so: 'Thành phần hồ sơ',
        trinh_tu: 'Trình tự thực hiện',
        chi_phi: 'Phí, lệ phí',
        thoi_han: 'Thời hạn giải quyết',
        can_cu_phap_ly: 'Căn cứ pháp lý',
        yeu_cau_dieu_kien: 'Yêu cầu, điều kiện thực hiện'
      };
      lines.push(`- **Phân mục đang xem**: *${phanMucTitles[phanMuc]}*`);
    }
    lines.push('');

    // Nếu chỉ xem một phân mục cụ thể, chỉ render phân mục đó
    const shouldShow = (section: DetailSection) => phanMuc === 'tat_ca' || phanMuc === section;

    if (shouldShow('tat_ca') && detail.description) {
      lines.push('### Mô tả / Phạm vi áp dụng');
      lines.push(detail.description);
      lines.push('');
    }

    // Trình tự thực hiện
    if (shouldShow('trinh_tu')) {
      if (detail.executionSteps && detail.executionSteps.length > 0) {
        lines.push('### Trình tự thực hiện');
        detail.executionSteps.forEach((step, idx) => {
          const stepNum = step.stepNumber ?? idx + 1;
          lines.push(`**Bước ${stepNum}: ${step.name || 'Thực hiện'}**`);
          if (step.description) {
            lines.push(`${step.description}`);
          }
          lines.push('');
        });
      } else if (phanMuc === 'trinh_tu') {
        lines.push('### Trình tự thực hiện');
        lines.push('Không có thông tin chi tiết về từng bước (thực hiện theo quy định chung của cơ quan giải quyết).\n');
      }
    }

    // Cách thức thực hiện & Thời hạn giải quyết
    const hasExecutionMethods =
      detail.executionMethods && detail.executionMethods.length > 0;
    const hasReturningMethods =
      detail.returningMethods && detail.returningMethods.length > 0;

    if (shouldShow('thoi_han') || shouldShow('tat_ca')) {
      if (hasExecutionMethods || hasReturningMethods) {
        lines.push('### Cách thức thực hiện');

        if (hasExecutionMethods) {
          lines.push('**Hình thức nộp hồ sơ:**');
          for (const m of detail.executionMethods!) {
            const methodName = formatSubmissionMethodName(m.submissionMethod);
            lines.push(`- **${methodName}**`);
            if (m.description) {
              lines.push(`  ${m.description.replace(/\n+/g, '\n  ')}`);
            }
          }
        }

        if (hasReturningMethods) {
          lines.push('**Hình thức nhận kết quả:**');
          for (const rm of detail.returningMethods!) {
            if (Array.isArray(rm.value)) {
              for (const val of rm.value) {
                const methodDesc = formatReturningMethodName(val);
                if (methodDesc) lines.push(`- ${methodDesc}`);
              }
            }
          }
        }

        lines.push('');
      }

      // THỜI HẠN GIẢI QUYẾT
      const hasTimeLimits = detail.executionMethods?.some(
        m => m.processingTime !== undefined && m.processingTime !== null
      );
      const hasCases = detail.cases && detail.cases.length > 0;

      if (hasTimeLimits || hasCases) {
        lines.push('### Thời hạn giải quyết');

        if (hasTimeLimits && detail.executionMethods) {
          for (const m of detail.executionMethods) {
            const methodName = formatSubmissionMethodName(m.submissionMethod);
            const timeStr = formatProcessingTime(
              m.processingTime,
              m.processingTimeUnit
            );
            lines.push(`- **${methodName}**: ${timeStr}`);
          }
        }

        if (hasCases) {
          lines.push('**Theo từng trường hợp cụ thể:**');
          for (const c of detail.cases!) {
            const caseName = c.name || 'Trường hợp quy định';
            let dayInfo = '';
            if (c.processingDay && typeof c.processingDay === 'object') {
              dayInfo = formatProcessingTime(
                c.processingDay.qty,
                c.processingDay.type
              );
            } else if (c.processingDay) {
              dayInfo = `${c.processingDay} ngày`;
            }
            lines.push(
              `- **${caseName}**${c.code ? ` (\`${c.code}\`)` : ''}: ${dayInfo || 'Theo quy định'}`
            );
            if (c.description) {
              lines.push(`  *${c.description}*`);
            }
          }
        }

        lines.push('');
      } else if (phanMuc === 'thoi_han') {
        lines.push('### Thời hạn giải quyết');
        lines.push('Thời hạn giải quyết thực hiện theo quy định của pháp luật chuyên ngành.\n');
      }
    }

    // Thành phần hồ sơ
    if (shouldShow('ho_so')) {
      if (detail.profileComponents && detail.profileComponents.length > 0) {
        lines.push('### Thành phần hồ sơ');
        for (const comp of detail.profileComponents) {
          if (comp.name) {
            lines.push(`#### ${comp.name}`);
          }
          if (comp.components && comp.components.length > 0) {
            for (const item of comp.components) {
              const qty = item.quantity ? ` (Số lượng: ${item.quantity})` : '';
              const orig = item.originalDocument ? ' [Bản chính]' : '';
              const cert = item.certifiedCopy ? ' [Bản chứng thực]' : '';
              lines.push(`- **${item.name || 'Giấy tờ'}**${qty}${orig}${cert}`);
              if (item.note) lines.push(`  *Ghi chú: ${item.note}*`);
            }
          } else {
            const qty = comp.originalCopy ? `(Bản chính: ${comp.originalCopy})` : '';
            lines.push(`- ${comp.name || 'Hồ sơ'} ${qty}`);
          }
        }
        lines.push('');
      } else if (phanMuc === 'ho_so') {
        lines.push('### Thành phần hồ sơ');
        lines.push('Thành phần hồ sơ nộp theo mẫu đơn, tờ khai quy định tại cơ quan giải quyết.\n');
      }
    }

    // Phí, lệ phí
    if (shouldShow('chi_phi')) {
      if (detail.fees && detail.fees.length > 0) {
        lines.push('### Phí, lệ phí');
        for (const f of detail.fees) {
          lines.push(`- **${f.name || 'Khoản phí'}**: ${f.fee || 'Quy định'} ${f.unit || ''}`);
          if (f.note) lines.push(`  *${f.note}*`);
        }
        lines.push('');
      } else if (phanMuc === 'chi_phi') {
        lines.push('### Phí, lệ phí');
        lines.push(`- **Trạng thái lệ phí**: ${coThuPhi}`);
        if (indexItem?.chi_tiet_phi) {
          lines.push(`- **Chi tiết**: ${indexItem.chi_tiet_phi}`);
        }
        lines.push('');
      }
    }

    // Yêu cầu, điều kiện
    if (shouldShow('yeu_cau_dieu_kien')) {
      if (detail.requirementsAndConditions) {
        if (
          typeof detail.requirementsAndConditions === 'string' &&
          detail.requirementsAndConditions.trim()
        ) {
          lines.push('### Yêu cầu, điều kiện thực hiện');
          lines.push(detail.requirementsAndConditions.trim());
          lines.push('');
        } else if (
          Array.isArray(detail.requirementsAndConditions) &&
          detail.requirementsAndConditions.length > 0
        ) {
          const validReqs = detail.requirementsAndConditions.filter(r => {
            if (typeof r === 'string') return Boolean(r.trim());
            return Boolean(r && (r.name || r.description));
          });
          if (validReqs.length > 0) {
            lines.push('### Yêu cầu, điều kiện thực hiện');
            for (const req of validReqs) {
              if (typeof req === 'string') {
                lines.push(`- ${req}`);
              } else {
                const name = req.name ? `**${req.name}**: ` : '';
                lines.push(`- ${name}${req.description || ''}`);
              }
            }
            lines.push('');
          }
        }
      } else if (phanMuc === 'yeu_cau_dieu_kien') {
        lines.push('### Yêu cầu, điều kiện thực hiện');
        lines.push('Không có điều kiện đặc biệt ngoài quy định chung của pháp luật.\n');
      }
    }

    // Căn cứ pháp lý
    if (shouldShow('can_cu_phap_ly')) {
      if (
        detail.legalBasisesDetails &&
        Array.isArray(detail.legalBasisesDetails) &&
        detail.legalBasisesDetails.length > 0
      ) {
        lines.push('### Căn cứ pháp lý');
        for (const doc of detail.legalBasisesDetails) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const title = (doc as any).name || doc.title || 'Văn bản QPPL';
          const codeStr = doc.code ? ` (${doc.code})` : '';
          lines.push(`- ${title}${codeStr}`);
        }
        lines.push('');
      } else if (phanMuc === 'can_cu_phap_ly') {
        lines.push('### Căn cứ pháp lý');
        lines.push('Căn cứ các văn bản quy phạm pháp luật chuyên ngành hiện hành.\n');
      }
    }

    // Kết quả thực hiện
    if (shouldShow('tat_ca')) {
      lines.push('### Kết quả thực hiện');
      const validResults = detail.resultsDetails
        ?.map((r: any) => (typeof r === 'string' ? r : r?.name)?.trim())
        .filter(Boolean);

      if (validResults && validResults.length > 0) {
        for (const resName of validResults) {
          lines.push(`- ${resName}`);
        }
      } else {
        lines.push('- Không quy định kết quả');
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Gợi ý các thủ tục hành chính liên quan mật thiết dựa trên thủ tục gốc hoặc chủ đề đời sống
   */
  async getRelatedProcedures(params: {
    ma_hoac_ten_tthc?: string;
    chu_de?: string;
    limit?: number;
  }): Promise<RelatedProceduresResult> {
    const data = await this.loadIndex();
    const limit = Math.max(1, Math.min(20, params.limit || 5));
    let baseItem: TTHCIndexItem | null = null;

    if (params.ma_hoac_ten_tthc) {
      baseItem = await this.findByCodeOrId(params.ma_hoac_ten_tthc);
      if (!baseItem) {
        const found = await this.searchByName(params.ma_hoac_ten_tthc, 1, 1);
        if (found.data.length > 0) baseItem = found.data[0];
      }
    }

    const suggestions: RelatedSuggestion[] = [];
    const addedCodes = new Set<string>();
    if (baseItem) addedCodes.add(baseItem.ma_tthc);

    // Knowledge base về các gói thủ tục liên thông đời sống (Life Events)
    const topicKeywords = `${params.chu_de || ''} ${baseItem?.ten_tthc || ''} ${baseItem?.linh_vuc || ''}`.toLowerCase();
    const normTopic = removeVietnameseTones(topicKeywords);

    const bundles: Array<{
      match: string[];
      relatedQueries: Array<{ query: string; reason: string }>;
    }> = [
      {
        match: ['khai sinh', 'sinh con', 'tre em', 'so sinh', 'sinh de'],
        relatedQueries: [
          { query: 'khai sinh', reason: 'Thủ tục đăng ký khai sinh ban đầu' },
          { query: 'thuong tru', reason: 'Đăng ký thường trú cho trẻ em mới sinh (liên thông)' },
          { query: 'bao hiem y te', reason: 'Cấp thẻ BHYT cho trẻ em dưới 6 tuổi (liên thông)' },
          { query: 'thai san', reason: 'Giải quyết chế độ thai sản / trợ cấp BHXH' },
          { query: 'ho chieu', reason: 'Cấp hộ chiếu phổ thông cho trẻ em' }
        ]
      },
      {
        match: ['ket hon', 'hon nhan', 'ly hon', 'doc than'],
        relatedQueries: [
          { query: 'tinh trang hon nhan', reason: 'Cấp giấy xác nhận tình trạng hôn nhân (điều kiện đăng ký kết hôn)' },
          { query: 'ket hon', reason: 'Đăng ký kết hôn tại UBND cấp xã hoặc có yếu tố nước ngoài' },
          { query: 'bien dong dat dai', reason: 'Đăng ký biến động quyền sử dụng đất khi kết hôn / nhập tài sản chung' }
        ]
      },
      {
        match: ['dat dai', 'so do', 'nha o', 'chuyen nhuong dat', 'tang cho dat'],
        relatedQueries: [
          { query: 'bien dong dat dai', reason: 'Đăng ký biến động khi mua bán, chuyển nhượng, tặng cho quyền sử dụng đất' },
          { query: 'cap doi giay chung nhan', reason: 'Cấp đổi, cấp lại Giấy chứng nhận quyền sử dụng đất (Sổ đỏ/Sổ hồng)' },
          { query: 'the chap', reason: 'Đăng ký thế chấp quyền sử dụng đất tại ngân hàng / tổ chức tín dụng' },
          { query: 'giay phep xay dung', reason: 'Cấp giấy phép xây dựng nhà ở sau khi sở hữu đất' }
        ]
      },
      {
        match: ['doanh nghiep', 'thanh lap cong ty', 'mo cong ty', 'cong ty tnhh', 'cong ty co phan', 'dau tu'],
        relatedQueries: [
          { query: 'thanh lap doanh nghiep', reason: 'Đăng ký thành lập doanh nghiệp / công ty mới' },
          { query: 'thue', reason: 'Khai lệ phí môn bài và đăng ký mã số thuế doanh nghiệp' },
          { query: 'an toan thuc pham', reason: 'Cấp Giấy chứng nhận cơ sở đủ điều kiện an toàn thực phẩm' },
          { query: 'phong chay', reason: 'Thủ tục phê duyệt / thẩm duyệt phòng cháy chữa cháy' }
        ]
      },
      {
        match: [
          'ho kinh doanh',
          'kinh doanh ca the',
          'kinh doanh ca nhan',
          'dia diem kinh doanh',
          'mo quan',
          'buon ban',
          'mo cua hang'
        ],
        relatedQueries: [
          {
            query: 'thanh lap ho kinh doanh',
            reason: 'Đăng ký thành lập hộ kinh doanh cá thể tại UBND cấp xã'
          },
          {
            query: 'thong bao doanh thu doi voi ho kinh doanh',
            reason: 'Khai thuế/thông báo doanh thu, lệ phí môn bài đối với hộ kinh doanh, cá nhân kinh doanh'
          },
          {
            query: 'an toan thuc pham',
            reason: 'Cấp Giấy chứng nhận cơ sở đủ điều kiện an toàn thực phẩm cơ sở sản xuất, kinh doanh'
          },
          {
            query: 'thay doi noi dung dang ky ho kinh doanh',
            reason: 'Đăng ký thay đổi nội dung đăng ký hộ kinh doanh (địa chỉ, ngành nghề, người đại diện)'
          },
          {
            query: 'tiep tuc kinh doanh truoc thoi han da dang ky cua ho kinh doanh',
            reason: 'Tạm ngừng kinh doanh hoặc tiếp tục kinh doanh trước thời hạn của hộ kinh doanh'
          },
          {
            query: 'cham dut hoat dong ho kinh doanh',
            reason: 'Chấm dứt hoạt động hộ kinh doanh / đóng mã số thuế và giải thể'
          },
          {
            query: 'chuyen doi ho kinh doanh thanh doanh nghiep',
            reason: 'Hỗ trợ tư vấn, hướng dẫn chuyển đổi mô hình hộ kinh doanh thành doanh nghiệp'
          }
        ]
      },
      {
        match: [
          'cu tru',
          'thuong tru',
          'tam tru',
          'nhap khau',
          'ho khau',
          'so ho khau',
          'tam vang',
          'luu tru',
          'noi o',
          'chuyen nha',
          'can cuoc'
        ],
        relatedQueries: [
          {
            query: 'dang ky thuong tru',
            reason: 'Đăng ký thường trú (nhập khẩu tại chỗ ở hợp pháp mới theo Luật Cư trú)'
          },
          {
            query: 'dang ky tam tru',
            reason: 'Đăng ký tạm trú khi sinh sống, học tập, làm việc ngoài nơi thường trú'
          },
          {
            query: 'xac nhan thong tin ve cu tru',
            reason: 'Cấp giấy xác nhận thông tin về cư trú (CT07) thay thế sổ hộ khẩu giấy'
          },
          {
            query: 'khai bao tam vang',
            reason: 'Khai báo tạm vắng khi rời khỏi nơi cư trú theo quy định'
          },
          {
            query: 'giay chung nhan can cuoc',
            reason: 'Thu thập, cập nhật thông tin công dân và cấp chứng nhận căn cước gắn với nơi cư trú'
          },
          {
            query: 'xoa dang ky thuong tru',
            reason: 'Xóa đăng ký thường trú khi chuyển đi nơi khác hoặc định cư (liên thông)'
          }
        ]
      },
      {
        match: [
          'y te',
          'kham chua benh',
          'bao hiem y te',
          'bhyt',
          'kham benh',
          'chua benh',
          'benh vien',
          'hanh nghe y',
          'phong kham',
          'duoc',
          'nha thuoc',
          'tiem chung',
          'kham suc khoe',
          'chuyen tuyen'
        ],
        relatedQueries: [
          {
            query: 'bao hiem y te',
            reason: 'Cấp, đổi thẻ và giám định chi phí khám bệnh, chữa bệnh bảo hiểm y tế (BHYT)'
          },
          {
            query: 'kham benh, chua benh',
            reason: 'Áp dụng danh mục kỹ thuật và quy trình chuyên môn khám bệnh, chữa bệnh'
          },
          {
            query: 'giay phep hanh nghe',
            reason: 'Cấp mới, cấp lại hoặc gia hạn giấy phép hành nghề khám bệnh, chữa bệnh'
          },
          {
            query: 'kinh doanh duoc',
            reason: 'Cấp Giấy chứng nhận đủ điều kiện kinh doanh dược (nhà thuốc, quầy thuốc)'
          },
          {
            query: 'kham suc khoe',
            reason: 'Công bố cơ sở đủ điều kiện thực hiện khám sức khỏe (học tập, làm việc, lái xe)'
          },
          {
            query: 'tiem chung',
            reason: 'Công bố cơ sở đủ điều kiện tiêm chủng vắc xin và bồi thường tiêm chủng'
          }
        ]
      },
      {
        match: ['lai xe', 'bang lai', 'xe co gioi', 'dang kiem', 'tau bien', 'bien so'],
        relatedQueries: [
          { query: 'doi giay phep lai xe', reason: 'Đổi hoặc cấp lại Giấy phép lái xe khi hết hạn / hư hỏng' },
          { query: 'dang ky xe', reason: 'Đăng ký, cấp biển số phương tiện giao thông' },
          { query: 'kiem dinh', reason: 'Kiểm định an toàn kỹ thuật phương tiện (đăng kiểm)' },
          { query: 'dang kiem vien', reason: 'Công nhận hoặc cấp chứng nhận đăng kiểm viên' }
        ]
      },
      {
        match: ['ho chieu', 'xuat nhap canh', 'xuat canh', 'nhap canh', 'visa', 'thi thuc'],
        relatedQueries: [
          { query: 'ho chieu pho thong', reason: 'Cấp hộ chiếu phổ thông trực tuyến mức độ toàn trình' },
          { query: 'cap lai ho chieu', reason: 'Cấp lại hộ chiếu do bị mất, hư hỏng hoặc hết hạn' },
          { query: 'khai bao tam tru', reason: 'Khai báo tạm trú cho người nước ngoài tại Việt Nam' }
        ]
      },
      {
        match: ['khai tu', 'qua doi', 'tu tuat', 'mai tang'],
        relatedQueries: [
          { query: 'khai tu', reason: 'Đăng ký khai tử tại UBND cấp xã' },
          { query: 'xoa thuong tru', reason: 'Xóa đăng ký thường trú sau khi qua đời (liên thông)' },
          { query: 'mai tang phi', reason: 'Giải quyết hưởng chế độ mai táng phí bảo hiểm xã hội' },
          { query: 'tu tuat', reason: 'Giải quyết hưởng chế độ trợ cấp tử tuất hàng tháng hoặc một lần' }
        ]
      }
    ];

    // 1. Kiểm tra matching theo bundles đời sống
    for (const b of bundles) {
      if (b.match.some(m => normTopic.includes(m))) {
        for (const itemQuery of b.relatedQueries) {
          if (suggestions.length >= limit) break;
          const searchResult = await this.searchByName(itemQuery.query, 1, 1);
          for (const item of searchResult.data) {
            if (!addedCodes.has(item.ma_tthc) && suggestions.length < limit) {
              addedCodes.add(item.ma_tthc);
              suggestions.push({
                ma_tthc: item.ma_tthc,
                ten_tthc: item.ten_tthc,
                cap_thuc_hien: item.cap_thuc_hien,
                linh_vuc: item.linh_vuc,
                co_quan_thuc_hien: item.co_quan_thuc_hien,
                ly_do_lien_quan: itemQuery.reason,
                dvc_url: item.id ? `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${item.id}` : undefined
              });
            }
          }
        }
      }
    }

    // 2. Nếu vẫn còn chỗ trống và có baseItem, tìm các thủ tục cùng lĩnh vực/cơ quan/từ khóa chuyên môn
    if (baseItem && suggestions.length < limit) {
      const nameWords = baseItem.ten_tthc
        .split(/\s+/)
        .filter(w => w.length > 3 && !['thủ', 'tục', 'việc', 'theo', 'trong', 'dưới', 'trên'].includes(w.toLowerCase()));
      const searchKeyword = nameWords.slice(0, 3).join(' ');

      const relatedPool = data.filter(item => {
        if (addedCodes.has(item.ma_tthc)) return false;
        const sameLv = item.linh_vuc && item.linh_vuc === baseItem!.linh_vuc;
        const sameCq = item.co_quan_thuc_hien && item.co_quan_thuc_hien === baseItem!.co_quan_thuc_hien;
        return sameLv || sameCq;
      });

      const scored = relatedPool.map(item => {
        let score = 0;
        let reason = '';
        if (item.linh_vuc === baseItem!.linh_vuc) {
          score += 3;
          reason = `Cùng thuộc lĩnh vực **${item.linh_vuc}**`;
        }
        if (item.co_quan_thuc_hien === baseItem!.co_quan_thuc_hien) {
          score += 2;
          reason += (reason ? ' và cùng do ' : 'Cùng do ') + `**${item.co_quan_thuc_hien}** tiếp nhận giải quyết`;
        }
        const normItemName = removeVietnameseTones(item.ten_tthc);
        if (searchKeyword && normItemName.includes(removeVietnameseTones(searchKeyword))) {
          score += 4;
          reason = `Nghiệp vụ liên quan chặt chẽ đến quy trình "${baseItem!.ten_tthc}"`;
        }
        return { item, score, reason: reason || 'Thủ tục liên quan trong cùng nhóm chuyên môn' };
      });

      scored.sort((a, b) => b.score - a.score);

      for (const entry of scored) {
        if (suggestions.length >= limit) break;
        if (!addedCodes.has(entry.item.ma_tthc)) {
          addedCodes.add(entry.item.ma_tthc);
          suggestions.push({
            ma_tthc: entry.item.ma_tthc,
            ten_tthc: entry.item.ten_tthc,
            cap_thuc_hien: entry.item.cap_thuc_hien,
            linh_vuc: entry.item.linh_vuc,
            co_quan_thuc_hien: entry.item.co_quan_thuc_hien,
            ly_do_lien_quan: entry.reason,
            dvc_url: entry.item.id ? `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${entry.item.id}` : undefined
          });
        }
      }
    }

    // Xây dựng kết quả Markdown
    const lines: string[] = [];
    if (baseItem) {
      lines.push(`## Gợi ý các Thủ tục Hành chính liên quan`);
      lines.push(`> Dựa trên thủ tục gốc: **${baseItem.ten_tthc}** (Mã TTHC: \`${baseItem.ma_tthc}\` | Lĩnh vực: *${baseItem.linh_vuc}*)\n`);
    } else if (params.chu_de) {
      lines.push(`## Danh mục Thủ tục Hành chính liên quan theo chủ đề`);
      lines.push(`> Chủ đề ngữ cảnh: **${params.chu_de}**\n`);
    } else {
      lines.push(`## Gợi ý Thủ tục Hành chính liên quan\n`);
    }

    if (suggestions.length === 0) {
      lines.push('Không tìm thấy thủ tục liên quan phù hợp với tiêu chí đã cung cấp.');
    } else {
      lines.push(`Tìm thấy **${suggestions.length}** thủ tục liên quan mật thiết cần lưu ý:\n`);
      suggestions.forEach((sug, idx) => {
        lines.push(`### ${idx + 1}. ${sug.ten_tthc}`);
        lines.push(`- **Mã TTHC**: \`${sug.ma_tthc}\``);
        lines.push(`- **Cấp thực hiện**: ${sug.cap_thuc_hien} | **Lĩnh vực**: ${sug.linh_vuc}`);
        lines.push(`- **Cơ quan giải quyết**: ${sug.co_quan_thuc_hien}`);
        lines.push(`- **Mối liên hệ**: 💡 *${sug.ly_do_lien_quan}*`);
        if (sug.dvc_url) {
          lines.push(`- **Cổng DVC Quốc gia**: [Xem thủ tục gốc](${sug.dvc_url})`);
        }
        lines.push(`*Gợi ý: Dùng tool \`tra_cuu_theo_ma_tthc\` với mã \`${sug.ma_tthc}\` để xem chi tiết hồ sơ.*\n`);
      });
    }

    return {
      goc: baseItem
        ? {
            ma_tthc: baseItem.ma_tthc,
            ten_tthc: baseItem.ten_tthc,
            linh_vuc: baseItem.linh_vuc,
            cap_thuc_hien: baseItem.cap_thuc_hien,
            co_quan_thuc_hien: baseItem.co_quan_thuc_hien
          }
        : null,
      chu_de: params.chu_de,
      tong_so_goi_y: suggestions.length,
      totalSuggestions: suggestions.length,
      danh_sach: suggestions,
      suggestions: suggestions,
      markdown: lines.join('\n')
    };
  }

  /**
   * Tra cứu chuyên sâu các Thủ tục Hành chính thuộc tỉnh Gia Lai
   * Cơ quan thực hiện: tỉnh Gia Lai, cấp tỉnh, cấp xã, các Sở ngành, Hệ thống VPĐKĐĐ, Chủ tịch UBND...
   */
  async searchGiaLaiProcedures(params: {
    tu_khoa?: string;
    ma_tthc?: string;
    cap_thuc_hien?: string;
    co_quan_thuc_hien?: string;
    linh_vuc?: string;
    chi_tiet?: boolean;
    page?: number;
    limit?: number;
    dinh_dang?: 'markdown' | 'json';
  }): Promise<{
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    data: TTHCIndexItem[];
    markdown: string;
    chiTietList?: any[];
  }> {
    const allItems = await this.loadIndex();

    // 1. Nếu người dùng cung cấp mã TTHC cụ thể
    if (params.ma_tthc) {
      const codeTrim = params.ma_tthc.trim();
      const directDetail = await this.getDetail(codeTrim, {
        phan_muc: 'tat_ca',
        dinh_dang: params.dinh_dang || 'markdown'
      });

      const matchedIndex = await this.findByCodeOrId(codeTrim);

      const headerMd = [
        `# THỦ TỤC HÀNH CHÍNH TỈNH GIA LAI: ${matchedIndex?.ten_tthc || codeTrim}`,
        `> **Cơ quan thực hiện**: tỉnh Gia Lai ${matchedIndex?.co_quan_thuc_hien ? `(${matchedIndex.co_quan_thuc_hien})` : ''}`,
        `> **Cấp thực hiện**: ${matchedIndex?.cap_thuc_hien || 'Chưa rõ'} | **Lĩnh vực**: ${matchedIndex?.linh_vuc || 'Chưa rõ'}`,
        '',
        directDetail.markdown
      ].join('\n');

      return {
        total: 1,
        page: 1,
        limit: 1,
        totalPages: 1,
        data: matchedIndex ? [matchedIndex] : [],
        markdown: headerMd,
        chiTietList: [directDetail]
      };
    }

    // 2. Lọc danh sách thuộc tỉnh Gia Lai
    const glKeywords = [
      'gia lai', 'pleiku', 'an khê', 'ayun pa', 'chư păh', 'chư prông',
      'chư pưh', 'chư sê', 'đak đoa', 'đức cơ', 'ia grai', 'kbang',
      'kông chro', 'krông pa', 'mang yang', 'phú thiện', 'đak pơ'
    ];

    const isGiaLaiRecord = (item: TTHCIndexItem) => {
      const combined = `${item.ten_tthc || ''} ${item.co_quan_thuc_hien || ''} ${item.co_quan_cong_bo || ''}`.toLowerCase();
      return glKeywords.some(kw => combined.includes(kw));
    };

    let glList = allItems.filter(isGiaLaiRecord);

    // Lọc theo cấp thực hiện
    if (params.cap_thuc_hien && params.cap_thuc_hien !== 'tat_ca') {
      const capNorm = removeVietnameseTones(params.cap_thuc_hien);
      if (capNorm.includes('cap_xa_va_tinh') || (capNorm.includes('xa') && capNorm.includes('tinh'))) {
        glList = glList.filter(p => p.cap_thuc_hien.includes('Cấp xã') && p.cap_thuc_hien.includes('Cấp tỉnh'));
      } else if (capNorm.includes('cap_xa') || capNorm.includes('xa')) {
        glList = glList.filter(p => p.cap_thuc_hien.includes('Cấp xã'));
      } else if (capNorm.includes('cap_tinh') || capNorm.includes('tinh')) {
        glList = glList.filter(p => p.cap_thuc_hien.includes('Cấp tỉnh'));
      }
    }

    // Lọc theo cơ quan thực hiện
    if (params.co_quan_thuc_hien) {
      const cqNorm = removeVietnameseTones(params.co_quan_thuc_hien);
      glList = glList.filter(p => {
        const itemCq = removeVietnameseTones(p.co_quan_thuc_hien || '');
        const itemCongBo = removeVietnameseTones(p.co_quan_cong_bo || '');
        const combined = `${itemCq} ${itemCongBo}`;

        if (cqNorm === 'so' || cqNorm === 'so nganh') {
          return itemCq.includes('so ');
        }
        if (cqNorm.includes('chu tich') || cqNorm.includes('ubnd')) {
          return itemCq.includes('chu tich') || itemCq.includes('uy ban') || itemCongBo.includes('ubnd');
        }
        if (cqNorm.includes('van phong') || cqNorm.includes('chi nhanh') || cqNorm.includes('dang ky')) {
          return itemCq.includes('van phong') || itemCq.includes('chi nhanh') || itemCq.includes('dang ky');
        }
        if (cqNorm.includes('khu kinh te')) {
          return combined.includes('khu kinh te');
        }
        if (cqNorm.includes('xa') || cqNorm.includes('phuong')) {
          return itemCq.includes('cap xa') || p.cap_thuc_hien.includes('Cấp xã');
        }
        return combined.includes(cqNorm);
      });
    }

    // Lọc theo lĩnh vực
    if (params.linh_vuc) {
      const lvNorm = removeVietnameseTones(params.linh_vuc);
      glList = glList.filter(p => removeVietnameseTones(p.linh_vuc || '').includes(lvNorm));
    }

    // Lọc theo từ khóa
    if (params.tu_khoa) {
      const kwNorm = removeVietnameseTones(params.tu_khoa);
      glList = glList.filter(p => {
        const nameNorm = removeVietnameseTones(p.ten_tthc || '');
        const code = (p.ma_tthc || '').toLowerCase();
        const cqNorm = removeVietnameseTones(p.co_quan_thuc_hien || '');
        const lvNorm = removeVietnameseTones(p.linh_vuc || '');
        return nameNorm.includes(kwNorm) || code.includes(kwNorm) || cqNorm.includes(kwNorm) || lvNorm.includes(kwNorm);
      });
    }

    const page = params.page || 1;
    const limit = params.limit || 10;
    const paginated = this.paginate(glList, page, limit);

    // Nếu người dùng yêu cầu chi tiết (chi_tiet === true hoặc danh sách chỉ có đúng 1 kết quả)
    if (params.chi_tiet || paginated.total === 1) {
      const maxDetails = Math.min(paginated.data.length, 3);
      const detailsList: any[] = [];
      const lines: string[] = [];

      lines.push(`# CHI TIẾT THỦ TỤC HÀNH CHÍNH TỈNH GIA LAI`);
      lines.push(`> **Cơ quan thực hiện: tỉnh Gia Lai** (Cấp tỉnh, Cấp xã, Sở ngành, Chi nhánh VPĐKĐĐ, Chủ tịch UBND...)\n`);
      lines.push(`Tìm thấy **${paginated.total}** thủ tục phù hợp. Dưới đây là thông tin chi tiết đầy đủ của **${maxDetails}** thủ tục:\n`);

      for (let i = 0; i < maxDetails; i++) {
        const item = paginated.data[i];
        lines.push(`---\n## Thủ tục ${i + 1}/${maxDetails}: ${item.ten_tthc}`);
        try {
          const dt = await this.getDetail(item.ma_tthc, { phan_muc: 'tat_ca', dinh_dang: 'markdown' });
          detailsList.push(dt);
          lines.push(dt.markdown);
        } catch {
          lines.push(`- **Mã TTHC**: \`${item.ma_tthc}\``);
          lines.push(`- **Cơ quan thực hiện**: ${item.co_quan_thuc_hien}`);
          lines.push(`- **Cấp thực hiện**: ${item.cap_thuc_hien} | **Lĩnh vực**: ${item.linh_vuc}`);
          lines.push(`*(Đang cập nhật chi tiết dữ liệu từ CSDL Quốc gia)*`);
        }
        lines.push('');
      }

      if (paginated.total > maxDetails) {
        lines.push(`\n> Còn **${paginated.total - maxDetails}** thủ tục khác thuộc tỉnh Gia Lai. Bạn có thể gọi lại với \`ma_tthc\` cụ thể để xem chi tiết từng thủ tục hoặc gọi với \`chi_tiet: false\` để xem danh sách tổng hợp.`);
      }

      return {
        ...paginated,
        markdown: lines.join('\n'),
        chiTietList: detailsList
      };
    }

    // Hiển thị danh sách tổng quan chuẩn đẹp cho Gia Lai
    const lines: string[] = [];
    lines.push(`# DANH MỤC THỦ TỤC HÀNH CHÍNH TỈNH GIA LAI`);
    lines.push(`*Cơ quan thực hiện: tỉnh Gia Lai (Cấp tỉnh, Cấp xã, các Sở ngành, Hệ thống VP Đăng ký đất đai, Chủ tịch UBND...)*`);
    
    const criteriaArr: string[] = [];
    if (params.tu_khoa) criteriaArr.push(`Từ khóa: "${params.tu_khoa}"`);
    if (params.cap_thuc_hien && params.cap_thuc_hien !== 'tat_ca') criteriaArr.push(`Cấp: ${params.cap_thuc_hien}`);
    if (params.co_quan_thuc_hien) criteriaArr.push(`Cơ quan: "${params.co_quan_thuc_hien}"`);
    if (params.linh_vuc) criteriaArr.push(`Lĩnh vực: "${params.linh_vuc}"`);
    if (criteriaArr.length > 0) {
      lines.push(`> Tiêu chí lọc: **${criteriaArr.join(' | ')}**`);
    }

    lines.push(`> Tìm thấy **${paginated.total}** thủ tục (Trang **${paginated.page}/${paginated.totalPages}**, hiển thị ${paginated.data.length} mục/trang)\n`);

    if (paginated.data.length === 0) {
      lines.push('Không tìm thấy thủ tục hành chính nào của tỉnh Gia Lai phù hợp với điều kiện tìm kiếm.');
      lines.push('Bạn có thể thử tìm kiếm với từ khóa khác hoặc lọc theo cấp "Cấp tỉnh" / "Cấp xã".');
      return {
        ...paginated,
        markdown: lines.join('\n')
      };
    }

    for (let i = 0; i < paginated.data.length; i++) {
      const item = paginated.data[i];
      const itemIndex = (paginated.page - 1) * paginated.limit + i + 1;
      const phiText = item.co_thu_phi
        ? `Có phí / lệ phí${item.chi_tiet_phi ? ` (${item.chi_tiet_phi})` : ''}`
        : 'Miễn phí';
      const dvcUrl = item.id ? `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${item.id}` : '';

      lines.push(`### ${itemIndex}. ${item.ten_tthc}`);
      lines.push(`- **Mã TTHC**: \`${item.ma_tthc}\``);
      lines.push(`- **Cơ quan thực hiện**: ${item.co_quan_thuc_hien || 'Tỉnh Gia Lai'}`);
      lines.push(`- **Cơ quan công bố / ban hành**: ${item.co_quan_cong_bo || 'UBND tỉnh Gia Lai'}`);
      lines.push(`- **Cấp thực hiện**: ${item.cap_thuc_hien || 'Chưa rõ'} | **Lĩnh vực**: ${item.linh_vuc || 'Chưa rõ'}`);
      lines.push(`- **Lệ phí**: ${phiText}`);
      if (dvcUrl) {
        lines.push(`- **Cổng DVC Quốc gia**: [Mở hồ sơ trên Cổng DVCQG](${dvcUrl})`);
      }
      lines.push(`*Gợi ý: Dùng \`tra_cuu_tthc_gia_lai\` với mã \`${item.ma_tthc}\` hoặc \`chi_tiet: true\` để xem các bước và giấy tờ cần chuẩn bị.*\n`);
    }

    if (paginated.page < paginated.totalPages) {
      lines.push(`--- \nĐể xem trang tiếp theo, gọi lại tool \`tra_cuu_tthc_gia_lai\` với \`page: ${paginated.page + 1}\``);
    }

    return {
      ...paginated,
      markdown: lines.join('\n')
    };
  }

  /**
   * Tra cứu chuyên sâu các Thủ tục Hành chính nội bộ trong hệ thống hành chính nhà nước
   * (Theo Nghị định số 385/2026/NĐ-CP của Chính phủ về kiểm soát thủ tục hành chính)
   * Gồm: TTHC giữa các cơ quan hành chính nhà nước và TTHC nội bộ trong từng cơ quan
   */
  async searchNoiBoProcedures(params: NoiBoSearchParams): Promise<{
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    data: TTHCIndexItem[];
    markdown: string;
    chiTietList?: any[];
  }> {
    const allItems = await this.loadIndex();

    // 1. Nếu người dùng cung cấp mã TTHC cụ thể
    if (params.ma_tthc) {
      const codeTrim = params.ma_tthc.trim();
      const directDetail = await this.getDetail(codeTrim, {
        phan_muc: 'tat_ca',
        dinh_dang: params.dinh_dang || 'markdown'
      });

      const matchedIndex = await this.findByCodeOrId(codeTrim);

      const headerMd = [
        `# THỦ TỤC HÀNH CHÍNH NỘI BỘ: ${matchedIndex?.ten_tthc || codeTrim}`,
        `> **Phân loại**: ${matchedIndex?.loai_tthc || 'TTHC nội bộ'} (Nghị định số 385/2026/NĐ-CP của Chính phủ về kiểm soát thủ tục hành chính)`,
        `> **Cơ quan thực hiện**: ${matchedIndex?.co_quan_thuc_hien || 'Chưa rõ'} | **Cơ quan công bố**: ${matchedIndex?.co_quan_cong_bo || 'Chưa rõ'}`,
        `> **Cấp thực hiện**: ${matchedIndex?.cap_thuc_hien || 'Chưa rõ'} | **Lĩnh vực**: ${matchedIndex?.linh_vuc || 'Chưa rõ'}`,
        '',
        directDetail.markdown
      ].join('\n');

      return {
        total: 1,
        page: 1,
        limit: 1,
        totalPages: 1,
        data: matchedIndex ? [matchedIndex] : [],
        markdown: headerMd,
        chiTietList: [directDetail]
      };
    }

    // 2. Lọc danh sách TTHC nội bộ
    const isNoiBoRecord = (item: TTHCIndexItem) => {
      const loai = (item.loai_tthc || '').toLowerCase();
      const ten = (item.ten_tthc || '').toLowerCase();
      const lv = (item.linh_vuc || '').toLowerCase();
      return (
        loai.includes('nội bộ') ||
        loai.includes('noi bo') ||
        ten.includes('nội bộ') ||
        ten.includes('noi bo') ||
        lv.includes('nội bộ') ||
        lv.includes('noi bo')
      );
    };

    let nbList = allItems.filter(isNoiBoRecord);

    // Lọc theo nhóm nội bộ theo Nghị định số 385/2026/NĐ-CP:
    if (params.nhom_noi_bo && params.nhom_noi_bo !== 'tat_ca') {
      if (params.nhom_noi_bo === 'giua_cac_co_quan') {
        nbList = nbList.filter(p => {
          const cap = p.cap_thuc_hien || '';
          const loai = p.loai_tthc || '';
          const cq = p.co_quan_thuc_hien || '';
          return loai.includes('liên thông') || cap.includes(',') || cq.includes(',') || cq.includes('Ủy ban nhân dân cấp tỉnh');
        });
      } else if (params.nhom_noi_bo === 'trong_noi_bo') {
        nbList = nbList.filter(p => {
          const cap = p.cap_thuc_hien || '';
          const loai = p.loai_tthc || '';
          return !loai.includes('liên thông') && !cap.includes(',');
        });
      }
    }

    // Lọc theo cấp thực hiện
    if (params.cap_thuc_hien && params.cap_thuc_hien !== 'tat_ca') {
      const capNorm = removeVietnameseTones(params.cap_thuc_hien);
      if (capNorm.includes('bo')) {
        nbList = nbList.filter(p => (p.cap_thuc_hien || '').includes('Cấp Bộ'));
      } else if (capNorm.includes('tinh')) {
        nbList = nbList.filter(p => (p.cap_thuc_hien || '').includes('Cấp tỉnh'));
      } else if (capNorm.includes('xa')) {
        nbList = nbList.filter(p => (p.cap_thuc_hien || '').includes('Cấp xã'));
      }
    }

    // Lọc theo cơ quan thực hiện / ban hành
    if (params.co_quan) {
      const cqNorm = removeVietnameseTones(params.co_quan);
      nbList = nbList.filter(p => {
        const cqItemNorm = removeVietnameseTones(p.co_quan_thuc_hien || '');
        const cbItemNorm = removeVietnameseTones(p.co_quan_cong_bo || '');
        return cqItemNorm.includes(cqNorm) || cbItemNorm.includes(cqNorm);
      });
    }

    // Lọc theo lĩnh vực
    if (params.linh_vuc) {
      const lvNorm = removeVietnameseTones(params.linh_vuc);
      nbList = nbList.filter(p => removeVietnameseTones(p.linh_vuc || '').includes(lvNorm));
    }

    // Lọc theo từ khóa tìm kiếm
    if (params.tu_khoa) {
      const kwNorm = removeVietnameseTones(params.tu_khoa);
      nbList = nbList.filter(p => {
        const tenNorm = removeVietnameseTones(p.ten_tthc || '');
        const ma = (p.ma_tthc || '').toLowerCase();
        const cqNorm = removeVietnameseTones(p.co_quan_thuc_hien || '');
        const lvNorm = removeVietnameseTones(p.linh_vuc || '');
        return tenNorm.includes(kwNorm) || ma.includes(kwNorm) || cqNorm.includes(kwNorm) || lvNorm.includes(kwNorm);
      });
    }

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 10));
    const paginated = this.paginate(nbList, page, limit);

    // Nếu người dùng yêu cầu chi tiết (chi_tiet === true hoặc danh sách chỉ có đúng 1 kết quả)
    if (params.chi_tiet || paginated.total === 1) {
      const maxDetails = Math.min(paginated.data.length, 3);
      const detailsList: any[] = [];
      const lines: string[] = [];

      lines.push(`# CHI TIẾT THỦ TỤC HÀNH CHÍNH NỘI BỘ`);
      lines.push(`> Cơ sở dữ liệu Thủ tục hành chính nội bộ trong hệ thống hành chính nhà nước\n`);
      lines.push(`Tìm thấy **${paginated.total}** thủ tục phù hợp. Dưới đây là thông tin chi tiết đầy đủ của **${maxDetails}** thủ tục:\n`);

      for (let i = 0; i < maxDetails; i++) {
        const item = paginated.data[i];
        lines.push(`---\n## Thủ tục ${i + 1}/${maxDetails}: ${item.ten_tthc}`);
        try {
          const dt = await this.getDetail(item.ma_tthc, { phan_muc: 'tat_ca', dinh_dang: 'markdown' });
          detailsList.push(dt);
          lines.push(dt.markdown);
        } catch {
          lines.push(`- **Mã TTHC**: \`${item.ma_tthc}\``);
          lines.push(`- **Loại thủ tục**: ${item.loai_tthc || 'TTHC nội bộ'}`);
          lines.push(`- **Cơ quan thực hiện**: ${item.co_quan_thuc_hien}`);
          lines.push(`- **Cơ quan công bố**: ${item.co_quan_cong_bo}`);
          lines.push(`- **Cấp thực hiện**: ${item.cap_thuc_hien} | **Lĩnh vực**: ${item.linh_vuc}`);
          lines.push(`*(Đang cập nhật chi tiết dữ liệu từ CSDL Quốc gia)*`);
        }
        lines.push('');
      }

      if (paginated.total > maxDetails) {
        lines.push(`\n> Còn **${paginated.total - maxDetails}** TTHC nội bộ khác. Bạn có thể gọi lại với \`ma_tthc\` cụ thể để xem chi tiết từng thủ tục hoặc gọi với \`chi_tiet: false\` để xem danh sách tổng hợp.`);
      }

      return {
        ...paginated,
        markdown: lines.join('\n'),
        chiTietList: detailsList
      };
    }

    // Hiển thị danh sách tổng quan chuẩn đẹp cho TTHC Nội bộ
    const lines: string[] = [];
    lines.push(`# DANH MỤC THỦ TỤC HÀNH CHÍNH NỘI BỘ`);
    lines.push(`*Cơ sở dữ liệu TTHC nội bộ giữa các cơ quan hành chính nhà nước & nội bộ cơ quan nhà nước*`);

    const criteriaArr: string[] = [];
    if (params.tu_khoa) criteriaArr.push(`Từ khóa: "${params.tu_khoa}"`);
    if (params.cap_thuc_hien && params.cap_thuc_hien !== 'tat_ca') criteriaArr.push(`Cấp: ${params.cap_thuc_hien}`);
    if (params.co_quan) criteriaArr.push(`Cơ quan: "${params.co_quan}"`);
    if (params.linh_vuc) criteriaArr.push(`Lĩnh vực: "${params.linh_vuc}"`);
    if (params.nhom_noi_bo && params.nhom_noi_bo !== 'tat_ca') {
      criteriaArr.push(`Nhóm: ${params.nhom_noi_bo === 'giua_cac_co_quan' ? 'Giữa các cơ quan hành chính' : 'Nội bộ cơ quan'}`);
    }
    if (criteriaArr.length > 0) {
      lines.push(`> Tiêu chí lọc: **${criteriaArr.join(' | ')}**`);
    }

    lines.push(`> Tổng số kết quả: **${paginated.total}** thủ tục | Trang **${paginated.page}/${paginated.totalPages}** (Hiển thị tối đa ${paginated.limit} mục/trang)\n`);

    if (paginated.data.length === 0) {
      lines.push('Không tìm thấy thủ tục hành chính nội bộ nào phù hợp với điều kiện tìm kiếm.');
      lines.push('Bạn có thể thử tìm kiếm với từ khóa khác hoặc gọi lại không kèm bộ lọc để xem toàn bộ danh mục.');
      return {
        ...paginated,
        markdown: lines.join('\n')
      };
    }

    for (let i = 0; i < paginated.data.length; i++) {
      const item = paginated.data[i];
      const itemIndex = (paginated.page - 1) * paginated.limit + i + 1;
      const phiText = item.co_thu_phi
        ? `Có phí / lệ phí${item.chi_tiet_phi ? ` (${item.chi_tiet_phi})` : ''}`
        : 'Miễn phí';
      const dvcUrl = item.id ? `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${item.id}` : '';

      lines.push(`### ${itemIndex}. ${item.ten_tthc}`);
      lines.push(`- **Mã TTHC**: \`${item.ma_tthc}\` | **Loại**: ${item.loai_tthc || 'TTHC nội bộ'}`);
      lines.push(`- **Cơ quan thực hiện**: ${item.co_quan_thuc_hien || 'Chưa rõ'}`);
      lines.push(`- **Cơ quan công bố / ban hành**: ${item.co_quan_cong_bo || 'Chưa rõ'}`);
      lines.push(`- **Cấp thực hiện**: ${item.cap_thuc_hien || 'Chưa rõ'} | **Lĩnh vực**: ${item.linh_vuc || 'Chưa rõ'}`);
      lines.push(`- **Lệ phí**: ${phiText}`);
      if (dvcUrl) {
        lines.push(`- **Cổng DVC Quốc gia**: [Mở hồ sơ trên Cổng DVCQG](${dvcUrl})`);
      }
      lines.push(`*Gợi ý: Dùng tool \`tra_cuu_tthc_noi_bo\` với mã \`${item.ma_tthc}\` hoặc \`chi_tiet: true\` để xem các bước và hồ sơ.*\n`);
    }

    if (paginated.page < paginated.totalPages) {
      lines.push(`--- \nĐể xem trang tiếp theo, gọi lại tool \`tra_cuu_tthc_noi_bo\` với \`page: ${paginated.page + 1}\``);
    }

    return {
      ...paginated,
      markdown: lines.join('\n')
    };
  }

  /**
   * Tra cứu chuyên sâu các Thủ tục Hành chính Nội bộ thuộc phạm vi tỉnh Gia Lai
   * Gồm:
   * - Các TTHC nội bộ được thực hiện tại cấp tỉnh (UBND tỉnh Gia Lai, Chủ tịch UBND tỉnh, các Sở, ban, ngành)
   *   hoặc cấp xã thuộc tỉnh Gia Lai.
   * - Các TTHC nội bộ liên thông giữa cơ quan cấp tỉnh/xã áp dụng trên địa bàn Gia Lai.
   * - Hỗ trợ lọc theo từ khóa, mã TTHC, cơ quan thực hiện, lĩnh vực, cấp thực hiện, nhóm nội bộ và xuất chi tiết.
   */
  async searchNoiBoGiaLaiProcedures(params: NoiBoGiaLaiSearchParams): Promise<{
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    data: TTHCIndexItem[];
    markdown: string;
    chiTietList?: any[];
  }> {
    const allItems = await this.loadIndex();

    // 1. Nếu người dùng cung cấp mã TTHC cụ thể
    if (params.ma_tthc) {
      const codeTrim = params.ma_tthc.trim();
      const directDetail = await this.getDetail(codeTrim, {
        phan_muc: 'tat_ca',
        dinh_dang: params.dinh_dang || 'markdown'
      });

      const matchedIndex = await this.findByCodeOrId(codeTrim);

      const headerMd = [
        `# THỦ TỤC HÀNH CHÍNH NỘI BỘ - TỈNH GIA LAI: ${matchedIndex?.ten_tthc || codeTrim}`,
        `> **Địa bàn áp dụng**: Tỉnh Gia Lai`,
        `> **Phân loại**: ${matchedIndex?.loai_tthc || 'TTHC nội bộ'} (Nghị định số 385/2026/NĐ-CP của Chính phủ về kiểm soát thủ tục hành chính)`,
        `> **Cơ quan thực hiện**: ${matchedIndex?.co_quan_thuc_hien || 'Chủ tịch UBND tỉnh / Sở ban ngành tỉnh Gia Lai'}`,
        `> **Cơ quan công bố**: ${matchedIndex?.co_quan_cong_bo || 'Chưa rõ'}`,
        `> **Cấp thực hiện**: ${matchedIndex?.cap_thuc_hien || 'Cấp tỉnh'} | **Lĩnh vực**: ${matchedIndex?.linh_vuc || 'Chưa rõ'}`,
        '',
        directDetail.markdown
      ].join('\n');

      return {
        total: 1,
        page: 1,
        limit: 1,
        totalPages: 1,
        data: matchedIndex ? [matchedIndex] : [],
        markdown: headerMd,
        chiTietList: [directDetail]
      };
    }

    // 2. Lấy danh sách TTHC nội bộ áp dụng cho Gia Lai
    const isNoiBoRecord = (item: TTHCIndexItem) => {
      const loai = (item.loai_tthc || '').toLowerCase();
      const ten = (item.ten_tthc || '').toLowerCase();
      const lv = (item.linh_vuc || '').toLowerCase();
      return (
        loai.includes('nội bộ') ||
        loai.includes('noi bo') ||
        ten.includes('nội bộ') ||
        ten.includes('noi bo') ||
        lv.includes('nội bộ') ||
        lv.includes('noi bo')
      );
    };

    const glKeywords = [
      'gia lai', 'pleiku', 'an khê', 'ayun pa', 'chư păh', 'chư prông',
      'chư pưh', 'chư sê', 'đak đoa', 'đức cơ', 'ia grai', 'kbang',
      'kông chro', 'krông pa', 'mang yang', 'phú thiện', 'đak pơ'
    ];

    let nbGlList = allItems.filter(item => {
      if (!isNoiBoRecord(item)) return false;

      const combined = `${item.ten_tthc || ''} ${item.co_quan_thuc_hien || ''} ${item.co_quan_cong_bo || ''}`.toLowerCase();
      const matchesExplicitGl = glKeywords.some(kw => combined.includes(kw));

      const cap = item.cap_thuc_hien || '';
      const cq = (item.co_quan_thuc_hien || '').toLowerCase();
      const isProvincialOrCommuneNoiBo =
        cap.includes('Cấp tỉnh') ||
        cap.includes('Cấp xã') ||
        cq.includes('ủy ban nhân dân cấp tỉnh') ||
        cq.includes('chủ tịch ủy ban nhân dân cấp tỉnh') ||
        cq.includes('sở');

      return matchesExplicitGl || isProvincialOrCommuneNoiBo;
    });

    // Lọc theo nhóm nội bộ theo Nghị định 385/2026/NĐ-CP:
    if (params.nhom_noi_bo && params.nhom_noi_bo !== 'tat_ca') {
      if (params.nhom_noi_bo === 'giua_cac_co_quan') {
        nbGlList = nbGlList.filter(p => {
          const cap = p.cap_thuc_hien || '';
          const loai = p.loai_tthc || '';
          const cq = p.co_quan_thuc_hien || '';
          return loai.includes('liên thông') || cap.includes(',') || cq.includes(',') || cq.includes('Ủy ban nhân dân cấp tỉnh');
        });
      } else if (params.nhom_noi_bo === 'trong_noi_bo') {
        nbGlList = nbGlList.filter(p => {
          const cap = p.cap_thuc_hien || '';
          const loai = p.loai_tthc || '';
          return !loai.includes('liên thông') && !cap.includes(',');
        });
      }
    }

    // Lọc theo cấp thực hiện
    if (params.cap_thuc_hien && params.cap_thuc_hien !== 'tat_ca') {
      const capNorm = removeVietnameseTones(params.cap_thuc_hien);
      if (capNorm.includes('tinh')) {
        nbGlList = nbGlList.filter(p => (p.cap_thuc_hien || '').includes('Cấp tỉnh'));
      } else if (capNorm.includes('xa')) {
        nbGlList = nbGlList.filter(p => (p.cap_thuc_hien || '').includes('Cấp xã'));
      }
    }

    // Lọc theo cơ quan (hỗ trợ cả co_quan và co_quan_thuc_hien)
    const agencyParam = params.co_quan_thuc_hien || params.co_quan;
    if (agencyParam) {
      const cqNorm = removeVietnameseTones(agencyParam);
      const isGiaLaiQuery = cqNorm.includes('gia lai');
      nbGlList = nbGlList.filter(p => {
        const cqItemNorm = removeVietnameseTones(p.co_quan_thuc_hien || '');
        const cbItemNorm = removeVietnameseTones(p.co_quan_cong_bo || '');
        if (isGiaLaiQuery) {
          return (
            cqItemNorm.includes(cqNorm) ||
            cbItemNorm.includes(cqNorm) ||
            cqItemNorm.includes('cap tinh') ||
            cqItemNorm.includes('chu tich uy ban nhan dan')
          );
        }
        return cqItemNorm.includes(cqNorm) || cbItemNorm.includes(cqNorm);
      });
    }

    // Lọc theo lĩnh vực
    if (params.linh_vuc) {
      const lvNorm = removeVietnameseTones(params.linh_vuc);
      nbGlList = nbGlList.filter(p => removeVietnameseTones(p.linh_vuc || '').includes(lvNorm));
    }

    // Lọc theo từ khóa tìm kiếm
    if (params.tu_khoa) {
      const kwNorm = removeVietnameseTones(params.tu_khoa);
      nbGlList = nbGlList.filter(p => {
        const tenNorm = removeVietnameseTones(p.ten_tthc || '');
        const ma = (p.ma_tthc || '').toLowerCase();
        const cqNorm = removeVietnameseTones(p.co_quan_thuc_hien || '');
        const lvNorm = removeVietnameseTones(p.linh_vuc || '');
        return tenNorm.includes(kwNorm) || ma.includes(kwNorm) || cqNorm.includes(kwNorm) || lvNorm.includes(kwNorm);
      });
    }

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 10));
    const paginated = this.paginate(nbGlList, page, limit);

    // Nếu yêu cầu chi tiết chuyên sâu (chi_tiet === true hoặc kết quả duy nhất có 1)
    if (params.chi_tiet || paginated.total === 1) {
      const maxDetails = Math.min(paginated.data.length, 3);
      const detailsList: any[] = [];
      const lines: string[] = [];

      lines.push(`# CHI TIẾT THỦ TỤC HÀNH CHÍNH NỘI BỘ - TỈNH GIA LAI`);
      lines.push(`> Cơ sở dữ liệu Thủ tục hành chính nội bộ áp dụng tại địa phương tỉnh Gia Lai (cấp tỉnh, cấp xã, Chủ tịch UBND tỉnh, Sở ban ngành)\n`);
      lines.push(`Tìm thấy **${paginated.total}** thủ tục phù hợp. Dưới đây là thông tin chi tiết đầy đủ của **${maxDetails}** thủ tục:\n`);

      for (let i = 0; i < maxDetails; i++) {
        const item = paginated.data[i];
        lines.push(`---\n## Thủ tục ${i + 1}/${maxDetails}: ${item.ten_tthc}`);
        try {
          const dt = await this.getDetail(item.ma_tthc, { phan_muc: 'tat_ca', dinh_dang: 'markdown' });
          detailsList.push(dt);
          lines.push(dt.markdown);
        } catch {
          lines.push(`- **Mã TTHC**: \`${item.ma_tthc}\``);
          lines.push(`- **Địa bàn áp dụng**: Tỉnh Gia Lai`);
          lines.push(`- **Cơ quan thực hiện**: ${item.co_quan_thuc_hien}`);
          lines.push(`- **Cơ quan công bố**: ${item.co_quan_cong_bo}`);
          lines.push(`- **Cấp thực hiện**: ${item.cap_thuc_hien} | **Lĩnh vực**: ${item.linh_vuc}`);
          lines.push(`*(Đang cập nhật chi tiết dữ liệu từ CSDL Quốc gia)*`);
        }
        lines.push('');
      }

      if (paginated.total > maxDetails) {
        lines.push(`\n> Còn **${paginated.total - maxDetails}** TTHC nội bộ Gia Lai khác. Bạn có thể gọi lại với \`ma_tthc\` cụ thể để xem chi tiết từng thủ tục hoặc gọi với \`chi_tiet: false\` để xem danh sách tổng hợp.`);
      }

      return {
        ...paginated,
        markdown: lines.join('\n'),
        chiTietList: detailsList
      };
    }

    // Hiển thị danh sách tổng quan
    const lines: string[] = [];
    lines.push(`# DANH MỤC THỦ TỤC HÀNH CHÍNH NỘI BỘ - TỈNH GIA LAI`);
    lines.push(`*Cơ sở dữ liệu TTHC nội bộ giữa các cơ quan hành chính & nội bộ cơ quan nhà nước tại địa phương tỉnh Gia Lai*`);

    const criteriaArr: string[] = [];
    if (params.tu_khoa) criteriaArr.push(`Từ khóa: "${params.tu_khoa}"`);
    if (params.cap_thuc_hien && params.cap_thuc_hien !== 'tat_ca') criteriaArr.push(`Cấp: ${params.cap_thuc_hien}`);
    if (agencyParam) criteriaArr.push(`Cơ quan: "${agencyParam}"`);
    if (params.linh_vuc) criteriaArr.push(`Lĩnh vực: "${params.linh_vuc}"`);
    if (params.nhom_noi_bo && params.nhom_noi_bo !== 'tat_ca') {
      criteriaArr.push(`Nhóm: ${params.nhom_noi_bo === 'giua_cac_co_quan' ? 'Giữa các cơ quan hành chính' : 'Nội bộ cơ quan'}`);
    }
    if (criteriaArr.length > 0) {
      lines.push(`> Tiêu chí lọc: **${criteriaArr.join(' | ')}**`);
    }

    lines.push(`> Tổng số kết quả: **${paginated.total}** thủ tục | Trang **${paginated.page}/${paginated.totalPages}** (Hiển thị tối đa ${paginated.limit} mục/trang)\n`);

    if (paginated.data.length === 0) {
      lines.push('Không tìm thấy thủ tục hành chính nội bộ nào thuộc tỉnh Gia Lai phù hợp với điều kiện tìm kiếm.');
      lines.push('Bạn có thể thử tìm kiếm với từ khóa khác hoặc gọi lại không kèm bộ lọc để xem toàn bộ danh mục.');
      return {
        ...paginated,
        markdown: lines.join('\n')
      };
    }

    for (let i = 0; i < paginated.data.length; i++) {
      const item = paginated.data[i];
      const itemIndex = (paginated.page - 1) * paginated.limit + i + 1;
      const phiText = item.co_thu_phi
        ? `Có phí / lệ phí${item.chi_tiet_phi ? ` (${item.chi_tiet_phi})` : ''}`
        : 'Miễn phí';
      const dvcUrl = item.id ? `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${item.id}` : '';

      lines.push(`### ${itemIndex}. ${item.ten_tthc}`);
      lines.push(`- **Mã TTHC**: \`${item.ma_tthc}\` | **Loại**: ${item.loai_tthc || 'TTHC nội bộ'}`);
      lines.push(`- **Cơ quan thực hiện**: ${item.co_quan_thuc_hien || 'Chủ tịch UBND tỉnh / Sở ngành Gia Lai'}`);
      lines.push(`- **Cơ quan công bố / ban hành**: ${item.co_quan_cong_bo || 'Chưa rõ'}`);
      lines.push(`- **Cấp thực hiện**: ${item.cap_thuc_hien || 'Cấp tỉnh'} | **Lĩnh vực**: ${item.linh_vuc || 'Chưa rõ'}`);
      lines.push(`- **Lệ phí**: ${phiText}`);
      if (dvcUrl) {
        lines.push(`- **Cổng DVC Quốc gia**: [Mở hồ sơ trên Cổng DVCQG](${dvcUrl})`);
      }
      lines.push(`*Gợi ý: Dùng tool \`tra_cuu_tthc_noi_bo_gia_lai\` với mã \`${item.ma_tthc}\` hoặc \`chi_tiet: true\` để xem các bước và hồ sơ.*\n`);
    }

    if (paginated.page < paginated.totalPages) {
      lines.push(`--- \nĐể xem trang tiếp theo, gọi lại tool \`tra_cuu_tthc_noi_bo_gia_lai\` với \`page: ${paginated.page + 1}\``);
    }

    return {
      ...paginated,
      markdown: lines.join('\n')
    };
  }
}

export const tthcDataService = new TTHCDataService();
