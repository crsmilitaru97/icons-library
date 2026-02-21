(function () {
  const vscode = acquireVsCodeApi();

  const CONFIG = {
    BATCH_SIZE: 200,
    ANIMATION_DELAY: 150,
    PACK_DISPLAY_NAMES: {},
    PACK_VERSIONS: {}
  };
  const HEROICONS_SVG_VERSION = '2.2.0';

  const getHeroiconsSvgUrl = name => {
    return `https://unpkg.com/heroicons@${HEROICONS_SVG_VERSION}/24/outline/${encodeURIComponent(name)}.svg`;
  };

  const RENDERERS = {
    codicons: name => `<i class="codicon codicon-${name}"></i>`,
    primeicons: name => `<i class="pi pi-${name}"></i>`,
    fontawesome: name => `<i class="fa-solid ${name.startsWith('fa-') ? name : 'fa-' + name}"></i>`,
    fabrands: name => `<i class="fa-brands ${name.startsWith('fa-') ? name : 'fa-' + name}"></i>`,
    bootstrap: name => `<i class="bi bi-${name}"></i>`,
    material: name => `<span class="material-symbols-outlined">${name === 'cross' ? 'close' : name}</span>`,
    heroicons: name => {
      const iconUrl = getHeroiconsSvgUrl(name);
      return `<div style="-webkit-mask: url(${iconUrl}) no-repeat center / contain; mask: url(${iconUrl}) no-repeat center / contain; background-color: var(--vscode-editor-foreground); width: 24px; height: 24px; margin: auto;"></div>`;
    },
    lucide: name => `<i class="icon icon-${name}"></i>`,
    feather: name => `<i class="ft ft-${name}"></i>`,
    tabler: name => `<i class="ti ti-${name}"></i>`,
    remixicon: name => `<i class="ri-${name}"></i>`,
    lineicons: name => `<i class="lni lni-${name}"></i>`,
    simpleicons: name => `<div style="-webkit-mask: url(https://cdn.simpleicons.org/${name}) no-repeat center / contain; mask: url(https://cdn.simpleicons.org/${name}) no-repeat center / contain; background-color: var(--vscode-editor-foreground); width: 24px; height: 24px; margin: auto;"></div>`,
    eva: name => `<i class="eva eva-${name}"></i>`,
    boxicons: name => `<i class="bx ${name.startsWith('bx-') ? name : 'bx-' + name}"></i>`,
    iconoir: name => `<i class="iconoir-${name}"></i>`,
    phosphor: name => `<i class="ph ph-${name}"></i>`
  };

  const pastState = vscode.getState() || {};

  const state = {
    iconsByPack: {},
    flatIconIndex: [],
    currentQuery: pastState.currentQuery || '',
    currentPackFilter: pastState.currentPackFilter || 'all',
    filteredIcons: [],
    displayedCount: 0,
    isLoadingMore: false,
    debounceTimer: null
  };

  const ui = {
    grid: document.getElementById('icons-grid'),
    settingsBtn: document.getElementById('settings-btn'),
    searchInput: document.getElementById('search-input'),
    clearSearch: document.getElementById('clear-search'),
    loading: document.getElementById('loading'),
    emptyState: document.getElementById('empty-state'),
    dropdownWrapper: document.getElementById('pack-dropdown'),
    dropdownToggle: document.querySelector('.dropdown-toggle'),
    dropdownLabel: document.querySelector('.dropdown-label'),
    dropdownMenu: document.querySelector('.dropdown-menu'),
    iconCount: document.getElementById('icon-count')
  };

  function init() {
    try {
      const rawConfig = window.initialConfig;
      const config = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : (rawConfig || {});
      if (config.packDisplayNames) {
        CONFIG.PACK_DISPLAY_NAMES = config.packDisplayNames;
      }
      if (config.packVersions) {
        CONFIG.PACK_VERSIONS = config.packVersions;
      }
    } catch (e) {
      vscode.postMessage({ type: 'error', message: 'Failed to parse config: ' + (e?.message || String(e)) });
    }

    setTimeout(() => {
      loadData();
      setupDropdown();
      setupEventListeners();

      if (ui.searchInput) {
        ui.searchInput.value = state.currentQuery;
      }
      const activeOption = ui.dropdownMenu.querySelector(`[data-value="${state.currentPackFilter}"]`);
      if (activeOption && ui.dropdownLabel) {
        ui.dropdownLabel.textContent = activeOption.querySelector('span').textContent;
        ui.dropdownMenu.querySelectorAll('.dropdown-option').forEach(opt => {
          const isSelected = opt.dataset.value === state.currentPackFilter;
          opt.classList.toggle('selected', isSelected);
          opt.setAttribute('aria-selected', isSelected);
        });
      }

      renderIcons();

      if (ui.loading) { ui.loading.style.display = 'none'; }

      requestAnimationFrame(() => {
        document.body.classList.remove('preload');
        if (ui.searchInput) {
          ui.searchInput.focus();
          ui.clearSearch?.classList.toggle('visible', !!ui.searchInput.value);
        }
      });
    }, 50);
  }

  function loadData() {
    processIconData();
    renderPackDropdown();
  }

  function processIconData() {
    let rawData = {};
    try {
      const raw = window.initialIconData;
      rawData = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    } catch (e) {
      vscode.postMessage({ type: 'error', message: 'Failed to parse icon data: ' + (e?.message || String(e)) });
      rawData = {};
    }

    for (const pack in rawData) {
      const icons = rawData[pack];
      if (!icons) { continue; }

      state.iconsByPack[pack] = [];
      for (const name in icons) {
        const tags = icons[name] || [];
        state.iconsByPack[pack].push({
          pack,
          name,
          tags,
          searchText: (name + ' ' + (Array.isArray(tags) ? tags.join(' ') : '')).toLowerCase()
        });
      }
    }

    const packNames = Object.keys(state.iconsByPack);
    if (packNames.length === 0) { return; }

    const maxPerPack = Math.max(...packNames.map(p => state.iconsByPack[p].length));

    for (let i = 0; i < maxPerPack; i++) {
      for (const pack of packNames) {
        if (i < state.iconsByPack[pack].length) {
          state.flatIconIndex.push(state.iconsByPack[pack][i]);
        }
      }
    }
  }

  function getFilteredIcons(query, packFilter) {
    const lowerQuery = query.toLowerCase();
    const source = packFilter === 'all' ? state.flatIconIndex : (state.iconsByPack[packFilter] || []);
    const result = [];

    for (let i = 0, len = source.length; i < len; i++) {
      const icon = source[i];
      if (lowerQuery && !icon.searchText.includes(lowerQuery)) { continue; }
      result.push(icon);
    }
    return result;
  }

  function renderPackDropdown() {
    const packs = Object.keys(state.iconsByPack);

    const allOption = ui.dropdownMenu.querySelector('[data-value="all"]');
    if (allOption) {
      allOption.innerHTML = `<span>All Packs</span><span class="pack-count">${state.flatIconIndex.length}</span>`;
    }

    packs.forEach(pack => {
      const option = document.createElement('div');
      option.className = 'dropdown-option';
      option.dataset.value = pack;
      option.role = 'option';
      option.ariaSelected = 'false';

      const displayName = CONFIG.PACK_DISPLAY_NAMES[pack] || pack;
      const version = CONFIG.PACK_VERSIONS?.[pack] ? ` <span style="opacity: 0.5; font-size: 0.9em;">(v${CONFIG.PACK_VERSIONS[pack]})</span>` : '';
      const count = state.iconsByPack[pack].length;
      option.innerHTML = `<span>${displayName}${version}</span><span class="pack-count">${count}</span>`;
      ui.dropdownMenu.appendChild(option);
    });
  }

  function renderIcons(query = state.currentQuery, packFilter = state.currentPackFilter) {
    state.currentQuery = query;
    state.currentPackFilter = packFilter;
    vscode.setState({ currentQuery: query, currentPackFilter: packFilter });
    state.filteredIcons = getFilteredIcons(query, packFilter);
    state.displayedCount = 0;

    ui.grid.innerHTML = '';

    if (state.filteredIcons.length === 0) {
      ui.grid.style.display = 'none';
      ui.emptyState.classList.add('visible');
      ui.iconCount.textContent = '';
    } else {
      ui.grid.style.display = 'grid';
      ui.emptyState.classList.remove('visible');
      ui.iconCount.textContent = `${state.filteredIcons.length.toLocaleString()} icons`;
      loadMoreIcons();
    }
  }

  function loadMoreIcons() {
    if (state.isLoadingMore || state.displayedCount >= state.filteredIcons.length) { return; }

    state.isLoadingMore = true;
    const fragment = document.createDocumentFragment();
    const endIndex = Math.min(state.displayedCount + CONFIG.BATCH_SIZE, state.filteredIcons.length);

    for (let i = state.displayedCount; i < endIndex; i++) {
      fragment.appendChild(createIconElement(state.filteredIcons[i]));
    }

    ui.grid.appendChild(fragment);
    state.displayedCount = endIndex;
    state.isLoadingMore = false;
  }

  function escapeHtml(unsafe) {
    if (!unsafe) { return ''; }
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function createIconElement(icon) {
    const renderer = RENDERERS[icon.pack] || (() => '<i>?</i>');
    const packDisplayName = CONFIG.PACK_DISPLAY_NAMES[icon.pack] || icon.pack;
    const safeName = escapeHtml(icon.name);

    const item = document.createElement('div');
    item.className = 'grid-item';
    item.dataset.pack = icon.pack;
    item.dataset.name = safeName;
    item.title = `${packDisplayName}: ${safeName}\nTags: ${icon.tags.join(', ')}`;
    item.innerHTML = `${renderer(safeName)}<span class="item-label">${safeName}</span>`;

    return item;
  }

  function setupDropdown() {
    const preventDefault = (e) => {
      e.preventDefault();
    };

    const preventKeys = (e) => {
      if (['ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.code)) {
        e.preventDefault();
      }
    };

    const toggleDropdown = (forceState) => {
      const isOpen = ui.dropdownWrapper.classList.toggle('open', forceState);
      document.body.classList.toggle('dropdown-active', isOpen);
      ui.dropdownToggle.setAttribute('aria-expanded', isOpen);

      if (isOpen) {
        ui.grid.addEventListener('wheel', preventDefault, { passive: false });
        ui.grid.addEventListener('touchmove', preventDefault, { passive: false });
        window.addEventListener('keydown', preventKeys, { passive: false });
      } else {
        ui.grid.removeEventListener('wheel', preventDefault);
        ui.grid.removeEventListener('touchmove', preventDefault);
        window.removeEventListener('keydown', preventKeys);
        ui.searchInput?.focus();
      }
    };

    ui.dropdownToggle.addEventListener('click', () => toggleDropdown());

    ui.dropdownToggle.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleDropdown();
      }
    });

    ui.dropdownMenu.addEventListener('click', e => {
      const option = e.target.closest('.dropdown-option');
      if (!option) { return; }

      const newPack = option.dataset.value;
      ui.dropdownLabel.textContent = option.querySelector('span').textContent;

      ui.dropdownMenu.querySelectorAll('.dropdown-option').forEach(opt => {
        const isSelected = opt.dataset.value === newPack;
        opt.classList.toggle('selected', isSelected);
        opt.setAttribute('aria-selected', isSelected);
      });

      toggleDropdown(false);
      renderIcons(ui.searchInput.value, newPack);
      ui.grid.scrollTo({ top: 0, behavior: 'instant' });
    });

    document.addEventListener('click', e => {
      if (!ui.dropdownWrapper.contains(e.target) && ui.dropdownWrapper.classList.contains('open')) {
        toggleDropdown(false);
      }
    });

    window.addEventListener('blur', () => {
      if (ui.dropdownWrapper.classList.contains('open')) {
        toggleDropdown(false);
      }
    });
  }

  function setupEventListeners() {
    ui.searchInput?.addEventListener('input', e => {
      ui.clearSearch?.classList.toggle('visible', !!e.target.value);
      clearTimeout(state.debounceTimer);
      state.debounceTimer = setTimeout(() => {
        renderIcons(e.target.value, state.currentPackFilter);
      }, CONFIG.ANIMATION_DELAY);
    });

    ui.clearSearch?.addEventListener('click', () => {
      if (ui.searchInput) {
        ui.searchInput.value = '';
        ui.clearSearch.classList.remove('visible');
        renderIcons('', state.currentPackFilter);
        ui.searchInput.focus();
      }
    });

    ui.settingsBtn?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettings' });
    });

    ui.grid.addEventListener('click', e => {
      const item = e.target.closest('.grid-item');
      if (!item) { return; }
      vscode.postMessage({
        type: 'iconSelected',
        pack: item.dataset.pack,
        name: item.dataset.name
      });
    });

    ui.grid.addEventListener('scroll', () => {
      const { scrollTop, clientHeight, scrollHeight } = ui.grid;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        loadMoreIcons();
      }
    });

  }

  init();
})();
