export interface TTHCIndexItem {
  id: string;
  ma_tthc: string;
  ten_tthc: string;
  cap_thuc_hien: string;
  loai_tthc: string;
  linh_vuc: string;
  co_quan_thuc_hien: string;
  co_quan_cong_bo: string;
  nganh_doc: boolean;
  muc_do: string;
  state: string;
  co_thu_phi: boolean;
  chi_tiet_phi: string;
}

export interface TTHCVersion {
  last_updated: string;
  total_records: number;
}

export interface ExecutionStep {
  name?: string;
  description?: string;
  stepNumber?: number;
}

export interface ProfileComponent {
  name?: string;
  quantity?: string | number;
  note?: string;
  originalDocument?: boolean;
  certifiedCopy?: boolean;
}

export interface FeeItem {
  name?: string;
  fee?: string | number;
  note?: string;
  unit?: string;
}

export interface LegalBasis {
  title?: string;
  code?: string;
  promulgateDate?: string;
}

export interface ExecutionMethodItem {
  submissionMethod?: string;
  processingTime?: number | string;
  processingTimeUnit?: string;
  description?: string;
  fees?: Array<{
    type?: string;
    value?: number;
    description?: string;
  }>;
}

export interface CaseItem {
  id?: string;
  name?: string;
  code?: string;
  processingDay?:
    | {
        qty?: number | string;
        type?: string;
      }
    | string
    | number;
  description?: string;
}

export interface TTHCDetail {
  id: string;
  code: string;
  codeNotation?: string;
  name?: string;
  description?: string;
  decisionNo?: string;
  state?: string;
  type?: string;
  executionSteps?: ExecutionStep[];
  executionMethods?: ExecutionMethodItem[];
  profileComponents?: Array<{
    name?: string;
    originalCopy?: string | number;
    certifiedCopy?: string | number;
    electronicCopy?: string | number;
    note?: string;
    components?: ProfileComponent[];
  }>;
  fees?: FeeItem[];
  cases?: CaseItem[];
  requirementsAndConditions?:
    | string
    | Array<{ name?: string; description?: string } | string>;
  legalBasisesDetails?: LegalBasis[];
  executingAgencies?: Array<{ name?: string; code?: string }>;
  targetObjects?: Array<{ name?: string }>;
  resultsDetails?: Array<{ name?: string }>;
  dossierReceivingAddresses?: Array<{ name?: string; address?: string }>;
  returningMethods?: Array<{ type?: string; value?: string[] }>;
  [key: string]: unknown;
}

export interface SearchResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SystemStats {
  totalRecords: number;
  lastUpdated: string;
  capThucHienCounts: Record<string, number>;
  linhVucCounts: Record<string, number>;
}

export type DetailSection =
  | 'tat_ca'
  | 'ho_so'
  | 'trinh_tu'
  | 'chi_phi'
  | 'thoi_han'
  | 'can_cu_phap_ly'
  | 'yeu_cau_dieu_kien';

export interface RelatedSuggestion {
  ma_tthc: string;
  ten_tthc: string;
  cap_thuc_hien: string;
  linh_vuc: string;
  co_quan_thuc_hien: string;
  ly_do_lien_quan: string;
  dvc_url?: string;
}

export interface RelatedProceduresResult {
  goc: {
    ma_tthc?: string;
    ten_tthc?: string;
    linh_vuc?: string;
    cap_thuc_hien?: string;
    co_quan_thuc_hien?: string;
  } | null;
  chu_de?: string;
  tong_so_goi_y: number;
  totalSuggestions?: number;
  danh_sach: RelatedSuggestion[];
  suggestions: RelatedSuggestion[];
  markdown: string;
}

export interface NoiBoSearchParams {
  tu_khoa?: string;
  ma_tthc?: string;
  co_quan?: string;
  linh_vuc?: string;
  cap_thuc_hien?: string;
  nhom_noi_bo?: 'tat_ca' | 'giua_cac_co_quan' | 'trong_noi_bo';
  chi_tiet?: boolean;
  page?: number;
  limit?: number;
  dinh_dang?: 'markdown' | 'json';
}

export interface NoiBoGiaLaiSearchParams extends NoiBoSearchParams {
  co_quan_thuc_hien?: string;
}

export interface DVCTTOptions {
  q?: string;
  formalityId?: string;
  formalityCaseId?: string;
  departmentId?: string;
  departmentParentId?: string;
  limit?: number;
  lastId?: string;
  implementLevel?: string; // 'FULL' | 'PARTIAL' | ''
  formalityTargetType?: string;
  provinceCode?: string;
  wardCode?: string;
  dinh_dang?: 'markdown' | 'json';
}

export interface DVCTTRow {
  id: string;
  formalityId?: string;
  formalityCode?: string;
  formalityCaseId?: string;
  formalityCaseName?: string;
  formalityCaseCode?: string;
  departmentId?: string;
  departmentName?: string;
  departmentCode?: string;
  departmentLevel?: string;
  departmentType?: string;
  implementLevel?: 'FULL' | 'PARTIAL' | string;
  citizenUrl?: string;
  employeeUrl?: string;
  isEssential?: boolean;
  categoryInfo?: Array<{
    categoryId?: string;
    categoryName?: string;
    categoryCode?: string;
    formalityCaseId?: string;
  }>;
}

