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
      if (toolName === 'tra_cuu_tthc_gia_lai' || toolName === 'tthc_gia_lai') {
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
    if (toolName === 'chi_tiet_tthc' || toolName === 'tra_cuu_theo_ma_tthc') {
      renderProcedureDetail(markdownText);
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
      } else if (line.startsWith('- **Mã TTHC**:')) {
        const matchCode = line.match(/`([^`]+)`/);
        if (matchCode) currentItem.code = matchCode[1];
      } else if (line.startsWith('- **Cấp thực hiện**:')) {
        currentItem.meta1 = line;
      } else if (line.startsWith('- **Cơ quan thực hiện**:')) {
        currentItem.meta2 = line;
      } else if (line.startsWith('- **Link DVC')) {
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
  }

  function buildItemCard(item) {
    const targetLink = item.targetLink || (item.id
      ? `https://dichvucong.gov.vn/thu-tuc-hanh-chinh/${encodeURIComponent(item.id)}`
      : '');

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
    const lines = markdownText.split('\n');
    let html = '<div class="detail-view">';
    let inCard = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('# ')) {
        const titleText = line.slice(2).trim();
        html += `<div class="detail-header-block"><h2 class="detail-title"><i class="bi bi-file-earmark-text-fill"></i> ${escapeHtml(titleText)}</h2></div>`;
      } else if (line.startsWith('### ')) {
        if (inCard) {
          html += '</div></div>';
          inCard = false;
        }
        const sectionTitle = line.slice(4).trim();
        let cardClass = 'section-card';
        let sectionIcon = 'bi-info-circle-fill';

        if (sectionTitle.includes('Cách thức thực hiện')) {
          cardClass += ' section-card-method';
          sectionIcon = 'bi-send-fill';
        } else if (sectionTitle.includes('Thời hạn giải quyết')) {
          cardClass += ' section-card-time';
          sectionIcon = 'bi-clock-history';
        } else if (sectionTitle.includes('Trình tự')) {
          cardClass += ' section-card-steps';
          sectionIcon = 'bi-diagram-3-fill';
        } else if (sectionTitle.includes('hồ sơ') || sectionTitle.includes('Hồ sơ')) {
          cardClass += ' section-card-docs';
          sectionIcon = 'bi-folder2-open';
        } else if (sectionTitle.includes('Phí') || sectionTitle.includes('phí')) {
          cardClass += ' section-card-fee';
          sectionIcon = 'bi-cash-stack';
        } else if (sectionTitle.includes('Yêu cầu') || sectionTitle.includes('điều kiện')) {
          cardClass += ' section-card-basis';
          sectionIcon = 'bi-shield-check';
        } else if (sectionTitle.includes('Căn cứ')) {
          cardClass += ' section-card-basis';
          sectionIcon = 'bi-journal-bookmark-fill';
        } else if (sectionTitle.includes('Mô tả')) {
          cardClass += ' section-card-desc';
          sectionIcon = 'bi-card-text';
        } else if (sectionTitle.includes('Kết quả')) {
          cardClass += ' section-card-result';
          sectionIcon = 'bi-award-fill';
        }

        html += `<div class="${cardClass}"><h3 class="detail-section-title"><i class="bi ${sectionIcon}"></i> ${escapeHtml(sectionTitle)}</h3><div class="section-card-content">`;
        inCard = true;
      } else if (line.startsWith('**Bước ')) {
        const nextLine = lines[i + 1]?.trim() || '';
        html += `
          <div class="step-item">
            <div class="step-name">${escapeHtml(line.replace(/\*\*/g, ''))}</div>
            ${nextLine && !nextLine.startsWith('**Bước ') && !nextLine.startsWith('### ') ? `<div class="step-desc">${escapeHtml(nextLine)}</div>` : ''}
          </div>
        `;
        if (nextLine && !nextLine.startsWith('**Bước ') && !nextLine.startsWith('### ')) i++;
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

  // Modal open detail
  async function openDetailModal(code) {
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
      const matchLink = md.match(/Link (?:TTHC gốc|DVC)[^:]*:\s*\[(?:[^\]]*)\]\((https?:\/\/[^)]+)\)/);
      if (matchLink && matchLink[1]) {
        const btnLink = document.getElementById('modal-dvc-link-btn');
        if (btnLink) {
          btnLink.href = matchLink[1];
        }
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
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = 'none';
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
