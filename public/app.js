// MCP TTHC Web Application Logic
document.addEventListener('DOMContentLoaded', () => {
  const currentOrigin = window.location.origin;
  const serverUrlInput = document.getElementById('server-url-input');
  const apiKeyInput = document.getElementById('api-key-input');
  const btnToggleKey = document.getElementById('btn-toggle-key-visibility');
  const btnSaveKey = document.getElementById('btn-save-key');
  const btnCopyUrl = document.getElementById('btn-copy-url');

  const statusText = document.getElementById('system-status-text');
  const totalCountEl = document.getElementById('header-total-count');
  const headerLatencyPill = document.getElementById('header-latency-pill');
  const headerLatencyVal = document.getElementById('header-latency-val');
  const footerSpeedVal = document.getElementById('footer-speed-val');

  // Navigation tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  // Tool form elements
  const selectMcpTool = document.getElementById('select-mcp-tool');
  const toolForm = document.getElementById('tool-params-form');
  const btnExecuteTool = document.getElementById('btn-execute-tool');
  const btnExecuteText = document.getElementById('btn-execute-text');
  const executeSpinner = document.getElementById('execute-spinner');
  const executionTimeBadge = document.getElementById('execution-time');

  // Result view elements
  const btnViewRendered = document.getElementById('btn-view-rendered');
  const btnViewMarkdown = document.getElementById('btn-view-markdown');
  const btnViewJson = document.getElementById('btn-view-json');
  const btnCopyResult = document.getElementById('btn-copy-result');

  const viewportRendered = document.getElementById('viewport-rendered');
  const viewportMarkdown = document.getElementById('viewport-markdown');
  const viewportJson = document.getElementById('viewport-json');

  // Client Config Tab
  const clientTabs = document.querySelectorAll('.client-tab');
  const configFileLabel = document.getElementById('config-file-label');
  const configCodeDisplay = document.getElementById('config-code-display');
  const btnCopyConfig = document.getElementById('btn-copy-config');

  // Modal & Export Markdown
  const modal = document.getElementById('detail-modal');
  const modalTitle = document.getElementById('modal-tthc-title');
  const modalBody = document.getElementById('modal-tthc-body');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const modalViewToggle = document.getElementById('modal-view-mode-toggle');
  const btnModalModeRendered = document.getElementById('btn-modal-mode-rendered');
  const btnModalModeMarkdown = document.getElementById('btn-modal-mode-markdown');
  const btnModalCopyMd = document.getElementById('btn-modal-copy-md');
  const btnModalDownloadMd = document.getElementById('btn-modal-download-md');
  const modalMarkdownViewport = document.getElementById('modal-tthc-markdown-viewport');
  const modalMarkdownCode = document.getElementById('modal-tthc-markdown-code');

  // State
  let currentRawResult = null;
  let currentMarkdownResult = '';
  let currentModalMarkdown = '';
  let currentModalCode = '';
  let activeClientConfig = 'cursor';
  let serverAuthRequired = false;

  // 1. Initialize Server URL & API Key (Đọc từ URL ?api-key=... / ?key=... hoặc localStorage)
  serverUrlInput.value = currentOrigin;
  const urlParams = new URLSearchParams(window.location.search);
  const urlApiKey =
    urlParams.get('api-key') ||
    urlParams.get('key') ||
    urlParams.get('apiKey') ||
    urlParams.get('api_key') ||
    '';
  const savedKey = localStorage.getItem('mcp_tthc_api_key');
  if (urlApiKey) {
    apiKeyInput.value = urlApiKey;
    try { localStorage.setItem('mcp_tthc_api_key', urlApiKey); } catch {}
  } else if (savedKey) {
    apiKeyInput.value = savedKey;
  } else {
    apiKeyInput.value = '';
  }

  // Tự động cập nhật năm hiện hành cho footer
  const currentYearEl = document.getElementById('current-year');
  if (currentYearEl) {
    currentYearEl.textContent = new Date().getFullYear().toString();
  }

  function getActiveApiKey() {
    return apiKeyInput.value.trim();
  }

  // Cập nhật cấu hình ngay khi người dùng gõ phím
  apiKeyInput.addEventListener('input', () => {
    updateClientConfigs();
  });

  // Toggle API key visibility
  btnToggleKey.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      btnToggleKey.innerHTML = '<i class="bi bi-eye-slash"></i>';
    } else {
      apiKeyInput.type = 'password';
      btnToggleKey.innerHTML = '<i class="bi bi-eye"></i>';
    }
  });

  // Save API key
  btnSaveKey.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem('mcp_tthc_api_key', key);
      showToast('Đã lưu khóa API an toàn trong trình duyệt!');
    } else {
      localStorage.removeItem('mcp_tthc_api_key');
      showToast('Đã xóa khóa API đã lưu.');
    }
    updateClientConfigs();
  });

  // Copy server URL
  btnCopyUrl.addEventListener('click', () => {
    navigator.clipboard.writeText(currentOrigin);
    showToast('Đã sao chép URL Server!');
  });

  // Helper: Đã tắt hiển thị tốc độ phản hồi / độ trễ (latency ms) theo yêu cầu giao diện
  function updateLatencyDisplay(_latencyMs) {}

  // 2. Health check & Query Real Count (Không dùng mockup) & Đo tốc độ kết nối
  async function checkHealth() {
    const startTime = performance.now();
    try {
      totalCountEl.textContent = '...';
      const res = await fetch(`${currentOrigin}/api/health?t=${Date.now()}`);
      const latency = Math.round(performance.now() - startTime);

      if (res.ok) {
        const data = await res.json();
        const connCount = Number(data.connections ?? data.active_connections ?? 1);
        statusText.textContent = `${connCount} kết nối`;
        const statusIndicator = document.querySelector('.status-indicator');
        if (statusIndicator) {
          statusIndicator.title = `Máy chủ hoạt động • ${connCount} kết nối đang hoạt động`;
        }
        updateLatencyDisplay(latency);

        if (data.app_version) {
          const vBadge = document.getElementById('app-version-badge');
          if (vBadge) vBadge.textContent = `v${data.app_version}`;
          const fBadge = document.getElementById('footer-version-badge');
          if (fBadge) fBadge.textContent = `v${data.app_version}`;
        }

        // Lấy số lượng thực tế từ kết quả truy vấn máy chủ
        const realCount =
          data.total_records ||
          data.data_version?.total_records ||
          data.version?.total_records;
        if (realCount && Number(realCount) > 0) {
          const formatted = Number(realCount).toLocaleString('vi-VN');
          totalCountEl.textContent = formatted;
        } else {
          totalCountEl.textContent = '---';
        }

        // Lấy thời gian cập nhật dữ liệu dựa vào version url
        const rawUpdated =
          data.last_updated ||
          data.data_version?.last_updated ||
          data.version?.last_updated;
        const updatedValEl = document.getElementById('header-updated-val');
        const updatedBadgeEl = document.getElementById('header-updated-badge');
        if (updatedValEl) {
          if (rawUpdated) {
            try {
              const d = new Date(rawUpdated);
              if (!isNaN(d.getTime())) {
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                const hours = String(d.getHours()).padStart(2, '0');
                const minutes = String(d.getMinutes()).padStart(2, '0');
                updatedValEl.textContent = `${day}/${month}/${year}`;
                if (updatedBadgeEl) {
                  updatedBadgeEl.title = `Thời gian cập nhật dữ liệu: ${day}/${month}/${year} ${hours}:${minutes} (CSDL DVCQG)`;
                }
              } else {
                updatedValEl.textContent = String(rawUpdated).slice(0, 10);
              }
            } catch {
              updatedValEl.textContent = String(rawUpdated).slice(0, 10);
            }
          } else {
            updatedValEl.textContent = '---';
          }
        }

        serverAuthRequired = Boolean(data.authRequired);
        const noticeEl = document.getElementById('auth-notice-text');
        if (noticeEl) {
          if (serverAuthRequired) {
            noticeEl.innerHTML = 'Bảo mật API: <b>BẬT</b>. Chỉ thực thi và hiển thị khi bạn nhập <code>API_KEY</code>.';
          } else {
            noticeEl.innerHTML = 'Bảo mật API: <i>Tùy chọn</i> (Chế độ phát triển mở).';
          }
        }
        updateClientConfigs();
      } else {
        statusText.textContent = 'Máy chủ ngoại tuyến';
        totalCountEl.textContent = '---';
        const updatedValEl = document.getElementById('header-updated-val');
        if (updatedValEl) updatedValEl.textContent = '---';
        if (headerLatencyPill) headerLatencyPill.style.display = 'none';
        if (footerSpeedVal) footerSpeedVal.textContent = 'Mất kết nối';
      }
    } catch {
      statusText.textContent = 'Không kết nối được';
      totalCountEl.textContent = '---';
      const updatedValEl = document.getElementById('header-updated-val');
      if (updatedValEl) updatedValEl.textContent = '---';
      if (headerLatencyPill) headerLatencyPill.style.display = 'none';
      if (footerSpeedVal) footerSpeedVal.textContent = 'Ngoại tuyến';
    }
  }

  checkHealth();
  setInterval(checkHealth, 30000);

  // 3. Tab Navigation
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = `panel-${btn.dataset.tab}`;
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('active');

      if (btn.dataset.tab === 'connect') {
        updateClientConfigs();
      }
    });
  });

  // 4. Dynamic Tool Parameters Form Switching
  const paramGroups = {
    tra_cuu_quyet_dinh_cong_bo: document.getElementById('params-tra_cuu_quyet_dinh_cong_bo'),
    chi_tiet_quyet_dinh_cong_bo: document.getElementById('params-chi_tiet_quyet_dinh_cong_bo'),
    tra_cuu_tthc_gia_lai: document.getElementById('params-tra_cuu_tthc_gia_lai'),
    tra_cuu_tthc_noi_bo_gia_lai: document.getElementById('params-tra_cuu_tthc_noi_bo_gia_lai'),
    tra_cuu_tthc_noi_bo: document.getElementById('params-tra_cuu_tthc_noi_bo'),
    tra_cuu_theo_ma_tthc: document.getElementById('params-tra_cuu_theo_ma_tthc'),
    goi_y_thu_tuc_lien_quan: document.getElementById('params-goi_y_thu_tuc_lien_quan'),
    tim_kiem_theo_ten_tthc: document.getElementById('params-tim_kiem_theo_ten_tthc'),
    loc_theo_cap_thuc_hien: document.getElementById('params-loc_theo_cap_thuc_hien'),
    loc_theo_linh_vuc: document.getElementById('params-loc_theo_linh_vuc'),
    tim_kiem_tong_hop: document.getElementById('params-tim_kiem_tong_hop'),
    thong_tin_mcp_server: null
  };

  const paginationControls = document.getElementById('common-pagination-controls');

  selectMcpTool.addEventListener('change', () => {
    const selected = selectMcpTool.value;
    Object.keys(paramGroups).forEach(key => {
      const el = paramGroups[key];
      if (el) el.style.display = key === selected ? 'block' : 'none';
    });

    if (
      selected === 'chi_tiet_quyet_dinh_cong_bo' ||
      selected === 'tra_cuu_theo_ma_tthc' ||
      selected === 'goi_y_thu_tuc_lien_quan' ||
      selected === 'thong_tin_mcp_server'
    ) {
      paginationControls.style.display = 'none';
    } else {
      paginationControls.style.display = 'flex';
    }
  });

  // Quick Chips
  document.querySelectorAll('.btn-chip[data-fill-code]').forEach(chip => {
    chip.addEventListener('click', () => {
      const code = chip.dataset.fillCode;
      document.getElementById('input-ma-tthc').value = code;
    });
  });

  document.querySelectorAll('.btn-chip[data-fill-theme]').forEach(chip => {
    chip.addEventListener('click', () => {
      const theme = chip.dataset.fillTheme;
      const themeInput = document.getElementById('input-related-theme');
      if (themeInput) themeInput.value = theme;
    });
  });

  document.querySelectorAll('.btn-chip[data-fill-query]').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.dataset.fillQuery;
      document.getElementById('input-ten-tthc').value = q;
    });
  });

  document.querySelectorAll('.btn-chip[data-fill-agency]').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.fillAgency;
      document.getElementById('input-co-quan').value = val;
    });
  });

  document.querySelectorAll('.btn-chip[data-fill-banhanh]').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.fillBanhanh;
      document.getElementById('input-co-quan-ban-hanh').value = val;
    });
  });

  document.querySelectorAll('.btn-chip[data-fill-linhvuc]').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.fillLinhvuc;
      const selectEl = document.getElementById('select-linh-vuc');
      if (selectEl) {
        selectEl.value = val;
      }
    });
  });

  // Quick Chips Gia Lai
  document.querySelectorAll('.btn-chip[data-fill-gl-cq]').forEach(chip => {
    chip.addEventListener('click', () => {
      const cq = chip.dataset.fillGlCq;
      const inputEl = document.getElementById('input-gialai-co-quan');
      if (inputEl) inputEl.value = cq;
    });
  });
  document.querySelectorAll('.btn-chip[data-fill-gl-cap]').forEach(chip => {
    chip.addEventListener('click', () => {
      const cap = chip.dataset.fillGlCap;
      const selectEl = document.getElementById('select-gialai-cap');
      if (selectEl) selectEl.value = cap;
    });
  });
  document.querySelectorAll('.btn-chip[data-fill-gl-code]').forEach(chip => {
    chip.addEventListener('click', () => {
      const code = chip.dataset.fillGlCode;
      const inputEl = document.getElementById('input-gialai-code');
      if (inputEl) inputEl.value = code;
    });
  });

  document.querySelectorAll('.btn-chip[data-fill-nb-cq]').forEach(chip => {
    chip.addEventListener('click', () => {
      const cq = chip.dataset.fillNbCq;
      const inputEl = document.getElementById('input-noibo-co-quan');
      if (inputEl) inputEl.value = cq;
    });
  });
  document.querySelectorAll('.btn-chip[data-fill-nb-lv]').forEach(chip => {
    chip.addEventListener('click', () => {
      const lv = chip.dataset.fillNbLv;
      const inputEl = document.getElementById('input-noibo-linh-vuc');
      if (inputEl) inputEl.value = lv;
    });
  });
  document.querySelectorAll('.btn-chip[data-fill-nb-cap]').forEach(chip => {
    chip.addEventListener('click', () => {
      const cap = chip.dataset.fillNbCap;
      const selectEl = document.getElementById('select-noibo-cap');
      if (selectEl) selectEl.value = cap;
    });
  });
  document.querySelectorAll('.btn-chip[data-fill-nb-code]').forEach(chip => {
    chip.addEventListener('click', () => {
      const code = chip.dataset.fillNbCode;
      const inputEl = document.getElementById('input-noibo-code');
      if (inputEl) inputEl.value = code;
    });
  });

  // Quick chips cho TTHC nội bộ Gia Lai
  document.querySelectorAll('.btn-chip[data-fill-nbgl-cq]').forEach(chip => {
    chip.addEventListener('click', () => {
      const cq = chip.dataset.fillNbglCq;
      const inputEl = document.getElementById('input-noibo-gl-co-quan');
      if (inputEl) inputEl.value = cq;
    });
  });
  document.querySelectorAll('.btn-chip[data-fill-nbgl-lv]').forEach(chip => {
    chip.addEventListener('click', () => {
      const lv = chip.dataset.fillNbglLv;
      const inputEl = document.getElementById('input-noibo-gl-linh-vuc');
      if (inputEl) inputEl.value = lv;
    });
  });
  document.querySelectorAll('.btn-chip[data-fill-nbgl-cap]').forEach(chip => {
    chip.addEventListener('click', () => {
      const cap = chip.dataset.fillNbglCap;
      const selectEl = document.getElementById('select-noibo-gl-cap');
      if (selectEl) selectEl.value = cap;
    });
  });
  document.querySelectorAll('.btn-chip[data-fill-nbgl-code]').forEach(chip => {
    chip.addEventListener('click', () => {
      const code = chip.dataset.fillNbglCode;
      const inputEl = document.getElementById('input-noibo-gl-code');
      if (inputEl) inputEl.value = code;
    });
  });

  // Quick chips cho QĐCB
  document.querySelectorAll('.btn-chip[data-fill-qdcb-so]').forEach(chip => {
    chip.addEventListener('click', () => {
      const so = chip.dataset.fillQdcbSo;
      const inputEl = document.getElementById('input-qdcb-so');
      if (inputEl && so !== undefined) inputEl.value = so;
    });
  });
  document.querySelectorAll('.btn-chip[data-fill-qdcb-coquan]').forEach(chip => {
    chip.addEventListener('click', () => {
      const cq = chip.dataset.fillQdcbCoquan;
      const inputEl = document.getElementById('input-qdcb-coquan');
      if (inputEl && cq !== undefined) inputEl.value = cq;
    });
  });
  document.querySelectorAll('.btn-chip[data-fill-qdcb-monthly]').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.fillQdcbMonthly;
      const selectEl = document.getElementById('select-qdcb-monthly');
      if (selectEl && val !== undefined) selectEl.value = val;
    });
  });
  document.querySelectorAll('.btn-chip[data-fill-qdcb-detail]').forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.dataset.fillQdcbDetail;
      const inputEl = document.getElementById('input-qdcb-detail-id');
      if (inputEl && val !== undefined) inputEl.value = val;
    });
  });

  // 5. Tool Execution via MCP JSON-RPC
  toolForm.addEventListener('submit', async e => {
    e.preventDefault();
    await executeCurrentTool();
  });

  async function executeCurrentTool(customTool, customArgs) {
    const toolName = customTool || selectMcpTool.value;
    const apiKey = getActiveApiKey();
    const limit = parseInt(document.getElementById('input-limit')?.value || '10', 10);
    const page = parseInt(document.getElementById('input-page')?.value || '1', 10);

    let args = customArgs || {};
    if (!customArgs) {
      if (toolName === 'tra_cuu_quyet_dinh_cong_bo' || toolName === 'tra_cuu_qdcb' || toolName === 'tim_kiem_qdcb') {
        const kw = document.getElementById('input-qdcb-keyword')?.value.trim();
        const so = document.getElementById('input-qdcb-so')?.value.trim();
        const cq = document.getElementById('input-qdcb-coquan')?.value.trim();
        const lv = document.getElementById('input-qdcb-linhvuc')?.value.trim();
        const namVal = document.getElementById('input-qdcb-nam')?.value.trim();
        const thangVal = document.getElementById('input-qdcb-thang')?.value.trim();
        const isMonthly = document.getElementById('select-qdcb-monthly')?.value === 'true';
        args = {
          tu_khoa: kw || undefined,
          so_quyet_dinh: so || undefined,
          co_quan_ban_hanh: cq || undefined,
          linh_vuc: lv || undefined,
          nam: namVal ? parseInt(namVal, 10) : undefined,
          thang: thangVal || undefined,
          moi_trong_thang: isMonthly,
          limit,
          page,
          dinh_dang: 'markdown'
        };
      } else if (toolName === 'chi_tiet_quyet_dinh_cong_bo' || toolName === 'chi_tiet_qdcb' || toolName === 'lay_qdcb_theo_so') {
        const id = document.getElementById('input-qdcb-detail-id')?.value.trim();
        const format = document.getElementById('select-qdcb-detail-format')?.value || 'markdown';
        args = {
          so_hoac_id_qdcb: id,
          dinh_dang: format
        };
      } else if (toolName === 'tra_cuu_tthc_gia_lai' || toolName === 'tthc_gia_lai') {
        const kw = document.getElementById('input-gialai-keyword')?.value.trim();
        const code = document.getElementById('input-gialai-code')?.value.trim();
        const cap = document.getElementById('select-gialai-cap')?.value;
        const coQuan = document.getElementById('input-gialai-co-quan')?.value.trim();
        const isDetail = document.getElementById('select-gialai-detail')?.value === 'true';
        args = {
          tu_khoa: kw || undefined,
          ma_tthc: code || undefined,
          cap_thuc_hien: cap || 'tat_ca',
          co_quan_thuc_hien: coQuan || undefined,
          chi_tiet: isDetail,
          limit,
          page,
          dinh_dang: 'markdown'
        };
      } else if (toolName === 'tra_cuu_tthc_noi_bo_gia_lai' || toolName === 'tthc_noi_bo_gia_lai' || toolName === 'tthc_gia_lai_noi_bo') {
        const kw = document.getElementById('input-noibo-gl-keyword')?.value.trim();
        const code = document.getElementById('input-noibo-gl-code')?.value.trim();
        const cap = document.getElementById('select-noibo-gl-cap')?.value;
        const coQuan = document.getElementById('input-noibo-gl-co-quan')?.value.trim();
        const nhom = document.getElementById('select-noibo-gl-nhom')?.value;
        const linhVuc = document.getElementById('input-noibo-gl-linh-vuc')?.value.trim();
        const isDetail = document.getElementById('select-noibo-gl-detail')?.value === 'true';
        args = {
          tu_khoa: kw || undefined,
          ma_tthc: code || undefined,
          cap_thuc_hien: cap || 'tat_ca',
          co_quan: coQuan || undefined,
          nhom_noi_bo: nhom || 'tat_ca',
          linh_vuc: linhVuc || undefined,
          chi_tiet: isDetail,
          limit,
          page,
          dinh_dang: 'markdown'
        };
      } else if (toolName === 'tra_cuu_tthc_noi_bo' || toolName === 'tthc_noi_bo') {
        const kw = document.getElementById('input-noibo-keyword')?.value.trim();
        const code = document.getElementById('input-noibo-code')?.value.trim();
        const cap = document.getElementById('select-noibo-cap')?.value;
        const coQuan = document.getElementById('input-noibo-co-quan')?.value.trim();
        const nhom = document.getElementById('select-noibo-nhom')?.value;
        const linhVuc = document.getElementById('input-noibo-linh-vuc')?.value.trim();
        const isDetail = document.getElementById('select-noibo-detail')?.value === 'true';
        args = {
          tu_khoa: kw || undefined,
          ma_tthc: code || undefined,
          cap_thuc_hien: cap || 'tat_ca',
          co_quan: coQuan || undefined,
          nhom_noi_bo: nhom || 'tat_ca',
          linh_vuc: linhVuc || undefined,
          chi_tiet: isDetail,
          limit,
          page,
          dinh_dang: 'markdown'
        };
      } else if (toolName === 'tra_cuu_theo_ma_tthc' || toolName === 'chi_tiet_tthc') {
        const phanMuc = document.getElementById('select-detail-phan-muc')?.value || 'tat_ca';
        const dinhDang = document.getElementById('select-detail-format')?.value || 'markdown';
        args = {
          ma_tthc: document.getElementById('input-ma-tthc').value.trim(),
          phan_muc: phanMuc,
          dinh_dang: dinhDang
        };
      } else if (toolName === 'goi_y_thu_tuc_lien_quan' || toolName === 'related_procedures') {
        const relTthc = document.getElementById('input-related-tthc')?.value.trim();
        const relTheme = document.getElementById('input-related-theme')?.value.trim();
        const relLimit = parseInt(document.getElementById('select-related-limit')?.value || '6', 10);
        const relFormat = document.getElementById('select-related-format')?.value || 'markdown';
        args = {
          ma_hoac_ten_tthc: relTthc || undefined,
          chu_de: relTheme || undefined,
          limit: relLimit,
          dinh_dang: relFormat
        };
      } else if (toolName === 'tim_kiem_theo_ten_tthc') {
        args = {
          ten_tthc: document.getElementById('input-ten-tthc').value.trim(),
          limit,
          page
        };
      } else if (toolName === 'loc_theo_cap_thuc_hien') {
        const cap = document.getElementById('select-cap-thuc-hien').value;
        const kw = document.getElementById('input-cap-keyword').value.trim();
        args = { cap_thuc_hien: cap, tu_khoa: kw || undefined, limit, page };
      } else if (toolName === 'loc_theo_linh_vuc') {
        const lv = document.getElementById('select-linh-vuc').value;
        const kw = document.getElementById('input-linh-vuc-keyword').value.trim();
        args = { linh_vuc: lv, tu_khoa: kw || undefined, limit, page };
      } else if (toolName === 'tim_kiem_tong_hop') {
        const kw = document.getElementById('adv-keyword').value.trim();
        const cap = document.getElementById('adv-cap').value.trim();
        const lv = document.getElementById('adv-linh-vuc').value.trim();
        const cq = document.getElementById('adv-co-quan').value.trim();
        const phi = document.getElementById('adv-phi').value;
        args = {
          tu_khoa: kw || undefined,
          cap_thuc_hien: cap || undefined,
          linh_vuc: lv || undefined,
          co_quan: cq || undefined,
          co_thu_phi: phi === '' ? undefined : phi === 'true',
          limit,
          page
        };
      } else if (toolName === 'thong_tin_mcp_server') {
        args = {};
      }
    }

    // Kiểm tra nếu server yêu cầu API Key mà người dùng chưa nhập
    if (serverAuthRequired && !apiKey) {
      renderError('Yêu cầu bảo mật: Máy chủ đã bật xác thực API Key. Vui lòng nhập API Key của bạn vào ô "Khóa API Key" ở phía trên để thực thi lệnh.');
      return;
    }

    // Set UI loading state
    btnExecuteTool.disabled = true;
    executeSpinner.style.display = 'inline-block';
    btnExecuteText.textContent = 'Đang thực thi...';
    executionTimeBadge.style.display = 'none';

    const startTime = performance.now();

    // Construct MCP JSON-RPC Payload
    const jsonRpcPayload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    const targetUrl = apiKey
      ? `${currentOrigin}/mcp?api-key=${encodeURIComponent(apiKey)}`
      : `${currentOrigin}/mcp`;

    try {
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonRpcPayload)
      });

      const elapsed = Math.round(performance.now() - startTime);
      executionTimeBadge.textContent = `${elapsed}ms`;
      executionTimeBadge.style.display = 'inline-block';
      updateLatencyDisplay(elapsed);

      if (!response.ok) {
        if (response.status === 401) {
          const errData = await response.json();
          renderError(`401 Unauthorized: ${errData.message || 'Sai API Key'}`);
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      currentRawResult = result;

      // Extract markdown text from MCP standard response
      if (result.result && result.result.content && result.result.content[0]) {
        currentMarkdownResult = stripInternalIds(result.result.content[0].text || '');
      } else if (result.error) {
        currentMarkdownResult = `Lỗi MCP: ${result.error.message || JSON.stringify(result.error)}`;
      } else {
        currentMarkdownResult = JSON.stringify(result, null, 2);
      }

      // Update Viewports
      viewportMarkdown.querySelector('code').textContent = currentMarkdownResult;
      viewportJson.querySelector('code').textContent = JSON.stringify(result, null, 2);

      // Render Rich View
      renderRichView(toolName, currentMarkdownResult);
    } catch (err) {
      renderError(err.message);
    } finally {
      btnExecuteTool.disabled = false;
      executeSpinner.style.display = 'none';
      btnExecuteText.innerHTML = '<i class="bi bi-play-circle-fill"></i> Gọi MCP Tool Call';
    }
  }

  function renderError(message) {
    viewportRendered.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" style="color: #f43f5e;"><i class="bi bi-exclamation-triangle-fill"></i></div>
        <h3 style="color: #f43f5e;">Lỗi Thực Thi</h3>
        <p>${escapeHtml(message)}</p>
        <p style="margin-top: 10px; font-size: 0.8rem; color: var(--text-dim);">
          Kiểm tra lại xem API Key trên URL đã trùng khớp với biến môi trường <code>API_KEY</code> chưa.
        </p>
      </div>
    `;
    viewportMarkdown.querySelector('code').textContent = message;
    viewportJson.querySelector('code').textContent = JSON.stringify({ error: message }, null, 2);
  }

  function stripInternalIds(text) {
    if (!text || typeof text !== 'string') return text;
    return text
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return (
          !trimmed.startsWith('- **ID Hệ thống**:') &&
          !trimmed.startsWith('- **ID hệ thống**:') &&
          !trimmed.includes('ID Hệ thống:')
        );
      })
      .map(line => line.replace(/\s*\|\s*\*\*ID\*\*:\s*`[^`]+`/g, ''))
      .join('\n');
  }

  function renderRichView(toolName, markdownText) {
    if (toolName === 'chi_tiet_tthc' || toolName === 'tra_cuu_theo_ma_tthc' || toolName === 'thong_tin_mcp_server') {
      renderProcedureDetail(markdownText);
    } else if (
      toolName === 'chi_tiet_quyet_dinh_cong_bo' ||
      toolName === 'chi_tiet_qdcb' ||
      toolName === 'lay_qdcb_theo_so'
    ) {
      renderProcedureDetail(markdownText);
      // Nếu là chi tiết QĐCB, trích xuất ID/Số QĐ và thêm nút mở Modal chuẩn DVCQG
      const matchQd = markdownText.match(/\*\*ID QĐCB\*\*:\s*`([^`]+)`/) || markdownText.match(/\*\*Số Quyết định\*\*:\s*`([^`]+)`/);
      if (matchQd && matchQd[1]) {
        const qdId = matchQd[1];
        const banner = document.createElement('div');
        banner.className = 'detail-dvc-banner';
        banner.style.cssText = 'justify-content: space-between; margin-bottom: 14px; background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.35);';
        banner.innerHTML = `
          <div style="display:flex; align-items:center; gap:10px;">
            <i class="bi bi-layout-text-window-reverse" style="color:#fbbf24;"></i>
            <span>Xem giao diện bảng QĐCB chuẩn Cổng Dịch vụ công Quốc gia</span>
          </div>
          <button type="button" class="btn btn-primary btn-xs btn-view-qdcb-detail" data-qdcb-id="${escapeHtml(qdId)}">
            <i class="bi bi-window-fullscreen"></i> Mở Modal QĐCB
          </button>
        `;
        viewportRendered.prepend(banner);
        banner.querySelector('.btn-view-qdcb-detail')?.addEventListener('click', () => openQDCBModal(qdId));
      }
    } else {
      renderProcedureList(markdownText);
    }
  }

  function renderProcedureList(markdownText) {
    const lines = markdownText.split('\n');
    let html = '';

    let inItem = false;
    let currentItem = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('## ')) {
        html += `<h3 class="section-title" style="margin-bottom: 8px;"><i class="bi bi-card-checklist"></i> ${escapeHtml(line.slice(3))}</h3>`;
      } else if (line.startsWith('> ')) {
        html += `<p class="section-desc" style="margin-bottom: 16px;">${escapeHtml(line.slice(2))}</p>`;
      } else if (line.startsWith('### ')) {
        if (inItem) {
          html += buildItemCard(currentItem);
          currentItem = {};
        }
        inItem = true;
        currentItem.title = line.slice(4);
        if (currentItem.title.includes('Quyết định số')) {
          currentItem.isQdcb = true;
          const mSo = currentItem.title.match(/`([^`]+)`/);
          if (mSo) currentItem.code = mSo[1];
        }
      } else if (line.startsWith('- **Mã TTHC**:')) {
        const matchCode = line.match(/`([^`]+)`/);
        if (matchCode) currentItem.code = matchCode[1];
      } else if (line.startsWith('- **ID QĐCB**:')) {
        currentItem.isQdcb = true;
        const matchId = line.match(/`([^`]+)`/);
        if (matchId) currentItem.qdcbId = matchId[1];
      } else if (line.startsWith('- **Cấp thực hiện**:') || line.startsWith('- **Ngày ban hành**:')) {
        currentItem.meta1 = line;
      } else if (line.startsWith('- **Cơ quan thực hiện**:') || line.startsWith('- **Trích yếu**:') || line.startsWith('- **Lĩnh vực**:')) {
        if (!currentItem.meta2) currentItem.meta2 = line;
        else currentItem.meta2 += ' | ' + line.replace(/^- /, '');
      } else if (line.startsWith('- **Link DVC') || line.startsWith('- **Link gốc DVCQG**:')) {
        const matchLink = line.match(/\((https?:\/\/[^)]+)\)/);
        if (matchLink) currentItem.targetLink = matchLink[1];
      }
    }

    if (inItem) {
      html += buildItemCard(currentItem);
    }

    if (!html) {
      html = `<pre class="viewport-code"><code>${escapeHtml(markdownText)}</code></pre>`;
    }

    viewportRendered.innerHTML = html;

    // Attach click events to "Xem chi tiết" buttons
    viewportRendered.querySelectorAll('.btn-view-detail').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.code;
        openDetailModal(code);
      });
    });

    // Attach click events to "Xem chi tiết QĐCB" buttons
    viewportRendered.querySelectorAll('.btn-view-qdcb-detail').forEach(btn => {
      btn.addEventListener('click', () => {
        const qdcbId = btn.dataset.qdcbId;
        openQDCBModal(qdcbId);
      });
    });
  }

  function buildItemCard(item) {
    const targetLink = item.targetLink || (item.id
      ? `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${encodeURIComponent(item.id)}`
      : '');

    if (item.isQdcb) {
      const qdKey = item.qdcbId || item.code || '';
      return `
        <div class="rendered-item-card" style="border-left: 3px solid #f59e0b;">
          <div class="rendered-item-header">
            <h4 class="rendered-item-title">${escapeHtml(item.title || 'Quyết định công bố')}</h4>
            ${item.code ? `<span class="meta-pill meta-pill-qdcb" style="font-size:0.75rem; padding:2px 8px;">${escapeHtml(item.code)}</span>` : ''}
          </div>
          <div class="rendered-item-meta">
            ${item.meta1 ? `<div>${item.meta1.replace(/- \*\*/g, '<span><strong>').replace(/\*\*/g, '</strong></span>')}</div>` : ''}
            ${item.meta2 ? `<div>${item.meta2.replace(/- \*\*/g, '<span><strong>').replace(/\*\*/g, '</strong></span>')}</div>` : ''}
          </div>
          <div class="rendered-item-actions">
            ${targetLink ? `
            <a href="${targetLink}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-xs" title="Xem văn bản trên Cổng Dịch vụ công Quốc gia">
              <i class="bi bi-box-arrow-up-right"></i> Xem trên DVCQG
            </a>
            ` : ''}
            <button class="btn btn-primary btn-xs btn-view-qdcb-detail" data-qdcb-id="${escapeHtml(qdKey)}">
              <i class="bi bi-eye"></i> Chi tiết QĐCB
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="rendered-item-card">
        <div class="rendered-item-header">
          <h4 class="rendered-item-title">${escapeHtml(item.title || 'Thủ tục hành chính')}</h4>
          ${item.code ? `<span class="badge badge-primary">${escapeHtml(item.code)}</span>` : ''}
        </div>
        <div class="rendered-item-meta">
          ${item.meta1 ? `<div>${item.meta1.replace(/- \*\*/g, '<span><strong>').replace(/\*\*/g, '</strong></span>')}</div>` : ''}
          ${item.meta2 ? `<div>${item.meta2.replace(/- \*\*/g, '<span><strong>').replace(/\*\*/g, '</strong></span>')}</div>` : ''}
        </div>
        <div class="rendered-item-actions">
          ${targetLink ? `
          <a href="${targetLink}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-xs" title="Mở trang nộp hồ sơ trên Cổng Dịch vụ công Quốc gia">
            <i class="bi bi-send-fill"></i> Nộp hồ sơ
          </a>
          ` : ''}
          <button class="btn btn-primary btn-xs btn-view-detail" data-code="${escapeHtml(item.code || '')}">
            <i class="bi bi-eye"></i> Xem chi tiết
          </button>
        </div>
      </div>
    `;
  }

  function formatDetailHtml(markdownText) {
    const rawLines = markdownText.split('\n');
    let titleText = '';
    let firstSectionIdx = -1;

    // Tìm dòng section đầu tiên (## hoặc ###) và tiêu đề chính
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (!titleText && line.startsWith('# ')) {
        titleText = line.slice(2).trim();
      } else if (line.startsWith('## ') || line.startsWith('### ')) {
        firstSectionIdx = i;
        break;
      }
    }

    const metaMap = {};
    const otherMetaLines = [];
    const metaEndIdx = firstSectionIdx === -1 ? rawLines.length : firstSectionIdx;

    // Bóc tách metadata từ các dòng trước section đầu tiên
    for (let i = 0; i < metaEndIdx; i++) {
      const line = rawLines[i].trim();
      if (!line || line.startsWith('# ')) continue;

      if (line.startsWith('- ')) {
        const content = line.slice(2).trim();
        // Bỏ qua ID nội bộ
        if (
          content.includes('ID Hệ thống') ||
          content.includes('ID hệ thống') ||
          content.startsWith('**ID Hệ thống**') ||
          content.startsWith('**ID**:') ||
          content.startsWith('**ID**')
        ) {
          continue;
        }

        const match = content.match(/^\*\*([^*:]+)\*\*:\s*(.*)$/);
        if (match) {
          const key = match[1].trim();
          const val = match[2].trim();
          metaMap[key] = val;
        } else {
          otherMetaLines.push(content);
        }
      }
    }

    // Trích xuất các trường dữ liệu chính từ metaMap
    const code = metaMap['Mã TTHC'] || metaMap['Mã thủ tục'] || '';
    const cap = metaMap['Cấp thực hiện'] || '';
    const linhVuc = metaMap['Lĩnh vực'] || '';
    const loai = metaMap['Loại thủ tục'] || 'TTHC Tiêu chuẩn';
    const coQuanThucHien = metaMap['Cơ quan thực hiện'] || '';
    const coQuanBanHanh = metaMap['Cơ quan ban hành'] || '';
    const doiTuong = metaMap['Đối tượng thực hiện'] || 'Công dân, Tổ chức';
    const mucPhi = metaMap['Mức phí'] || metaMap['Phí, lệ phí'] || '';
    const thoiHan = metaMap['Thời hạn giải quyết'] || '';
    const soQd = metaMap['Số Quyết định'] || '';
    const ngayCongKhai = metaMap['Ngày công khai'] || '';
    const ngayCapNhat = metaMap['Ngày cập nhật'] || '';
    const ngayDieuChinh = metaMap['Ngày điều chỉnh'] || '';
    const mucDo = metaMap['Mức độ DVCTT'] || metaMap['Mức độ'] || '';
    const congTiepNhan = metaMap['Cổng tiếp nhận hồ sơ'] || '';
    const linkGoc = metaMap['Link TTHC gốc'] || metaMap['Link DVC'] || '';

    // Khởi tạo HTML
    let html = '<div class="detail-view">';

    // 1. Tiêu đề TTHC
    if (titleText) {
      html += `
        <div class="detail-header-block">
          <h2 class="detail-title"><i class="bi bi-file-earmark-text-fill text-primary"></i> ${escapeHtml(titleText)}</h2>
        </div>
      `;
    }

    // 2. Hero Summary Card (Thu gọn toàn bộ metadata dài dòng)
    html += '<div class="meta-summary-card">';
    
    // Badges Bar: Mã TTHC, Số QĐCB, Cấp, Lĩnh vực, Mức độ DVCTT, Phí, Loại
    html += '<div class="meta-badges-bar">';
    if (code) {
      html += `<span class="meta-pill meta-pill-code"><i class="bi bi-tag-fill"></i> ${escapeHtml(code)}</span>`;
    }
    if (soQd && soQd !== 'Chưa cập nhật') {
      const soQdClean = soQd.split('(')[0].split('—')[0].replace(/`/g, '').trim();
      if (soQdClean) {
        html += `<button type="button" class="meta-pill meta-pill-qdcb btn-open-qdcb-modal" data-qdcb-id="${escapeHtml(soQdClean)}" style="cursor:pointer;" title="Bấm để xem chi tiết Quyết định công bố ${escapeHtml(soQdClean)}"><i class="bi bi-file-earmark-check-fill"></i> QĐCB: ${escapeHtml(soQdClean)}</button>`;
      }
    }
    if (cap) {
      html += `<span class="meta-pill meta-pill-cap"><i class="bi bi-building"></i> ${escapeHtml(cap)}</span>`;
    }
    if (linhVuc) {
      html += `<span class="meta-pill meta-pill-field"><i class="bi bi-folder-fill"></i> ${escapeHtml(linhVuc)}</span>`;
    }

    // Pill Mức độ DVCTT
    if (mucDo) {
      if (mucDo.includes('Toàn trình')) {
        html += '<span class="meta-pill meta-pill-dvctt-toan-trinh"><i class="bi bi-check-circle-fill"></i> Toàn trình</span>';
      } else if (mucDo.includes('Một phần')) {
        html += '<span class="meta-pill meta-pill-dvctt-mot-phan"><i class="bi bi-lightning-charge-fill"></i> Một phần</span>';
      } else if (mucDo.includes('Chưa cung cấp') || mucDo.includes('Chưa có')) {
        html += '<span class="meta-pill meta-pill-dvctt-chua"><i class="bi bi-dash-circle"></i> Chưa có DVCTT</span>';
      } else {
        html += `<span class="meta-pill meta-pill-dvctt-chua"><i class="bi bi-globe2"></i> ${escapeHtml(mucDo)}</span>`;
      }
    }

    // Pill Mức phí tóm tắt
    if (mucPhi) {
      if (mucPhi.toLowerCase().includes('miễn phí') || mucPhi.includes('0 đồng') || mucPhi.includes('Không thu')) {
        html += '<span class="meta-pill meta-pill-fee" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border-color: rgba(16, 185, 129, 0.35);"><i class="bi bi-cash-stack"></i> Miễn phí</span>';
      } else if (mucPhi.toLowerCase().includes('có thu phí') || mucPhi.toLowerCase().includes('thu phí') || mucPhi.includes('VNĐ') || mucPhi.includes('đồng')) {
        html += '<span class="meta-pill meta-pill-fee"><i class="bi bi-cash-coin"></i> Có thu phí</span>';
      }
    }

    if (loai) {
      html += `<span class="meta-pill meta-pill-type"><i class="bi bi-card-checklist"></i> ${escapeHtml(loai)}</span>`;
    }
    html += '</div>'; // End meta-badges-bar

    // Grid 4 ô thông tin cốt lõi
    html += '<div class="meta-summary-grid">';
    
    if (coQuanThucHien) {
      html += `
        <div class="meta-grid-item">
          <i class="bi bi-bank meta-item-icon"></i>
          <div class="meta-item-content">
            <span class="meta-item-label">Cơ quan thực hiện</span>
            <span class="meta-item-val">${escapeHtml(coQuanThucHien)}</span>
          </div>
        </div>
      `;
    }

    if (coQuanBanHanh) {
      html += `
        <div class="meta-grid-item">
          <i class="bi bi-briefcase-fill meta-item-icon" style="color: #60a5fa;"></i>
          <div class="meta-item-content">
            <span class="meta-item-label">Cơ quan ban hành</span>
            <span class="meta-item-val">${escapeHtml(coQuanBanHanh)}</span>
          </div>
        </div>
      `;
    }

    if (doiTuong) {
      html += `
        <div class="meta-grid-item">
          <i class="bi bi-people-fill meta-item-icon" style="color: #c084fc;"></i>
          <div class="meta-item-content">
            <span class="meta-item-label">Đối tượng thực hiện</span>
            <span class="meta-item-val">${escapeHtml(doiTuong)}</span>
          </div>
        </div>
      `;
    }

    if (thoiHan) {
      html += `
        <div class="meta-grid-item">
          <i class="bi bi-clock-history meta-item-icon" style="color: #fbbf24;"></i>
          <div class="meta-item-content">
            <span class="meta-item-label">Thời hạn giải quyết</span>
            <span class="meta-item-val">${escapeHtml(thoiHan)}</span>
          </div>
        </div>
      `;
    } else if (mucPhi) {
      const shortFee = mucPhi.length > 50 ? mucPhi.slice(0, 48) + '...' : mucPhi;
      html += `
        <div class="meta-grid-item">
          <i class="bi bi-cash-stack meta-item-icon" style="color: #34d399;"></i>
          <div class="meta-item-content">
            <span class="meta-item-label">Mức phí sơ bộ</span>
            <span class="meta-item-val">${escapeHtml(shortFee)}</span>
          </div>
        </div>
      `;
    }

    html += '</div>'; // End meta-summary-grid

    // Collapsible Details (Thu gọn các dòng Quyết định, Mốc thời gian, Chi tiết phí)
    const hasTimeline = soQd || ngayCongKhai || ngayCapNhat || ngayDieuChinh;
    if (hasTimeline || (mucPhi && mucPhi.length > 30)) {
      html += `
        <details class="meta-collapse-details">
          <summary class="meta-collapse-summary">
            <i class="bi bi-info-circle-fill text-primary"></i>
            <span>Xem thêm số quyết định, mốc thời gian & chi tiết mức phí</span>
            <i class="bi bi-chevron-down collapse-icon"></i>
          </summary>
          <div class="meta-collapse-content">
            ${soQd ? `<div class="mb-2"><strong>Số Quyết định:</strong> ${escapeHtml(soQd)}</div>` : ''}
            
            ${(ngayCongKhai || ngayCapNhat || ngayDieuChinh) ? `
              <div class="meta-dates-wrap">
                ${ngayCongKhai ? `<div class="meta-date-col"><div class="meta-date-label">Ngày công khai</div><div class="meta-date-val">${escapeHtml(ngayCongKhai)}</div></div>` : ''}
                ${ngayCapNhat ? `<div class="meta-date-col"><div class="meta-date-label">Ngày cập nhật</div><div class="meta-date-val">${escapeHtml(ngayCapNhat)}</div></div>` : ''}
                ${ngayDieuChinh ? `<div class="meta-date-col"><div class="meta-date-label">Ngày điều chỉnh</div><div class="meta-date-val">${escapeHtml(ngayDieuChinh)}</div></div>` : ''}
              </div>
            ` : ''}

            ${mucPhi ? `<div class="mt-2 pt-2" style="border-top: 1px solid rgba(255,255,255,0.06);"><strong>Chi tiết mức phí:</strong> ${escapeHtml(mucPhi)}</div>` : ''}
          </div>
        </details>
      `;
    }

    // Hiển thị banner link trực tuyến nếu có
    if (congTiepNhan) {
      const formattedLink = congTiepNhan.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="dvc-direct-link"><i class="bi bi-box-arrow-up-right"></i> $1</a>');
      html += `
        <div class="detail-dvc-banner" style="background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.35); margin: 12px 0 0 0;">
          <i class="bi bi-send-fill" style="color: #10b981;"></i>
          <div class="dvc-banner-content">
            <div><strong>Cổng tiếp nhận trực tuyến:</strong> ${formattedLink}</div>
          </div>
        </div>
      `;
    }

    html += '</div>'; // End meta-summary-card

    // Nếu không có phần sections thì kết thúc luôn
    if (firstSectionIdx === -1) {
      html += '</div>';
      return html;
    }

    // 3. Quét trước các section để tạo thanh Quick Navigation Chips
    const sections = [];
    let currentSec = null;

    for (let i = firstSectionIdx; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (line.startsWith('## ') || line.startsWith('### ')) {
        const isH2 = line.startsWith('## ');
        const rawTitle = isH2 ? line.slice(3).trim() : line.slice(4).trim();
        const secId = `detail-sec-${sections.length}`;

        let icon = 'bi-info-circle-fill';
        let shortName = rawTitle;

        if (rawTitle.includes('Cách thức')) {
          icon = 'bi-send-fill';
          shortName = 'Cách thức';
        } else if (rawTitle.includes('Trình tự')) {
          icon = 'bi-diagram-3-fill';
          shortName = 'Trình tự';
        } else if (rawTitle.includes('Hồ sơ') || rawTitle.includes('hồ sơ')) {
          icon = 'bi-folder2-open';
          shortName = 'Hồ sơ';
        } else if (rawTitle.includes('Thời hạn')) {
          icon = 'bi-clock-history';
          shortName = 'Thời hạn';
        } else if (rawTitle.includes('Phí') || rawTitle.includes('phí')) {
          icon = 'bi-cash-stack';
          shortName = 'Phí, lệ phí';
        } else if (rawTitle.includes('Căn cứ') || rawTitle.includes('pháp lý')) {
          icon = 'bi-journal-bookmark-fill';
          shortName = 'Căn cứ pháp lý';
        } else if (rawTitle.includes('Yêu cầu') || rawTitle.includes('điều kiện')) {
          icon = 'bi-shield-check';
          shortName = 'Yêu cầu, ĐK';
        } else if (rawTitle.includes('Kết quả')) {
          icon = 'bi-award-fill';
          shortName = 'Kết quả';
        } else if (rawTitle.includes('HTGQ') || rawTitle.includes('HỆ THỐNG')) {
          icon = 'bi-shield-shaded';
          shortName = 'HTGQ Trực tuyến';
        }

        currentSec = {
          id: secId,
          title: rawTitle,
          shortName,
          icon,
          isH2,
          stepCount: 0,
          docCount: 0
        };
        sections.push(currentSec);
      } else if (currentSec) {
        if (line.startsWith('**Bước ')) {
          currentSec.stepCount++;
        } else if (line.startsWith('- ') && currentSec.title.toLowerCase().includes('hồ sơ')) {
          currentSec.docCount++;
        }
      }
    }

    // Render Quick Nav Chips
    if (sections.length > 1) {
      html += '<div class="detail-quick-nav">';
      sections.forEach(sec => {
        let countText = '';
        if (sec.stepCount > 0) countText = ` (${sec.stepCount} bước)`;
        else if (sec.docCount > 0) countText = ` (${sec.docCount} mục)`;

        html += `
          <button type="button" class="quick-nav-chip" data-target="${sec.id}">
            <i class="bi ${sec.icon}"></i> ${escapeHtml(sec.shortName)}${countText}
          </button>
        `;
      });
      html += '</div>';
    }

    // 4. Render nội dung từng Section Card (Collapsible)
    let inCard = false;
    let secCounter = 0;

    for (let i = firstSectionIdx; i < rawLines.length; i++) {
      const line = rawLines[i].trim();

      if (line.startsWith('## ') || line.startsWith('### ')) {
        if (inCard) {
          html += '</div></div>';
          inCard = false;
        }

        const secMeta = sections[secCounter] || { id: `detail-sec-${secCounter}` };
        secCounter++;

        const isH2 = line.startsWith('## ');
        const sectionTitle = isH2 ? line.slice(3).trim() : line.slice(4).trim();
        let cardClass = 'section-card collapsible';
        let sectionIcon = 'bi-info-circle-fill';
        let accentBorder = '';
        let accentBg = '';

        if (sectionTitle.includes('Cách thức')) {
          cardClass += ' section-card-method';
          sectionIcon = 'bi-send-fill';
        } else if (sectionTitle.includes('Thời hạn')) {
          cardClass += ' section-card-time';
          sectionIcon = 'bi-clock-history';
        } else if (sectionTitle.includes('Trình tự')) {
          cardClass += ' section-card-steps';
          sectionIcon = 'bi-diagram-3-fill';
        } else if (sectionTitle.includes('Hồ sơ') || sectionTitle.includes('hồ sơ')) {
          cardClass += ' section-card-docs';
          sectionIcon = 'bi-folder2-open';
        } else if (sectionTitle.includes('Phí') || sectionTitle.includes('phí')) {
          cardClass += ' section-card-fee';
          sectionIcon = 'bi-cash-stack';
        } else if (sectionTitle.includes('Căn cứ')) {
          cardClass += ' section-card-basis';
          sectionIcon = 'bi-journal-bookmark-fill';
        } else if (sectionTitle.includes('Yêu cầu') || sectionTitle.includes('điều kiện')) {
          cardClass += ' section-card-basis';
          sectionIcon = 'bi-shield-check';
        } else if (sectionTitle.includes('Kết quả')) {
          cardClass += ' section-card-result';
          sectionIcon = 'bi-award-fill';
        } else if (sectionTitle.includes('HTGQ') || sectionTitle.includes('HỆ THỐNG')) {
          accentBorder = '#10b981';
          accentBg = 'rgba(16, 185, 129, 0.06)';
          sectionIcon = 'bi-shield-shaded';
        }

        let countBadgeHtml = '';
        if (secMeta.stepCount > 0) {
          countBadgeHtml = `<span class="section-card-count-badge">${secMeta.stepCount} bước</span>`;
        } else if (secMeta.docCount > 0) {
          countBadgeHtml = `<span class="section-card-count-badge">${secMeta.docCount} tài liệu</span>`;
        }

        const customStyle = accentBorder ? `style="border-left: 4px solid ${accentBorder}; background: ${accentBg};"` : '';
        const titleStyle = accentBorder ? `style="color: ${accentBorder};"` : '';

        html += `
          <div class="${cardClass}" id="${secMeta.id}" ${customStyle}>
            <div class="section-card-header-toggle">
              <h3 class="detail-section-title" ${titleStyle}>
                <i class="bi ${sectionIcon}"></i>
                <span>${escapeHtml(sectionTitle)}</span>
                ${countBadgeHtml}
              </h3>
              <i class="bi bi-chevron-down toggle-chevron"></i>
            </div>
            <div class="section-card-content">
        `;
        inCard = true;
      } else if (line.startsWith('**Bước ')) {
        const nextLine = rawLines[i + 1]?.trim() || '';
        html += `
          <div class="step-item">
            <div class="step-name">${escapeHtml(line.replace(/\*\*/g, ''))}</div>
            ${nextLine && !nextLine.startsWith('**Bước ') && !nextLine.startsWith('### ') && !nextLine.startsWith('## ') ? `<div class="step-desc">${escapeHtml(nextLine)}</div>` : ''}
          </div>
        `;
        if (nextLine && !nextLine.startsWith('**Bước ') && !nextLine.startsWith('### ') && !nextLine.startsWith('## ')) i++;
      } else if (line.startsWith('#### ')) {
        html += `<h4 class="detail-subsection-title">${escapeHtml(line.slice(5))}</h4>`;
      } else if (line.startsWith('**') && line.endsWith('**')) {
        html += `<h5 class="detail-group-label">${escapeHtml(line.replace(/\*\*/g, ''))}</h5>`;
      } else if (line.startsWith('- ')) {
        const content = line.slice(2);
        if (
          content.includes('ID Hệ thống') ||
          content.includes('ID hệ thống') ||
          content.startsWith('**ID Hệ thống**') ||
          content.startsWith('**ID**:') ||
          content.startsWith('**ID**')
        ) {
          continue;
        }

        const formatted = content
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="dvc-direct-link"><i class="bi bi-box-arrow-up-right"></i> $1</a>');

        if (content.includes('Mức độ DVCTT') || content.includes('Mức độ:')) {
          let badgeColor = '#38bdf8';
          let badgeBg = 'rgba(56, 189, 248, 0.12)';
          let badgeBorder = 'rgba(56, 189, 248, 0.3)';
          let icon = 'bi-globe2';

          if (content.includes('Toàn trình')) {
            badgeColor = '#10b981';
            badgeBg = 'rgba(16, 185, 129, 0.12)';
            badgeBorder = 'rgba(16, 185, 129, 0.35)';
            icon = 'bi-check-circle-fill';
          } else if (content.includes('Một phần')) {
            badgeColor = '#f59e0b';
            badgeBg = 'rgba(245, 158, 11, 0.12)';
            badgeBorder = 'rgba(245, 158, 11, 0.35)';
            icon = 'bi-lightning-charge-fill';
          } else if (content.includes('Chưa cung cấp')) {
            badgeColor = '#94a3b8';
            badgeBg = 'rgba(148, 163, 184, 0.12)';
            badgeBorder = 'rgba(148, 163, 184, 0.25)';
            icon = 'bi-building';
          }

          html += `
            <div class="detail-muc-do-banner" style="background: ${badgeBg}; border: 1px solid ${badgeBorder}; color: ${badgeColor}; padding: 10px 14px; border-radius: 8px; margin: 8px 0 12px 0; display: flex; align-items: center; gap: 10px; font-size: 0.9rem;">
              <i class="bi ${icon}" style="font-size: 1.25rem; flex-shrink: 0;"></i>
              <div class="muc-do-content" style="flex: 1; color: var(--text-main);">
                ${formatted}
              </div>
            </div>
          `;
          continue;
        }

        if (content.includes('Cổng tiếp nhận hồ sơ')) {
          html += `
            <div class="detail-dvc-banner" style="background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.35); margin: 8px 0 12px 0;">
              <i class="bi bi-box-arrow-up-right" style="color: #10b981;"></i>
              <div class="dvc-banner-content">
                <div>${formatted}</div>
              </div>
            </div>
          `;
          continue;
        }

        if (content.includes('Cổng DVC Quốc gia') || content.includes('Link TTHC gốc') || content.includes('Link DVC')) {
          html += `
            <div class="detail-dvc-banner">
              <i class="bi bi-globe2"></i>
              <div class="dvc-banner-content">
                <div>${formatted}</div>
              </div>
            </div>
          `;
        } else {
          html += `<div class="detail-list-item"><span class="list-bullet">•</span><div class="list-text">${formatted}</div></div>`;
        }
      } else if (line.startsWith('*') && line.endsWith('*')) {
        html += `<p class="detail-note"><em>${escapeHtml(line.slice(1, -1))}</em></p>`;
      } else if (line) {
        html += `<p class="detail-paragraph">${escapeHtml(line)}</p>`;
      }
    }

    if (inCard) {
      html += '</div></div>';
    }

    html += '</div>';
    return html;
  }

  function renderProcedureDetail(markdownText) {
    viewportRendered.innerHTML = formatDetailHtml(markdownText);
  }

  // Tương tác Collapsible Sections & Quick Nav Chips
  document.addEventListener('click', (e) => {
    // 0a. Quay lại lịch sử điều hướng trong Modal
    const backBtn = e.target.closest('.modal-back-btn');
    if (backBtn) {
      const prev = modalNavHistory.pop();
      if (prev) {
        if (prev.type === 'qdcb') openQDCBModal(prev.id, true);
        else if (prev.type === 'tthc') openDetailModal(prev.id, true);
      }
      return;
    }

    // 0b. Mở Modal Chi tiết QĐCB khi click vào label QĐCB
    const qdcbBtn = e.target.closest('.btn-open-qdcb-modal');
    if (qdcbBtn) {
      const qdId = qdcbBtn.dataset.qdcbId;
      if (qdId) openQDCBModal(qdId);
      return;
    }

    // 1. Toggle đóng/mở thẻ section card khi click header
    const toggleHeader = e.target.closest('.section-card-header-toggle');
    if (toggleHeader) {
      const card = toggleHeader.closest('.section-card.collapsible');
      if (card) {
        card.classList.toggle('collapsed');
      }
      return;
    }

    // 2. Nhảy nhanh tới section khi click Quick Nav Chip
    const navChip = e.target.closest('.quick-nav-chip');
    if (navChip) {
      const targetId = navChip.dataset.target;
      if (!targetId) return;

      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        // Nếu section đang bị đóng, tự động mở ra
        if (targetEl.classList.contains('collapsed')) {
          targetEl.classList.remove('collapsed');
        }

        // Đánh dấu active cho chip vừa chọn
        const parentNav = navChip.closest('.detail-quick-nav');
        if (parentNav) {
          parentNav.querySelectorAll('.quick-nav-chip').forEach(c => c.classList.remove('active'));
          navChip.classList.add('active');
        }

        // Cuộn mượt tới section
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });

  let modalNavHistory = [];
  let currentModalState = null;

  function getModalBackBtnHtml() {
    if (modalNavHistory.length === 0) return '';
    return `<button type="button" class="modal-back-btn" title="Quay lại mục trước đó"><i class="bi bi-arrow-left"></i> Quay lại</button>`;
  }

  // Modal open detail
  async function openDetailModal(code, isBack = false) {
    if (!isBack && modal.style.display === 'flex' && currentModalState && !(currentModalState.type === 'tthc' && currentModalState.id === code)) {
      modalNavHistory.push(currentModalState);
    }
    currentModalState = { type: 'tthc', id: code };

    modal.style.display = 'flex';
    currentModalMarkdown = '';
    currentModalCode = code;

    // Reset chế độ xem về Giao diện trực quan và ẩn các nút hành động khi đang tải
    if (modalBody) modalBody.style.display = 'block';
    if (modalMarkdownViewport) modalMarkdownViewport.style.display = 'none';
    if (btnModalModeRendered) btnModalModeRendered.classList.add('active');
    if (btnModalModeMarkdown) btnModalModeMarkdown.classList.remove('active');
    if (modalViewToggle) modalViewToggle.style.display = 'none';
    if (btnModalCopyMd) btnModalCopyMd.style.display = 'none';
    if (btnModalDownloadMd) btnModalDownloadMd.style.display = 'none';

    const initialUrl = (code && code.includes('-') && code.length > 20)
      ? `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${encodeURIComponent(code)}`
      : '';

    modalTitle.innerHTML = `
      ${getModalBackBtnHtml()}
      <span>Chi tiết TTHC: ${escapeHtml(code)}</span>
      <a href="${initialUrl}" id="modal-dvc-link-btn" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-xs modal-dvc-badge" title="Mở trang nộp hồ sơ trên Cổng Dịch vụ công Quốc gia" style="${initialUrl ? '' : 'display: none;'}">
        <i class="bi bi-send-fill"></i> Nộp hồ sơ
      </a>
    `;
    modalBody.innerHTML = `
      <div class="loader-container">
        <div class="spinner"></div>
        <p>Đang tải chi tiết hồ sơ mã ${code} từ MCP Server...</p>
      </div>
    `;

    const apiKey = getActiveApiKey();
    const targetUrl = apiKey
      ? `${currentOrigin}/mcp?api-key=${encodeURIComponent(apiKey)}`
      : `${currentOrigin}/mcp`;

    try {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: 'tra_cuu_theo_ma_tthc',
            arguments: { ma_tthc: code }
          }
        })
      });

      const data = await res.json();
      const rawMd = data?.result?.content?.[0]?.text || 'Không tìm thấy chi tiết.';
      const md = stripInternalIds(rawMd);
      currentModalMarkdown = md;

      // Cập nhật link DVC theo URL trực tiếp từ kết quả
      const matchLink = md.match(/Cổng tiếp nhận hồ sơ[^:]*:\s*\[(?:[^\]]*)\]\((https?:\/\/[^)]+)\)/) ||
                        md.match(/Link (?:TTHC gốc|DVC)[^:]*:\s*\[(?:[^\]]*)\]\((https?:\/\/[^)]+)\)/);
      if (matchLink && matchLink[1]) {
        const btnLink = document.getElementById('modal-dvc-link-btn');
        if (btnLink) {
          btnLink.href = matchLink[1];
          btnLink.style.display = 'inline-flex';
        }
      }

      // Trích xuất Mức độ DVCTT để gắn badge trực quan trên tiêu đề Modal
      const matchMucDo = md.match(/\*\*Mức độ DVCTT\*\*:\s*([^\n\r]+)/);
      let mucDoPill = '';
      if (matchMucDo && matchMucDo[1]) {
        const txt = matchMucDo[1];
        if (txt.includes('Toàn trình')) {
          mucDoPill = '<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.35); padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;"><i class="bi bi-check-circle-fill"></i> DVCTT Toàn trình</span>';
        } else if (txt.includes('Một phần')) {
          mucDoPill = '<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.35); padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;"><i class="bi bi-lightning-charge-fill"></i> DVCTT Một phần</span>';
        } else if (txt.includes('Chưa cung cấp')) {
          mucDoPill = '<span class="badge" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.3); padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;"><i class="bi bi-building"></i> Chưa có DVCTT</span>';
        }
      }

      // Trích xuất Số Quyết định công bố để gắn label trực quan trên tiêu đề Modal
      const matchSoQd = md.match(/\*\*Số Quyết định\*\*:\s*([^\n\r]+)/);
      let qdcbPill = '';
      if (matchSoQd && matchSoQd[1]) {
        const rawQd = matchSoQd[1].trim();
        if (rawQd && !rawQd.includes('Chưa cập nhật')) {
          const soQdClean = rawQd.split('(')[0].split('—')[0].replace(/`/g, '').trim();
          if (soQdClean) {
            qdcbPill = `<button type="button" class="meta-pill meta-pill-qdcb btn-open-qdcb-modal" data-qdcb-id="${escapeHtml(soQdClean)}" style="padding: 4px 10px; font-size: 0.75rem; cursor: pointer;" title="Bấm để mở Modal Chi tiết QĐCB"><i class="bi bi-file-earmark-check-fill"></i> QĐCB: ${escapeHtml(soQdClean)}</button>`;
          }
        }
      }

      if (mucDoPill || qdcbPill) {
        modalTitle.innerHTML = `
          ${getModalBackBtnHtml()}
          <span>Chi tiết TTHC: ${escapeHtml(code)}</span>
          ${mucDoPill}
          ${qdcbPill}
          <a href="${matchLink ? matchLink[1] : initialUrl}" id="modal-dvc-link-btn" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-xs modal-dvc-badge" title="Mở trang nộp hồ sơ trực tuyến" style="${(matchLink || initialUrl) ? '' : 'display: none;'}">
            <i class="bi bi-send-fill"></i> Nộp hồ sơ
          </a>
        `;
      }

      // Render nội dung giao diện và gán mã nguồn Markdown có cấu trúc
      modalBody.innerHTML = formatDetailHtml(md);
      if (modalMarkdownCode) {
        modalMarkdownCode.textContent = md;
      }

      // Kích hoạt các nút xem và xuất dữ liệu Markdown có cấu trúc
      if (modalViewToggle) modalViewToggle.style.display = 'inline-flex';
      if (btnModalCopyMd) btnModalCopyMd.style.display = 'inline-flex';
      if (btnModalDownloadMd) btnModalDownloadMd.style.display = 'inline-flex';
    } catch (err) {
      modalBody.innerHTML = `<p style="color: #f43f5e;">Lỗi tải chi tiết: ${escapeHtml(err.message)}</p>`;
    }
  }

  // Mở Modal Chi tiết QĐCB chuẩn cấu trúc Cổng Dịch vụ công Quốc gia
  async function openQDCBModal(idOrSoQd, isBack = false) {
    if (!idOrSoQd) return;
    if (!isBack && modal.style.display === 'flex' && currentModalState && !(currentModalState.type === 'qdcb' && currentModalState.id === idOrSoQd)) {
      modalNavHistory.push(currentModalState);
    }
    currentModalState = { type: 'qdcb', id: idOrSoQd };

    modal.style.display = 'flex';
    currentModalMarkdown = '';
    currentModalCode = `QDCB-${idOrSoQd}`;

    if (modalBody) modalBody.style.display = 'block';
    if (modalMarkdownViewport) modalMarkdownViewport.style.display = 'none';
    if (btnModalModeRendered) btnModalModeRendered.classList.add('active');
    if (btnModalModeMarkdown) btnModalModeMarkdown.classList.remove('active');
    if (modalViewToggle) modalViewToggle.style.display = 'none';
    if (btnModalCopyMd) btnModalCopyMd.style.display = 'none';
    if (btnModalDownloadMd) btnModalDownloadMd.style.display = 'none';

    modalTitle.innerHTML = `${getModalBackBtnHtml()}<span>Quyết định công bố: ${escapeHtml(idOrSoQd)}</span>`;
    modalBody.innerHTML = `
      <div class="loader-container">
        <div class="spinner"></div>
        <p>Đang tải chi tiết Quyết định công bố ${escapeHtml(idOrSoQd)}...</p>
      </div>
    `;

    const apiKey = getActiveApiKey();
    const keyQuery = apiKey ? `&api-key=${encodeURIComponent(apiKey)}` : '';

    try {
      const [jsonRes, mdRes] = await Promise.all([
        fetch(`${currentOrigin}/api/qdcb/detail?id=${encodeURIComponent(idOrSoQd)}&dinh_dang=json${keyQuery}`),
        fetch(`${currentOrigin}/api/qdcb/detail?id=${encodeURIComponent(idOrSoQd)}&dinh_dang=markdown${keyQuery}`)
      ]);

      const jsonData = await jsonRes.json();
      const mdData = await mdRes.json();

      if (!jsonData.success || !jsonData.data) {
        modalBody.innerHTML = `<p style="color: #f43f5e;">${escapeHtml(jsonData.markdown || 'Không tìm thấy Quyết định công bố.')}</p>`;
        return;
      }

      const detail = jsonData.data;
      currentModalMarkdown = mdData.markdown || '';
      if (modalMarkdownCode) modalMarkdownCode.textContent = currentModalMarkdown;

      const soQd = detail.so_quyet_dinh || idOrSoQd;
      const trangThaiLabel = detail.trang_thai_label || 'Đã công bố';
      const loaiLabel = detail.loai_quyet_dinh_label || 'Tiêu chuẩn';

      modalTitle.innerHTML = `
        ${getModalBackBtnHtml()}
        <span>Quyết định công bố: ${escapeHtml(soQd)}</span>
        <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.35); padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;">
          <i class="bi bi-check-circle-fill"></i> ${escapeHtml(trangThaiLabel)}
        </span>
        <span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.35); padding: 4px 10px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600;">
          ${escapeHtml(loaiLabel)}
        </span>
        ${detail.url ? `
        <a href="${escapeHtml(detail.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-xs modal-dvc-badge" title="Mở văn bản gốc trên Cổng DVCQG">
          <i class="bi bi-box-arrow-up-right"></i> Xem trên DVCQG
        </a>` : ''}
      `;

      modalBody.innerHTML = renderQDCBModalHtml(detail);

      // Gắn sự kiện chuyển tab Công khai mới / Sửa đổi bổ sung / Bãi bỏ
      const tabBtns = modalBody.querySelectorAll('.qdcb-tab-btn');
      const tabPanels = modalBody.querySelectorAll('.qdcb-tab-panel');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          const targetTab = btn.dataset.tab;
          tabBtns.forEach(b => b.classList.remove('active'));
          tabPanels.forEach(p => (p.style.display = p.dataset.panel === targetTab ? 'block' : 'none'));
          btn.classList.add('active');
        });
      });

      // Gắn sự kiện tìm kiếm nhanh bên trong bảng TTHC của QĐCB
      const searchInput = modalBody.querySelector('.qdcb-table-search');
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          const q = searchInput.value.trim().toLowerCase();
          modalBody.querySelectorAll('.qdcb-table tbody tr').forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = !q || text.includes(q) ? '' : 'none';
          });
        });
      }

      // Gắn sự kiện copy nhanh Số Quyết định
      modalBody.querySelectorAll('.qdcb-copy-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const val = btn.dataset.copyVal;
          if (!val) return;
          await navigator.clipboard.writeText(val);
          showToast(`Đã sao chép: ${val}`);
        });
      });

      // Gắn sự kiện Export CSV danh sách TTHC trong QĐCB
      const btnExportCsv = modalBody.querySelector('.btn-export-qdcb-csv');
      if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => {
          const rows = [['Nhóm', 'Mã TTHC', 'Tên thủ tục hành chính', 'Ngày hiệu lực', 'Trạng thái', 'URL']];
          const tthc = detail.tthc_kem_theo || {};
          const pushRows = (label, grp) => {
            (grp?.items || []).forEach(it => {
              rows.push([
                label,
                it.ma_tthc || '',
                (it.ten_tthc || '').replace(/"/g, '""'),
                it.ngay_hieu_luc || '',
                it.trang_thai === 'INACTIVE' ? 'Đã bãi bỏ' : 'Đang công bố',
                it.url || ''
              ]);
            });
          };
          pushRows('Công khai mới', tthc.cong_khai_moi);
          pushRows('Sửa đổi, bổ sung', tthc.sua_doi_bo_sung);
          pushRows('Thay thế', tthc.thay_the);
          pushRows('Điều chỉnh', tthc.dieu_chinh);
          pushRows('Bãi bỏ', tthc.bai_bo);

          const csvContent = '\uFEFF' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `QDCB-${soQd.replace(/[/\\?%*:|"<>]/g, '-')}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          showToast(`Đã xuất danh sách TTHC của ${soQd} ra CSV!`);
        });
      }

      // Gắn sự kiện bấm vào Mã TTHC hoặc nút Xem chi tiết -> mở Modal Chi tiết TTHC
      modalBody.querySelectorAll('.btn-qdcb-open-tthc').forEach(btn => {
        btn.addEventListener('click', () => {
          const tthcCode = btn.dataset.tthcCode;
          if (tthcCode) openDetailModal(tthcCode);
        });
      });

      if (modalViewToggle) modalViewToggle.style.display = 'inline-flex';
      if (btnModalCopyMd) btnModalCopyMd.style.display = 'inline-flex';
      if (btnModalDownloadMd) btnModalDownloadMd.style.display = 'inline-flex';
    } catch (err) {
      modalBody.innerHTML = `<p style="color: #f43f5e;">Lỗi tải chi tiết QĐCB: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderQDCBModalHtml(detail) {
    const soQd = detail.so_quyet_dinh || 'N/A';
    const trichYeu = detail.trich_yeu || detail.thong_tin_chi_tiet?.proposalExcerpt || 'Không có trích yếu.';
    const coQuan = detail.co_quan_ban_hanh || 'N/A';
    const linhVuc = Array.isArray(detail.linh_vuc) && detail.linh_vuc.length > 0 ? detail.linh_vuc.join(', ') : 'Chưa cập nhật';
    const ngayQd = detail.ngay_quyet_dinh || 'Chưa cập nhật';
    const ngayHieuLuc = detail.ngay_hieu_luc || ngayQd;
    const ngayCongBo = detail.ngay_cong_bo || 'Chưa cập nhật';
    const files = Array.isArray(detail.tep_dinh_kem) ? detail.tep_dinh_kem : [];
    const noteText = detail.thong_tin_chi_tiet?.note || '';

    const tthc = detail.tthc_kem_theo || {};
    const cntMoi = tthc.cong_khai_moi?.count ?? (tthc.cong_khai_moi?.items?.length || 0);
    const cntSua = tthc.sua_doi_bo_sung?.count ?? (tthc.sua_doi_bo_sung?.items?.length || 0);
    const cntBaiBo = tthc.bai_bo?.count ?? (tthc.bai_bo?.items?.length || 0);
    const cntThayThe = tthc.thay_the?.count ?? (tthc.thay_the?.items?.length || 0);
    const cntDieuChinh = tthc.dieu_chinh?.count ?? (tthc.dieu_chinh?.items?.length || 0);
    const totalTthc = cntMoi + cntSua + cntBaiBo + cntThayThe + cntDieuChinh;

    const groups = [
      { key: 'cong_khai_moi', label: 'Công khai mới', icon: 'bi-plus-circle-fill', data: tthc.cong_khai_moi },
      { key: 'sua_doi_bo_sung', label: 'Sửa đổi, bổ sung', icon: 'bi-pencil-square', data: tthc.sua_doi_bo_sung },
      { key: 'bai_bo', label: 'Bãi bỏ', icon: 'bi-slash-circle-fill', data: tthc.bai_bo },
      { key: 'thay_the', label: 'Thay thế', icon: 'bi-arrow-repeat', data: tthc.thay_the },
      { key: 'dieu_chinh', label: 'Điều chỉnh', icon: 'bi-sliders', data: tthc.dieu_chinh }
    ].filter(g => g.key === 'cong_khai_moi' || g.key === 'sua_doi_bo_sung' || g.key === 'bai_bo' || (g.data && g.data.items && g.data.items.length > 0));

    // Tự động chọn tab đầu tiên có item (> 0)
    let activeKey = groups.find(g => g.data && g.data.items && g.data.items.length > 0)?.key || groups[0]?.key || 'cong_khai_moi';

    let html = '<div class="qdcb-modal-view">';

    // 1. Trích yếu quyết định
    html += `
      <div class="qdcb-excerpt-box">
        <div class="qdcb-excerpt-label"><i class="bi bi-file-text-fill"></i> Trích yếu Quyết định công bố</div>
        <div class="qdcb-excerpt-text">${escapeHtml(trichYeu)}</div>
      </div>
    `;

    // 1b. Thanh thống kê tổng quan
    html += `
      <div class="qdcb-stats-row">
        <span class="qdcb-stat-pill"><i class="bi bi-collection-fill"></i> Tổng TTHC: <strong>${totalTthc}</strong></span>
        <span class="qdcb-stat-pill qdcb-stat-new"><i class="bi bi-plus-circle-fill"></i> Công khai mới: <strong>${cntMoi}</strong></span>
        <span class="qdcb-stat-pill qdcb-stat-edit"><i class="bi bi-pencil-square"></i> Sửa đổi/BS: <strong>${cntSua}</strong></span>
        <span class="qdcb-stat-pill qdcb-stat-drop"><i class="bi bi-slash-circle-fill"></i> Bãi bỏ: <strong>${cntBaiBo}</strong></span>
      </div>
    `;

    // 2. Thẻ Thông tin chung (chuẩn lưới DVCQG)
    html += `
      <div class="qdcb-info-card">
        <div class="qdcb-info-grid">
          <div class="qdcb-info-cell">
            <span class="qdcb-info-label">Số quyết định</span>
            <span class="qdcb-info-val" style="color:#fbbf24; font-family:var(--font-mono); display:flex; align-items:center; gap:6px;">
              <span>${escapeHtml(soQd)}</span>
              <button type="button" class="qdcb-copy-btn" data-copy-val="${escapeHtml(soQd)}" title="Sao chép số quyết định"><i class="bi bi-clipboard"></i></button>
            </span>
          </div>
          <div class="qdcb-info-cell">
            <span class="qdcb-info-label">Cơ quan ban hành</span>
            <span class="qdcb-info-val">${escapeHtml(coQuan)}</span>
          </div>
          <div class="qdcb-info-cell">
            <span class="qdcb-info-label">Lĩnh vực</span>
            <span class="qdcb-info-val">${escapeHtml(linhVuc)}</span>
          </div>
          <div class="qdcb-info-cell">
            <span class="qdcb-info-label">Ngày quyết định</span>
            <span class="qdcb-info-val">${escapeHtml(ngayQd)}</span>
          </div>
          <div class="qdcb-info-cell">
            <span class="qdcb-info-label">Ngày hiệu lực</span>
            <span class="qdcb-info-val">${escapeHtml(ngayHieuLuc)}</span>
          </div>
          <div class="qdcb-info-cell">
            <span class="qdcb-info-label">Ngày công bố</span>
            <span class="qdcb-info-val">${escapeHtml(ngayCongBo)}</span>
          </div>
        </div>
        ${noteText ? `
          <div class="qdcb-note-box mt-2">
            <i class="bi bi-info-circle-fill"></i>
            <div><strong>Ghi chú:</strong> ${escapeHtml(noteText)}</div>
          </div>
        ` : ''}
        ${files.length > 0 ? `
          <div class="qdcb-attachments-bar">
            <span class="qdcb-info-label" style="width:100%; margin-bottom:2px;">Tệp đính kèm:</span>
            ${files.map(f => `<a href="${escapeHtml(f.url)}" target="_blank" rel="noopener noreferrer" class="qdcb-file-btn"><i class="bi bi-file-earmark-arrow-down-fill"></i> ${escapeHtml(f.name)}</a>`).join('')}
          </div>
        ` : ''}
      </div>
    `;

    // 3. Khối Danh sách TTHC thuộc Quyết định (Tabs + Toolbar tìm kiếm + Data Table chuẩn DVCQG)
    html += '<div class="qdcb-tabs-section">';
    html += '<div class="qdcb-tabs-bar">';
    groups.forEach(g => {
      const cnt = g.data?.count ?? (g.data?.items?.length || 0);
      const isActive = g.key === activeKey;
      html += `
        <button type="button" class="qdcb-tab-btn ${isActive ? 'active' : ''}" data-tab="${g.key}">
          <i class="bi ${g.icon}"></i>
          <span>${escapeHtml(g.label)}</span>
          <span class="qdcb-tab-count">${cnt}</span>
        </button>
      `;
    });
    html += '</div>';

    if (totalTthc > 0) {
      html += `
        <div class="qdcb-table-toolbar">
          <div class="qdcb-table-search-wrap">
            <i class="bi bi-search"></i>
            <input type="text" class="qdcb-table-search" placeholder="Tìm nhanh theo Mã TTHC hoặc Tên thủ tục trong quyết định này...">
          </div>
          <button type="button" class="btn btn-secondary btn-xs btn-export-qdcb-csv" title="Xuất danh sách TTHC trong quyết định ra file CSV (Excel)">
            <i class="bi bi-file-earmark-spreadsheet-fill"></i> Xuất CSV (${totalTthc})
          </button>
        </div>
      `;
    }

    groups.forEach(g => {
      const items = g.data?.items || [];
      const isActive = g.key === activeKey;
      html += `<div class="qdcb-tab-panel" data-panel="${g.key}" style="display: ${isActive ? 'block' : 'none'};">`;

      if (items.length === 0) {
        html += `<div class="qdcb-empty-tab"><i class="bi bi-inbox" style="font-size:1.5rem; display:block; margin-bottom:6px;"></i>Không có thủ tục nào trong mục ${escapeHtml(g.label)}.</div>`;
      } else {
        html += `
          <div class="qdcb-table-wrap">
            <table class="qdcb-table">
              <thead>
                <tr>
                  <th style="width: 48px;">STT</th>
                  <th style="width: 120px;">Mã TTHC</th>
                  <th>Tên thủ tục hành chính</th>
                  <th style="width: 150px;">Lĩnh vực</th>
                  <th style="width: 110px;">Ngày hiệu lực</th>
                  <th style="width: 120px;">Trạng thái</th>
                  <th style="width: 110px; text-align:right;">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item, idx) => {
                  const itemLv = Array.isArray(item.linh_vuc) && item.linh_vuc.length > 0 ? item.linh_vuc.join(', ') : linhVuc;
                  const isInactive = item.trang_thai === 'INACTIVE';
                  const stLabel = isInactive ? 'Đã bãi bỏ' : 'Đang công bố';
                  const stClass = isInactive ? 'qdcb-status-inactive' : 'qdcb-status-active';
                  const effDate = item.ngay_hieu_luc && /^\d{4}-\d{2}-\d{2}/.test(item.ngay_hieu_luc)
                    ? item.ngay_hieu_luc.slice(0, 10).split('-').reverse().join('/')
                    : (item.ngay_hieu_luc || ngayHieuLuc);
                  return `
                    <tr>
                      <td>${idx + 1}</td>
                      <td>
                        <button type="button" class="qdcb-tthc-code-btn btn-qdcb-open-tthc" data-tthc-code="${escapeHtml(item.ma_tthc || item.id)}" title="Xem chi tiết TTHC ${escapeHtml(item.ma_tthc)}">
                          ${escapeHtml(item.ma_tthc || 'N/A')}
                        </button>
                      </td>
                      <td style="font-weight: 500;">${escapeHtml(item.ten_tthc || 'N/A')}</td>
                      <td style="color: var(--text-muted); font-size:0.8rem;">${escapeHtml(itemLv)}</td>
                      <td style="white-space:nowrap;">${escapeHtml(effDate)}</td>
                      <td>
                        <span class="qdcb-status-badge ${stClass}">
                          <i class="bi ${isInactive ? 'bi-x-circle-fill' : 'bi-check-circle-fill'}"></i> ${stLabel}
                        </span>
                      </td>
                      <td style="text-align:right; white-space:nowrap;">
                        <button type="button" class="btn btn-primary btn-xs btn-qdcb-open-tthc" data-tthc-code="${escapeHtml(item.ma_tthc || item.id)}" title="Xem chi tiết thủ tục">
                          <i class="bi bi-eye"></i> Xem
                        </button>
                        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-xs" title="Mở trên Cổng DVCQG"><i class="bi bi-box-arrow-up-right"></i></a>` : ''}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      html += '</div>';
    });

    html += '</div>'; // End qdcb-tabs-section
    html += '</div>'; // End qdcb-modal-view
    return html;
  }

  // Chuyển đổi chế độ xem bên trong modal (Giao diện / Markdown)
  if (btnModalModeRendered && btnModalModeMarkdown) {
    btnModalModeRendered.addEventListener('click', () => {
      btnModalModeRendered.classList.add('active');
      btnModalModeMarkdown.classList.remove('active');
      if (modalBody) modalBody.style.display = 'block';
      if (modalMarkdownViewport) modalMarkdownViewport.style.display = 'none';
    });
    btnModalModeMarkdown.addEventListener('click', () => {
      btnModalModeMarkdown.classList.add('active');
      btnModalModeRendered.classList.remove('active');
      if (modalBody) modalBody.style.display = 'none';
      if (modalMarkdownViewport) modalMarkdownViewport.style.display = 'block';
    });
  }

  // Sao chép nội dung Markdown có cấu trúc của thủ tục
  if (btnModalCopyMd) {
    btnModalCopyMd.addEventListener('click', () => {
      if (currentModalMarkdown) {
        navigator.clipboard.writeText(currentModalMarkdown);
        showToast(`Đã sao chép Markdown có cấu trúc của TTHC ${currentModalCode}!`);
      }
    });
  }

  // Xuất và tải file .md có cấu trúc đầy đủ
  if (btnModalDownloadMd) {
    btnModalDownloadMd.addEventListener('click', () => {
      if (currentModalMarkdown) {
        const cleanName = (currentModalCode || 'chi_tiet').replace(/[^a-zA-Z0-9._-]/g, '_');
        const blob = new Blob([currentModalMarkdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `TTHC_${cleanName}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`Đã xuất tệp TTHC_${cleanName}.md thành công!`);
      }
    });
  }

  btnCloseModal.addEventListener('click', () => {
    modal.style.display = 'none';
    modalNavHistory = [];
    currentModalState = null;
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.style.display = 'none';
      modalNavHistory = [];
      currentModalState = null;
    }
  });

  // 6. View Switcher (Rendered / Markdown / JSON)
  btnViewRendered.addEventListener('click', () => {
    setActiveView(btnViewRendered, viewportRendered);
  });
  btnViewMarkdown.addEventListener('click', () => {
    setActiveView(btnViewMarkdown, viewportMarkdown);
  });
  btnViewJson.addEventListener('click', () => {
    setActiveView(btnViewJson, viewportJson);
  });

  function setActiveView(button, viewport) {
    [btnViewRendered, btnViewMarkdown, btnViewJson].forEach(b => b.classList.remove('active'));
    [viewportRendered, viewportMarkdown, viewportJson].forEach(v => (v.style.display = 'none'));

    button.classList.add('active');
    viewport.style.display = 'block';
  }

  btnCopyResult.addEventListener('click', () => {
    const textToCopy = currentMarkdownResult || JSON.stringify(currentRawResult, null, 2);
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      showToast('Đã sao chép kết quả!');
    }
  });

  // 7. Client Config Generator (Tab 2)
  clientTabs.forEach(t => {
    t.addEventListener('click', () => {
      clientTabs.forEach(b => b.classList.remove('active'));
      t.classList.add('active');
      activeClientConfig = t.dataset.client;
      updateClientConfigs();
    });
  });

  function updateClientConfigs() {
    const host = currentOrigin;
    const key = getActiveApiKey();
    const keyParam = key ? `?api-key=${encodeURIComponent(key)}` : '?api-key=YOUR_API_KEY';
    const sseUrl = `${host}/sse${keyParam}`;
    const mcpUrl = `${host}/mcp${keyParam}`;

    let code = '';
    let label = '';

    if (activeClientConfig === 'cursor') {
      label = '.cursor/mcp.json';
      code = JSON.stringify(
        {
          mcpServers: {
            "tthc-vietnam": {
              url: sseUrl
            }
          }
        },
        null,
        2
      );
    } else if (activeClientConfig === 'claude') {
      label = 'claude_desktop_config.json';
      code = JSON.stringify(
        {
          mcpServers: {
            "tthc-vietnam": {
              url: sseUrl
            }
          }
        },
        null,
        2
      );
    } else if (activeClientConfig === 'windsurf') {
      label = '~/.codeium/windsurf/mcp_config.json';
      code = JSON.stringify(
        {
          mcpServers: {
            "tthc-vietnam": {
              serverUrl: sseUrl
            }
          }
        },
        null,
        2
      );
    } else if (activeClientConfig === 'openai') {
      label = 'ChatGPT / Custom GPTs / OpenAI Actions & Plugins Guide';
      code = JSON.stringify(
        {
          mcpServerEndpoint: mcpUrl,
          mcpServerCleanEndpoint: `${host}/mcp`,
          chatGptInstructions: {
            step1: "Trong GPT Builder / OpenAI Action, chọn Authentication: API Key",
            step2: "Auth Type: Bearer (hoặc Custom với Header Name: X-API-Key)",
            step3: "Nhập Secret Token (API Key) từ biến môi trường của bạn",
            step4: `Sử dụng URL Endpoint sạch: ${host}/mcp hoặc URL kèm tham số: ${mcpUrl}`
          },
          openAiAgentPlugins: {
            manifestUrl: `${host}/plugin.json`,
            mcpConfigUrl: `${host}/mcp.json`,
            codexConfigUrl: `${host}/.mcp.json`
          },
          openApiActionSchema: `${host}/openapi.json`
        },
        null,
        2
      );
    } else if (activeClientConfig === 'openapi') {
      label = 'OpenAPI 3.1 Schema URL (Custom GPTs / Dify / n8n / Coze)';
      code = JSON.stringify(
        {
          schemaUrl: `${host}/openapi.json`,
          alternativeUrl: `${host}/schema`,
          mcpHttpEndpoint: mcpUrl,
          mcpSseEndpoint: sseUrl,
          usage: "Dán URL 'schemaUrl' vào mục Schema/OpenAPI trong Custom GPTs (Actions) hoặc Dify Tools để tự động tạo công cụ AI."
        },
        null,
        2
      );
    } else if (activeClientConfig === 'curl') {
      label = 'cURL Test Command (Direct HTTP JSON-RPC)';
      code = `# Gọi qua tham số URL ?api-key=...
curl -X POST "${mcpUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "tra_cuu_theo_ma_tthc",
      "arguments": {
        "ma_tthc": "6.006781"
      }
    }
  }'

# Hoặc truyền qua Header "Authorization: Bearer <key>":
curl -X POST "${host}/mcp" \\
  -H "Authorization: Bearer ${key || 'YOUR_API_KEY'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search",
      "arguments": {
        "query": "đăng ký kết hôn"
      }
    }
  }'`;
    }

    configFileLabel.textContent = label;
    configCodeDisplay.textContent = code;
  }

  btnCopyConfig.addEventListener('click', () => {
    navigator.clipboard.writeText(configCodeDisplay.textContent);
    showToast('Đã sao chép cấu hình client!');
  });

  // 8. Quản lý tương tác Tab "Danh Sách Tools & Schemas" (Tìm kiếm, Bộ lọc, Sao chép, Thử ngay)
  const inputSearchTools = document.getElementById('input-search-tools');
  const btnClearToolSearch = document.getElementById('btn-clear-tool-search');
  const filterChips = document.querySelectorAll('.docs-filter-chips .filter-chip');
  const toolCards = document.querySelectorAll('.tool-doc-card');
  const docsEmptyNotice = document.getElementById('docs-empty-notice');
  const btnResetToolsFilter = document.getElementById('btn-reset-tools-filter');

  function filterToolCards() {
    const query = (inputSearchTools?.value || '').trim().toLowerCase();
    const activeChip = document.querySelector('.docs-filter-chips .filter-chip.active');
    const selectedCategory = activeChip ? activeChip.dataset.filter : 'all';

    if (btnClearToolSearch) {
      btnClearToolSearch.style.display = query ? 'flex' : 'none';
    }

    let visibleCount = 0;
    toolCards.forEach(card => {
      const toolName = card.dataset.tool || '';
      const category = card.dataset.category || '';
      const cardText = card.textContent.toLowerCase();

      const matchesQuery = !query || toolName.toLowerCase().includes(query) || cardText.includes(query);
      const matchesCategory = selectedCategory === 'all' || category === selectedCategory;

      if (matchesQuery && matchesCategory) {
        card.style.display = 'flex';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (docsEmptyNotice) {
      docsEmptyNotice.style.display = visibleCount === 0 ? 'block' : 'none';
    }
  }

  if (inputSearchTools) {
    inputSearchTools.addEventListener('input', filterToolCards);
  }

  if (btnClearToolSearch) {
    btnClearToolSearch.addEventListener('click', () => {
      if (inputSearchTools) inputSearchTools.value = '';
      filterToolCards();
      inputSearchTools?.focus();
    });
  }

  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      filterToolCards();
    });
  });

  if (btnResetToolsFilter) {
    btnResetToolsFilter.addEventListener('click', () => {
      if (inputSearchTools) inputSearchTools.value = '';
      filterChips.forEach(c => {
        if (c.dataset.filter === 'all') c.classList.add('active');
        else c.classList.remove('active');
      });
      filterToolCards();
    });
  }

  // Nút sao chép tên tool
  document.querySelectorAll('.btn-copy-tool-name').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const toolName = btn.dataset.copy;
      if (!toolName) return;
      try {
        await navigator.clipboard.writeText(toolName);
        const icon = btn.querySelector('i');
        if (icon) {
          icon.className = 'bi bi-check-lg';
          btn.classList.add('copied');
          setTimeout(() => {
            icon.className = 'bi bi-clipboard';
            btn.classList.remove('copied');
          }, 1500);
        }
        showToast(`Đã sao chép: ${toolName}`);
      } catch (err) {
        console.error('Lỗi sao chép:', err);
      }
    });
  });

  // Nút "Thử nghiệm ngay": tự chuyển sang tab Playground và chọn tool
  document.querySelectorAll('.btn-try-tool').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTool = btn.dataset.tool;
      if (!targetTool) return;

      const tabPlayground = document.getElementById('tab-btn-playground');
      if (tabPlayground) {
        tabPlayground.click();
      }

      if (selectMcpTool) {
        selectMcpTool.value = targetTool;
        selectMcpTool.dispatchEvent(new Event('change'));
      }

      const controlsCard = document.querySelector('.tool-controls-card');
      if (controlsCard) {
        controlsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      showToast(`Đã chọn công cụ ${targetTool} tại Playground!`);
    });
  });

  // Helpers
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
});
