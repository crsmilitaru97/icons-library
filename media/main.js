(function () {
  const vscode = acquireVsCodeApi();

  const CONFIG = {
    BATCH_SIZE: 200,
    ANIMATION_DELAY: 150,
    PACK_DISPLAY_NAMES: {
      all: 'All Packs',
      codicons: 'Codicons',
      fontawesome: 'Font Awesome Free',
      'fontawesome-brands': 'Font Awesome Brands',
      primeicons: 'Prime Icons',
      bootstrap: 'Bootstrap Icons',
      'material-symbols': 'Material Symbols'
    }
  };

  const faRenderer = (cls) => name => `<i class="${cls} ${name.startsWith('fa-') ? name : 'fa-' + name}"></i>`;

  const RENDERERS = {
    codicons: name => `<i class="codicon codicon-${name}"></i>`,
    primeicons: name => `<i class="pi pi-${name}"></i>`,
    fontawesome: faRenderer('fa-solid'),
    'fontawesome-brands': faRenderer('fa-brands'),
    bootstrap: name => `<i class="bi bi-${name}"></i>`,
    'material-symbols': name => `<span class="material-symbols-outlined">${name === 'cross' ? 'close' : name}</span>`
  };

  const state = {
    iconsByPack: {},
    flatIconIndex: [],
    currentQuery: '',
    currentPackFilter: 'all',
    filteredIcons: [],
    displayedCount: 0,
    isLoadingMore: false,
    debounceTimer: null
  };

  const ui = {
    grid: document.getElementById('icons-grid'),
    settingsBtn: document.getElementById('settings-btn'),
    searchInput: document.getElementById('search-input'),
    loading: document.getElementById('loading'),
    emptyState: document.getElementById('empty-state'),
    dropdownWrapper: document.getElementById('pack-dropdown'),
    dropdownToggle: document.querySelector('.dropdown-toggle'),
    dropdownLabel: document.querySelector('.dropdown-label'),
    dropdownMenu: document.querySelector('.dropdown-menu'),
    iconCount: document.getElementById('icon-count')
  };

  function init() {
    loadData();
    setupDropdown();
    setupEventListeners();

    if (ui.loading) { ui.loading.style.display = 'none'; }
    renderIcons();

    requestAnimationFrame(() => {
      document.body.classList.remove('preload');
      ui.searchInput?.focus();
    });
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
    } catch {
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

    packs.forEach(pack => {
      const option = document.createElement('div');
      option.className = 'dropdown-option';
      option.dataset.value = pack;
      option.role = 'option';
      option.ariaSelected = 'false';

      const displayName = CONFIG.PACK_DISPLAY_NAMES[pack] || pack;
      option.innerHTML = `<span>${displayName}</span>`;
      ui.dropdownMenu.appendChild(option);
    });
  }

  function renderIcons(query = state.currentQuery, packFilter = state.currentPackFilter) {
    state.currentQuery = query;
    state.currentPackFilter = packFilter;
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

  function createIconElement(icon) {
    const renderer = RENDERERS[icon.pack] || (() => '<i>?</i>');
    const packDisplayName = CONFIG.PACK_DISPLAY_NAMES[icon.pack] || icon.pack;

    const item = document.createElement('div');
    item.className = 'icon-item';
    item.dataset.pack = icon.pack;
    item.dataset.name = icon.name;
    item.title = `${packDisplayName}: ${icon.name}\nTags: ${icon.tags.join(', ')}`;
    item.innerHTML = `${renderer(icon.name)}<span class="icon-name">${icon.name}</span>`;

    return item;
  }

  function setupDropdown() {
    const toggleDropdown = (forceState) => {
      const isOpen = ui.dropdownWrapper.classList.toggle('open', forceState);
      ui.dropdownToggle.setAttribute('aria-expanded', isOpen);
      if (!isOpen) { ui.searchInput?.focus(); }
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
      ui.dropdownLabel.textContent = option.querySelector('span:last-child').textContent;

      ui.dropdownMenu.querySelectorAll('.dropdown-option').forEach(opt => {
        const isSelected = opt.dataset.value === newPack;
        opt.classList.toggle('selected', isSelected);
        opt.setAttribute('aria-selected', isSelected);
      });

      toggleDropdown(false);
      renderIcons(ui.searchInput.value, newPack);
    });

    document.addEventListener('click', e => {
      if (!ui.dropdownWrapper.contains(e.target) && ui.dropdownWrapper.classList.contains('open')) {
        toggleDropdown(false);
      }
    });
  }

  function setupEventListeners() {
    ui.searchInput?.addEventListener('input', e => {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = setTimeout(() => {
        renderIcons(e.target.value, state.currentPackFilter);
      }, CONFIG.ANIMATION_DELAY);
    });

    ui.settingsBtn?.addEventListener('click', () => {
      vscode.postMessage({ type: 'openSettings' });
    });

    ui.grid.addEventListener('click', e => {
      const item = e.target.closest('.icon-item');
      if (!item) { return; }
      vscode.postMessage({
        type: 'iconSelected',
        pack: item.dataset.pack,
        name: item.dataset.name
      });
    });

    window.addEventListener('scroll', () => {
      const { scrollY, innerHeight } = window;
      const { scrollHeight } = document.documentElement;
      if (scrollY + innerHeight >= scrollHeight - 100) {
        loadMoreIcons();
      }
    });
  }
  init();
})();
