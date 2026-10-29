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

