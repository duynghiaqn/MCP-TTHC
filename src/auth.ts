import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Xác thực API Key chia sẻ (Shared API Key) cho MCP Server TTHC.
 *
 * Nguồn cấu hình (gộp tất cả, bỏ trùng):
 *   - MCP_API_KEYS : danh sách nhiều key, phân tách bằng dấu phẩy / xuống dòng.
 *                    Mỗi phần tử có thể kèm nhãn đối tác: "nhan:key" (vd: "openai:sk_abc,dify:sk_xyz").
 *   - API_KEY      : key đơn (tương thích ngược).
 *   - MCP_API_KEY  : key đơn (tương thích ngược).
 *
 * Thứ tự đọc key từ request (chuẩn hóa tương thích OpenAI MCP / Codex Plugin / Custom GPT Actions):
 *   1. Header  "Authorization: Bearer <key>"      (OpenAI Responses API, Codex plugin api_key/bearer, ChatGPT)
 *   2. Header  "X-API-Key: <key>"                 (Custom GPT Actions, Dify, n8n, Postman)
 *   3. Query   ?key= | ?api_key= | ?apiKey= | ?api-key= | ?token=   (client chỉ hỗ trợ URL, vd ChatGPT connector)
 *
 * Nếu không cấu hình key nào -> chế độ mở (development / public).
 */

export type ApiKeySource = 'authorization' | 'x-api-key' | 'query' | 'none';

export interface AuthResult {
  isValid: boolean;
  /** Có bật bắt buộc API key hay không */
  authRequired: boolean;
  /** Nhãn của key đã khớp (vd "openai"), hữu ích để log/thống kê đối tác chia sẻ */
  keyLabel?: string;
  /** Vị trí client đã gửi key */
  source?: ApiKeySource;
  message?: string;
}

interface SharedKey {
  label: string;
  digest: Buffer;
}

export const API_KEY_QUERY_PARAMS = ['api-key', 'key', 'apiKey', 'api_key', 'token'] as const;

let cachedRaw: string | null = null;
let cachedKeys: SharedKey[] = [];

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Đọc & cache danh sách key chia sẻ từ biến môi trường (tự làm mới khi env thay đổi) */
export function getSharedKeys(): SharedKey[] {
  const raw = [process.env.MCP_API_KEYS, process.env.API_KEY, process.env.MCP_API_KEY]
    .map(v => (v || '').trim())
    .join('\n');

  if (raw === cachedRaw) return cachedKeys;

  const seen = new Set<string>();
  const keys: SharedKey[] = [];
  let index = 0;
  for (const part of raw.split(/[\n,;]+/)) {
    const entry = part.trim();
    if (!entry) continue;
    index += 1;
    const sep = entry.indexOf(':');
    // "nhan:key" chỉ khi nhãn hợp lệ (chữ/số/_-), tránh cắt nhầm key chứa dấu ":"
    const hasLabel = sep > 0 && /^[A-Za-z0-9_.-]{1,40}$/.test(entry.slice(0, sep));
    const label = hasLabel ? entry.slice(0, sep) : `key${index}`;
    const key = hasLabel ? entry.slice(sep + 1).trim() : entry;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push({ label, digest: sha256(key) });
  }

  cachedRaw = raw;
  cachedKeys = keys;
  return keys;
}

export function isAuthRequired(): boolean {
  return getSharedKeys().length > 0;
}

function readHeader(
  headers: Headers | Record<string, string | undefined> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers as Record<string, string | undefined>)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

function toSearchParams(urlOrParams: string | URL | URLSearchParams): URLSearchParams {
  if (urlOrParams instanceof URLSearchParams) return urlOrParams;
  if (urlOrParams instanceof URL) return urlOrParams.searchParams;
  try {
    return new URL(urlOrParams, 'http://localhost').searchParams;
  } catch {
    return new URLSearchParams(urlOrParams);
  }
}

/** Trích xuất key ứng viên từ request theo thứ tự ưu tiên chuẩn */
export function extractApiKey(
  urlOrParams: string | URL | URLSearchParams,
  headers?: Headers | Record<string, string | undefined>
): { key: string; source: ApiKeySource } {
  const authHeader = readHeader(headers, 'authorization');
  if (authHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match && match[1].trim()) return { key: match[1].trim(), source: 'authorization' };
  }

  const xApiKey = readHeader(headers, 'x-api-key');
  if (xApiKey && xApiKey.trim()) return { key: xApiKey.trim(), source: 'x-api-key' };

  const params = toSearchParams(urlOrParams);
  for (const name of API_KEY_QUERY_PARAMS) {
    const value = params.get(name);
    if (value && value.trim()) return { key: value.trim(), source: 'query' };
  }

  return { key: '', source: 'none' };
}

/** So khớp key bằng timing-safe compare trên SHA-256 digest (chống timing attack) */
function matchKey(candidate: string): SharedKey | undefined {
  const digest = sha256(candidate);
  let found: SharedKey | undefined;
  for (const k of getSharedKeys()) {
    // Không break sớm để thời gian so khớp không phụ thuộc vị trí key
    if (timingSafeEqual(digest, k.digest) && !found) found = k;
  }
  return found;
}

/**
 * Validate API Key từ URL query hoặc headers.
 * Giữ nguyên chữ ký hàm cũ để tương thích ngược.
 */
export function validateApiKey(
  urlOrParams: string | URL | URLSearchParams,
  headers?: Headers | Record<string, string | undefined>
): AuthResult {
  if (!isAuthRequired()) {
    return { isValid: true, authRequired: false, source: 'none' };
  }

  const { key, source } = extractApiKey(urlOrParams, headers);
  if (key) {
    const matched = matchKey(key);
    if (matched) {
      return { isValid: true, authRequired: true, keyLabel: matched.label, source };
    }
  }

  return {
    isValid: false,
    authRequired: true,
    source,
    message: key
      ? 'Unauthorized: API key không hợp lệ.'
      : 'Unauthorized: Thiếu API key. Gửi tham số URL ?api-key=<key> (hoặc ?key=<key>), hoặc Header "Authorization: Bearer <key>" / "X-API-Key: <key>".'
  };
}

/** Headers chuẩn RFC 6750 kèm phản hồi 401 */
export function getAuthChallengeHeaders(): Record<string, string> {
  return {
    'WWW-Authenticate': 'Bearer realm="mcp-tthc", error="invalid_token"'
  };
}

/** Ẩn key khi log / hiển thị (giữ 4 ký tự đầu) */
export function maskApiKey(key: string): string {
  if (!key) return '';
  return key.length <= 6 ? '***' : `${key.slice(0, 4)}…${'*'.repeat(4)}`;
}