export interface DVCTTResult {
  total: number;
  lastId?: string;
  provinceCode?: string;
  provinceName?: string;
  q?: string;
  implementLevel?: string;
  rows: DVCTTRow[];
  markdown: string;
}

export interface HTGQConfig {
  provinceCode?: string;
  dvcBaseUrl?: string;
  limit?: number;
}

export interface HTGQResult {
  formality_id: string;
  formality_code: string;
  formality_name: string;
  category_name?: string;
  department_name?: string;
  status: 'Đã cung cấp DVCTT' | 'Chưa cung cấp';
  has_button: boolean;
  implement_level: string; // 'Toàn trình' | 'Một phần' | 'Chưa cung cấp'
  implement_cap: string; // 'Cấp xã' | 'Cấp tỉnh' | 'Cấp Bộ' | 'Tỉnh' ...
  classification: string;
  loaiHTGQ: 'HTGQ Địa phương' | 'HTGQ Quốc gia' | 'HTGQ Bộ ngành' | '' | string;
  target_dvc_url?: string;
  sso_redirect_url?: string;
  effective_url?: string;
  url_page: string;
  total_services: number;
  note: string;
  first_row?: DVCTTRow | null;
  markdown: string;
}

export interface DVCQGLiveExecutionStep {
  name?: string;
  description?: string;
}

export interface DVCQGLiveFee {
  type?: string;
  value?: number;
  description?: string;
  currencyName?: string;
}

export interface DVCQGLiveExecutionMethod {
  submissionMethod?: 'DIRECT' | 'ONLINE' | string;
  processingTime?: number;
  processingTimeUnit?: 'WORKING_DAY' | 'DAY' | string;
  description?: string;
  fees?: DVCQGLiveFee[];
}

export interface DVCQGLiveLegalBasis {
  id?: string;
  name?: string;
  code?: string;
}

export interface DVCQGLiveResultItem {
  id?: string;
  name?: string;
  code?: string;
}

export interface DVCQGLiveCase {
  id?: string;
  name?: string;
  code?: string;
  processingDay?: {
    qty?: number;
    type?: string;
  };
  profileComponents?: unknown[];
}

export interface DVCQGLiveCategory {
  id?: string;
  name?: string;
  code?: string;
}

export interface DVCQGLiveFormality {
  id: string;
  code?: string;
  codeNotation?: string;
  name?: string;
  decisionNo?: string;
  departmentPromulgateName?: string;
  description?: string;
  keywords?: string;
  executionSteps?: DVCQGLiveExecutionStep[];
  executionMethods?: DVCQGLiveExecutionMethod[];
  legalBasisesDetails?: DVCQGLiveLegalBasis[];
  resultsDetails?: DVCQGLiveResultItem[];
  cases?: DVCQGLiveCase[];
  categoriesDetails?: DVCQGLiveCategory[];
  returningMethods?: Array<{ type?: string; value?: string[] }>;
  isFullProcess?: boolean;
  isWard?: boolean;
  isProvince?: boolean;
  isMinistry?: boolean;
  isOtherAgency?: boolean;
  [key: string]: unknown;
}

export interface LiveFormalityResult {
  success: boolean;
  id: string;
  code?: string;
  name?: string;
  data?: DVCQGLiveFormality;
  markdown: string;
  error?: string;
}

export interface QDCBItem {
  id: string;
  so_quyet_dinh: string;
  trich_yeu: string;
  ngay_quyet_dinh: string;
  decision_date_ts?: number;
  ngay_cong_bo: string;
  publication_date_ts?: number;
  created_at_ts?: number;
  updated_at_ts?: number;
  co_quan_ban_hanh: string;
  ma_co_quan?: string;
  linh_vuc: string[];
  loai_quyet_dinh?: string;
  trang_thai?: string;
  tep_dinh_kem?: Array<{ name?: string; url?: string }>;
  url: string;
}

export interface QDCBAttachedTTHCItem {
  id: string;
  ma_tthc: string;
  ten_tthc: string;
  linh_vuc?: string[];
  ngay_hieu_luc?: string;
  trang_thai?: string;
  url?: string;
}

export interface QDCBAttachedTTHC {
  cong_khai_moi?: { count: number; items: QDCBAttachedTTHCItem[] };
  sua_doi_bo_sung?: { count: number; items: QDCBAttachedTTHCItem[] };
  bai_bo?: { count: number; items: QDCBAttachedTTHCItem[] };
  thay_the?: { count: number; items: QDCBAttachedTTHCItem[] };
  dieu_chinh?: { count: number; items: QDCBAttachedTTHCItem[] };
}

export interface QDCBDetail extends QDCBItem {
  fetched_at?: string;
  thong_tin_chi_tiet?: Record<string, unknown>;
  tthc_kem_theo?: QDCBAttachedTTHC;
}

export interface QDCBSearchParams {
  tu_khoa?: string;
  so_quyet_dinh?: string;
  co_quan_ban_hanh?: string;
  linh_vuc?: string;
  nam?: number;
  thang?: string;
  moi_trong_thang?: boolean;
  limit?: number;
  page?: number;
  dinh_dang?: 'markdown' | 'json';
}

export interface QDCBSearchResult {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  data: QDCBItem[];
  markdown: string;
}




