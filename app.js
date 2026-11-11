'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const state = { data: null, category: 'all', query: '', view: 'projects', archiveRole: 'all', archiveEntries: [], archiveRendered: 0, activeProject: null, detailRole: 'all', imageIndex: 0, lightboxEntries: [], previousHash: '#work' };
  const categoryLabels = { research: '科研相关', game: '游戏相关', robot: '机器人相关', work: '工作相关', other: '其他探索' };
  const categoryOrder = ['research', 'game', 'robot', 'work', 'other'];
  const roleLabels = { input: '输入图片', reference: '参考素材', output: '成图', iteration: '迭代版本', unclassified: '来源未标注' };
  const roleOrder = ['input', 'reference', 'iteration', 'output', 'unclassified'];
  const archivePageSize = 48;
  const mediaCache = new WeakMap();
  const detailDialog = $('#project-dialog');
  const lightbox = $('#lightbox');
  const el = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  };
  const asText = value => typeof value === 'string' ? value : '';
  const asArray = value => Array.isArray(value) ? value : [];
  const safeURL = (value, externalOnly = false) => {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const resolved = new URL(value, location.href);
      if (!['http:', 'https:', 'file:'].includes(resolved.protocol)) return '';
      if (externalOnly && !['http:', 'https:'].includes(resolved.protocol)) return '';
      return value;
    } catch (_) { return ''; }
  };
  const normalizedRole = role => Object.hasOwn(roleLabels, role) ? role : 'unclassified';
  const projectInputs = project => asArray(project?.inputs).filter(input => input && asArray(input.images).some(image => safeURL(image?.src)));
  function projectImages(project) {
    if (!project) return [];
    if (mediaCache.has(project)) return mediaCache.get(project);
    const result = [];
    const seen = new Map();
    const add = (image, fallbackRole) => {
      if (!image || !safeURL(image.src)) return;
      const role = normalizedRole(image.role || fallbackRole);
      if (seen.has(image.src)) {
        const previous = result[seen.get(image.src)];
        if (!previous._roles.includes(role)) previous._roles.push(role);
        if (previous._roles.length > 1) previous._roles = previous._roles.filter(item => item !== 'unclassified');
        if (!previous.thumb && image.thumb) previous.thumb = image.thumb;
        if (!previous.caption && image.caption) previous.caption = image.caption;
        return;
      }
      seen.set(image.src, result.length);
      result.push({ ...image, role, _roles: [role] });
    };
    asArray(project.images).forEach(image => add(image));
    projectInputs(project).forEach(input => asArray(input.images).forEach(image => add(image, 'input')));
    mediaCache.set(project, result);
    return result;
  }
  const hasRole = (media, role) => role === 'all' || asArray(media._roles).includes(role) || (!media._roles && normalizedRole(media.role) === role);
  const mediaRoleText = media => (media._roles || [normalizedRole(media.role)]).map(role => roleLabels[role]).join(' / ');
  const isVideo = media => media?.kind === 'video' || /\.(mp4|webm|mov)(?:[?#]|$)/i.test(media?.src || '');
  const coverSource = project => safeURL(project.cover) || projectImages(project)[0]?.src || '';
  const coverMedia = project => {
    const source = coverSource(project);
    return projectImages(project).find(media => media.src === source || (isVideo(media) && media.thumb === source)) || { src: source };
  };
  const pauseVideos = () => document.querySelectorAll('video').forEach(video => video.pause());
  const categoryName = id => state.data?.categories.find(category => category.id === id)?.title || categoryLabels[id] || id;
  const captionFor = (project, image, index) => asText(image.caption) || `${project.title} · 资料 ${String(index + 1).padStart(2, '0')}`;
  const createImage = (source, caption, lazy = true) => {
    const image = el('img');
    image.src = safeURL(source);
    image.alt = caption || '';
    image.loading = lazy ? 'lazy' : 'eager';
    image.decoding = 'async';
    return image;
  };
  const createVideo = (media, caption) => {
    const video = el('video');
    video.src = safeURL(media.src);
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.setAttribute('aria-label', caption || '项目视频');
    if (safeURL(media.thumb)) video.poster = safeURL(media.thumb);
    video.addEventListener('play', () => document.querySelectorAll('video').forEach(other => { if (other !== video) other.pause(); }));
    video.append(document.createTextNode('当前浏览器不支持视频播放，请使用原文件链接查看。'));
    return video;
  };
  const mediaCountText = images => {
    const videos = images.filter(isVideo).length;
    const photos = images.length - videos;
    return [photos ? `${photos} 张图片` : '', videos ? `${videos} 段视频` : ''].filter(Boolean).join(' · ') || '0 项资料';
  };
  const entriesFor = (project, images = projectImages(project)) => images.map(media => ({ project, media }));
  const projectEntries = (projects = state.data?.projects || []) => projects.flatMap(project => entriesFor(project));
  function uniqueEntries(entries) {
    const bySource = new Map();
    for (const entry of entries) {
      const source = entry.media.src;
      const roles = entry.media._roles || [normalizedRole(entry.media.role)];
      const owners = entry.projects || [entry.project];
      if (!bySource.has(source)) {
        bySource.set(source, { ...entry, media: { ...entry.media, _roles: [...new Set(roles)] }, projects: [...owners] });
        continue;
      }
      const previous = bySource.get(source);
      previous.media._roles = [...new Set([...previous.media._roles, ...roles])];
      if (!previous.media.thumb && entry.media.thumb) previous.media.thumb = entry.media.thumb;
      if (!previous.media.caption && entry.media.caption) previous.media.caption = entry.media.caption;
      if (isVideo(entry.media)) previous.media.kind = 'video';
      for (const owner of owners) {
        if (!previous.projects.some(project => project.id === owner.id)) previous.projects.push(owner);
      }
    }
    return [...bySource.values()];
  }
  const allEntries = (projects = state.data?.projects || []) => uniqueEntries(projectEntries(projects));
  const setModalBody = () => document.body.classList.toggle('modal-open', detailDialog.open || lightbox.open);
  const searchText = project => [project.title, project.subtitle, project.background, ...asArray(project.methods), ...asArray(project.outputs), categoryName(project.category)].filter(Boolean).join(' ').toLocaleLowerCase();
  const textMatches = text => !state.query || state.query.split(/\s+/).every(term => text.toLocaleLowerCase().includes(term));
  const categoryMatches = project => state.category === 'all' || project.category === state.category;


  // Keep DOM order (1, 2, 3...) while packing natural-height cards into rows.
  // Grid items align to start, so their measured height never depends on span.
  const masonryGrids = new Set();
  const masonryOwners = new Map();
  const masonryPending = new Set();
  const masonryListening = new WeakSet();
  let masonryFrame = 0;
  const masonryObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    for (const entry of entries) queueMasonry(masonryGrids.has(entry.target) ? entry.target : masonryOwners.get(entry.target));
  }) : null;

  function pruneMasonry() {
    for (const [item, grid] of masonryOwners) {
      if (!item.isConnected || !grid.isConnected || item.parentElement !== grid) {
        masonryObserver?.unobserve(item); masonryOwners.delete(item);
      }
    }
    for (const grid of masonryGrids) {
      if (!grid.isConnected) { masonryObserver?.unobserve(grid); masonryGrids.delete(grid); masonryPending.delete(grid); }
    }
  }

  function layoutMasonry(grid) {
    if (!grid?.isConnected || grid.getBoundingClientRect().width === 0) return;
    const style = getComputedStyle(grid);
    const columns = Number(style.getPropertyValue('--masonry-columns')) || 1;
    grid.classList.toggle('masonry-active', columns > 1);
    if (columns <= 1) {
      for (const item of grid.children) if (item.style.gridRowEnd) item.style.gridRowEnd = '';
      return;
    }
    const unit = parseFloat(style.getPropertyValue('--masonry-row-size')) || 8;
    // Read all natural sizes before writing placement to avoid layout thrashing.
    const spans = Array.from(grid.children, item => [item, Math.max(1, Math.ceil(item.getBoundingClientRect().height / unit))]);
    for (const [item, span] of spans) {
      const value = `span ${span}`;
      if (item.style.gridRowEnd !== value) item.style.gridRowEnd = value;
    }
  }

  function queueMasonry(grid) {
    if (!grid?.isConnected) return;
    masonryPending.add(grid);
    if (masonryFrame) return;
    masonryFrame = requestAnimationFrame(() => {
      masonryFrame = 0;
      const pending = [...masonryPending]; masonryPending.clear();
      for (const current of pending) layoutMasonry(current);
    });
  }

  function setupMasonry(grid) {
    if (!grid) return;
    pruneMasonry();
    if (!masonryGrids.has(grid)) { masonryGrids.add(grid); masonryObserver?.observe(grid); }
    for (const item of grid.children) {
      if (masonryOwners.get(item) !== grid) { masonryOwners.set(item, grid); masonryObserver?.observe(item); }
    }
    if (!masonryListening.has(grid)) {
      grid.addEventListener('load', () => queueMasonry(grid), true);
      grid.addEventListener('loadedmetadata', () => queueMasonry(grid), true);
      masonryListening.add(grid);
    }
    queueMasonry(grid);
  }

  function renderHero() {
    const data = state.data;
    if (data.name) { $('#brand-name').textContent = data.name; document.title = `${data.name} — AIGC 视觉与设计实践`; }
    if (data.intro) $('#hero-intro').textContent = data.intro;
    const available = data.projects.filter(project => coverSource(project) && !isVideo(coverMedia(project)));
    const selected = [];
    const preferences = { robot: ['warehouse-promotion', 'robot-promo-library'] };
    for (const category of ['research', 'robot', 'game', 'work', 'other']) {
      const preferred = (preferences[category] || []).map(id => available.find(item => item.id === id && item.category === category)).find(Boolean);
      const project = preferred || available.find(item => item.category === category && !selected.includes(item));
      if (project) selected.push(project);
      if (selected.length === 3) break;
    }
    for (const project of available) { if (selected.length === 3) break; if (!selected.includes(project)) selected.push(project); }
    if (!selected.length) return;
    const hero = $('#hero-art');
    hero.replaceChildren();
    selected.forEach((project, index) => {
      const tile = el('button', 'hero-tile');
      tile.type = 'button';
      tile.setAttribute('aria-label', `查看项目：${project.title}`);
      const image = createImage(coverSource(project), project.title, false);
      if (index === 0) image.fetchPriority = 'high';
      image.addEventListener('load', () => { if (image.naturalHeight > image.naturalWidth * 1.2 || project.coverFit === 'contain') tile.classList.add('poster'); });
      tile.append(image, el('span', 'hero-tile-label', `${String(index + 1).padStart(2, '0')} / ${categoryName(project.category)}`));
      tile.addEventListener('click', () => openProject(project));
      hero.append(tile);
    });
    if (selected.length === 1) hero.style.display = 'block';
    if (selected.length === 2) hero.lastElementChild.style.gridRow = 'span 2';
  }

  function renderFilters() {
    if (!state.data) return;
    const filters = $('#filters');
    filters.replaceChildren();
    const choices = [{ id: 'all', title: state.view === 'media' ? '全部主题' : '全部作品' }, ...state.data.categories];
    choices.forEach(category => {
      const projects = state.data.projects.filter(project => category.id === 'all' || project.category === category.id);
      const count = state.view === 'media' ? allEntries(projects).length : projects.length;
      const button = el('button', 'filter-tab');
      button.type = 'button';
      button.dataset.category = category.id;
      button.setAttribute('aria-pressed', String(state.category === category.id));
      button.append(el('span', '', category.title), el('span', 'tab-count', String(count).padStart(2, '0')));
      button.addEventListener('click', () => {
        state.category = category.id;
        renderFilters(); renderCurrentView();
        $('#filters [aria-pressed="true"]').focus({ preventScroll: true });
      });
      filters.append(button);
    });
  }

  function renderRoleFilters(container, images, selected, onChange) {
    container.replaceChildren();
    const choices = [{ id: 'all', title: '全部来源' }, ...roleOrder.filter(role => role !== 'unclassified' || images.some(image => hasRole(image, role))).map(id => ({ id, title: roleLabels[id] }))];
    choices.forEach(choice => {
      const count = images.filter(image => hasRole(image, choice.id)).length;
      const button = el('button', 'role-filter');
      button.type = 'button';
      button.setAttribute('aria-pressed', String(selected === choice.id));
      button.append(el('span', '', choice.title), el('span', 'role-count', count));
      button.addEventListener('click', () => onChange(choice.id));
      container.append(button);
    });
  }

  function createCard(project, index) {
    const card = el('article', 'project-card');
    const source = coverSource(project);
    const images = projectImages(project);
    const media = coverMedia(project);
    const videoCover = isVideo(media);
    const imageButton = el(videoCover ? 'div' : 'button', `card-image-btn${videoCover ? ' video-card' : ''}`);
    if (!videoCover) imageButton.type = 'button';
    imageButton.setAttribute('aria-label', videoCover ? `${project.title} 视频预览` : `打开项目：${project.title}`);
    if (source && videoCover) imageButton.append(createVideo(media, project.title), el('span', 'card-image-count', mediaCountText(images)));
    else if (source) {
      const image = createImage(source, project.title);
      image.addEventListener('load', () => { if (project.coverFit === 'contain' || image.naturalHeight > image.naturalWidth * 1.08) imageButton.classList.add('contain'); });
      imageButton.append(image);
      if (images.length) imageButton.append(el('span', 'card-image-count', mediaCountText(images)));
    } else {
      const placeholder = el('div', 'card-visual-placeholder');
      placeholder.append(el('span', 'placeholder-type', `${categoryName(project.category)} / PROJECT`), el('strong', '', project.title), el('small', '', '项目记录 · 图像资料待补充'));
      imageButton.append(placeholder);
    }
    if (!videoCover) imageButton.addEventListener('click', () => openProject(project));
    const meta = el('div', 'card-meta');
    const info = el('div', 'card-info');
    const title = el('button', 'card-title', project.title);
    title.type = 'button';
    title.addEventListener('click', () => openProject(project));
    const heading = el('h4'); heading.style.margin = '0'; heading.append(title); info.append(heading);
    if (project.subtitle) info.append(el('p', 'card-subtitle', project.subtitle));
    meta.append(el('span', 'card-number', String(index + 1).padStart(2, '0')), info, el('span', 'card-arrow', '↗'));
    card.append(imageButton, meta);
    return card;
  }

  function renderProjects() {
    const projects = state.data.projects.filter(project => categoryMatches(project) && textMatches(searchText(project)));
    $('#result-announcement').textContent = `当前展示 ${projects.length} 个项目`;
    const root = $('#project-sections'); root.replaceChildren(); pruneMasonry();
    if (!projects.length) {
      const empty = el('div', 'empty-results');
      empty.append(el('strong', '', '还没有匹配的项目'), el('p', '', '试试其他关键词，或回到全部作品。'));
      const reset = el('button', '', '查看全部作品'); reset.type = 'button';
      reset.addEventListener('click', () => { state.query = ''; state.category = 'all'; $('#search').value = ''; renderFilters(); renderCurrentView(); });
      empty.append(reset); root.append(empty); return;
    }
    state.data.categories.forEach((category, index) => {
      const items = projects.filter(project => project.category === category.id);
      if (!items.length) return;
      const section = el('section', 'project-section'); section.setAttribute('aria-labelledby', `category-${category.id}`);
      const heading = el('div', 'category-heading'); const title = el('h3', '', category.title); title.id = `category-${category.id}`;
      heading.append(el('span', 'category-number', String(index + 1).padStart(2, '0')), title);
      if (category.subtitle) heading.append(el('p', '', category.subtitle));
      const grid = el('div', 'project-grid');
      items.forEach(project => grid.append(createCard(project, state.data.projects.indexOf(project))));
      section.append(heading, grid); root.append(section); setupMasonry(grid);
    });
  }

  function createMediaFigure(entry, index, entries, archive = false) {
    const { project, media } = entry;
    const figure = el('figure', `detail-figure${archive ? ' archive-figure' : ''}`);
    const video = isVideo(media);
    const content = el(video ? 'div' : 'button', `detail-image-btn${video ? ' video-frame' : ''}`);
    const caption = captionFor(project, media, index);
    if (video) content.append(createVideo(media, caption));
    else {
      content.type = 'button'; content.setAttribute('aria-label', `放大查看：${caption}`);
      content.append(createImage(safeURL(media.thumb) || media.src, caption));
      content.addEventListener('click', () => openLightbox(index, entries));
    }
    const figcaption = el('figcaption');
    figcaption.append(el('span', 'figure-num', String(index + 1).padStart(2, '0')), el('span', 'media-caption', caption));
    if (video) {
      const expand = el('button', 'video-expand', '放大观看 ↗'); expand.type = 'button';
      expand.addEventListener('click', () => openLightbox(index, entries)); figcaption.append(expand);
    }
    const meta = el('div', 'media-source-row');
    meta.append(el('span', 'source-label', mediaRoleText(media)));
    if (archive) {
      for (const owner of entry.projects || [project]) {
        const projectLink = el('button', 'media-project-link', `${owner.title} ↗`); projectLink.type = 'button';
        projectLink.addEventListener('click', () => openProject(owner)); meta.append(projectLink);
      }
    }
    figure.append(content, figcaption, meta);
    return figure;
  }

  function renderArchive() {
    if (!state.data) return;
    const all = allEntries();
    // Filter original project associations before exact-src deduplication, so
    // a shared asset remains visible under every associated theme and role.
    const matchingAssociations = projectEntries().filter(entry => categoryMatches(entry.project) && textMatches(`${searchText(entry.project)} ${entry.media.caption || ''}`));
    const relevant = uniqueEntries(matchingAssociations);
    renderRoleFilters($('#archive-role-filters'), relevant.map(entry => entry.media), state.archiveRole, role => { state.archiveRole = role; pauseVideos(); renderArchive(); $('#archive-role-filters [aria-pressed="true"]')?.focus({ preventScroll: true }); });
    state.archiveEntries = uniqueEntries(matchingAssociations.filter(entry => hasRole(entry.media, state.archiveRole)));
    state.archiveRendered = 0;
    $('#archive-grid').replaceChildren();
    $('#archive-total').textContent = `全部已收录资料：${mediaCountText(all.map(entry => entry.media))}`;
    if (!state.archiveEntries.length) $('#archive-grid').append(el('p', 'gallery-empty', '当前条件下没有资料，请调整主题、来源或关键词。'));
    appendArchivePage();
  }

  function appendArchivePage() {
    const entries = state.archiveEntries;
    const end = Math.min(state.archiveRendered + archivePageSize, entries.length);
    const fragment = document.createDocumentFragment();
    for (let index = state.archiveRendered; index < end; index++) fragment.append(createMediaFigure(entries[index], index, entries, true));
    $('#archive-grid').append(fragment); state.archiveRendered = end; setupMasonry($('#archive-grid'));
    $('#archive-progress').textContent = `已显示 ${end} / ${entries.length} 项匹配资料${state.archiveRole === 'all' ? ' · 全部来源' : ` · ${roleLabels[state.archiveRole]}`}`;
    $('#result-announcement').textContent = `全部图像视图，已显示 ${end} 项，当前条件共 ${entries.length} 项`;
    $('#archive-more').hidden = end >= entries.length;
    $('#archive-more').textContent = `加载接下来的 ${Math.min(archivePageSize, entries.length - end)} 项 ↓`;
    $('#archive-complete').textContent = end >= entries.length && entries.length ? `已显示当前条件下的全部 ${entries.length} 项资料。` : '';
  }

  function setView(view, updateHash = true) {
    state.view = view;
    if (updateHash) history.replaceState(null, '', view === 'media' ? '#images' : '#work');
    $('#view-projects').setAttribute('aria-pressed', String(view === 'projects'));
    $('#view-all-media').setAttribute('aria-pressed', String(view === 'media'));
    $('#project-sections').hidden = view !== 'projects';
    $('#all-media-section').hidden = view !== 'media';
    renderFilters(); renderCurrentView();
  }

  function renderCurrentView() {
    if (!state.data) return;
    pauseVideos();
    const entries = allEntries();
    $('#collection-count').textContent = `${state.data.categories.length} 个主题 / ${state.data.projects.length} 个项目 / ${mediaCountText(entries.map(entry => entry.media))}`;
    $('#all-media-count').textContent = entries.length;
    if (state.view === 'media') renderArchive(); else renderProjects();
  }

  function detailBlock(title, content, list = false) {
    const section = el('section', 'detail-block'); section.append(el('h3', '', title));
    if (list && asArray(content).length) { const ul = el('ul'); content.forEach(item => ul.append(el('li', '', item))); section.append(ul); }
    else { const text = asText(content) || '待补充'; section.append(el('p', text.includes('待补充') ? 'pending' : '', text)); }
    return section;
  }

  function renderDetailGallery(project, container) {
    container.replaceChildren();
    const images = projectImages(project);
    const visible = images.filter(image => hasRole(image, state.detailRole));
    const header = el('div', 'gallery-header');
    header.append(el('h3', '', '全量图像与过程'), el('p', '', `${visible.length} / ${images.length} 项 · ${mediaCountText(visible)}`));
    container.append(header);
    const filters = el('div', 'role-filters detail-role-filters'); filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', '按项目资料来源筛选');
    renderRoleFilters(filters, images, state.detailRole, role => {
      state.detailRole = role; pauseVideos(); renderDetailGallery(project, container);
      container.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
    });
    container.append(filters);
    if (!visible.length) { container.append(el('p', 'gallery-empty', images.length ? '当前来源下没有资料，请切换来源。' : '相关图像与视频资料待补充。')); return; }
    const gallery = el('div', 'detail-gallery'); const entries = entriesFor(project, visible);
    entries.forEach((entry, index) => gallery.append(createMediaFigure(entry, index, entries)));
    container.append(gallery);
  }

  function openProject(project, updateHash = true) {
    pauseVideos(); state.activeProject = project; state.detailRole = 'all';
    const images = projectImages(project);
    $('#detail-category').textContent = categoryName(project.category);
    const root = $('#project-detail'); root.replaceChildren();
    const heading = el('header', 'detail-heading'); heading.append(el('p', 'eyebrow', `${categoryName(project.category)} / ${project.status || '项目实践'}`));
    const title = el('h2', '', project.title); title.id = 'project-title'; heading.append(title);
    if (project.subtitle) heading.append(el('p', 'detail-subtitle', project.subtitle));
    root.append(heading);
    const source = coverSource(project);
    if (source && isVideo(coverMedia(project))) {
      const cover = el('div', 'detail-cover video-cover'); cover.append(createVideo(coverMedia(project), project.title)); root.append(cover);
    } else if (source) {
      const cover = el('button', 'detail-cover'); cover.type = 'button'; cover.setAttribute('aria-label', '放大查看项目封面'); cover.append(createImage(source, project.title, false));
      cover.addEventListener('click', () => { const index = images.findIndex(image => image.src === source); if (images.length) openLightbox(Math.max(0, index), entriesFor(project)); });
      if (!images.length) cover.disabled = true; root.append(cover);
    }
    const summary = el('div', 'detail-summary'); const outputBlock = detailBlock('03 / 具体产出', project.outputs, true);
    const links = asArray(project.links).filter(link => safeURL(link.url, true));
    if (links.length) {
      const linkContainer = el('div', 'detail-links');
      links.forEach(link => { const a = el('a', '', `${link.label || '相关链接'} ↗`); a.href = safeURL(link.url, true); a.target = '_blank'; a.rel = 'noopener noreferrer'; linkContainer.append(a); });
      outputBlock.append(linkContainer);
    }
    summary.append(detailBlock('01 / 项目背景', project.background), detailBlock(`02 / ${asText(project.methodsTitle) || '我的执行方式'}`, project.methods, true), outputBlock); root.append(summary);
    if (project.note) root.append(el('p', 'detail-note', project.note));
    const gallerySection = el('section', 'project-media-section'); root.append(gallerySection); renderDetailGallery(project, gallerySection);
    const end = el('div', 'detail-end'); const closeButton = el('button', '', '返回浏览 ↑'); closeButton.type = 'button'; closeButton.addEventListener('click', () => closeProject());
    end.append(el('span', '', `${categoryName(project.category)} / ${project.title}`), closeButton); root.append(end);
    if (updateHash) { state.previousHash = location.hash.startsWith('#project=') ? (state.view === 'media' ? '#images' : '#work') : location.hash || '#work'; history.pushState(null, '', `#project=${encodeURIComponent(project.id)}`); }
    if (!detailDialog.open) detailDialog.showModal(); detailDialog.scrollTop = 0; setModalBody();
  }

  function closeProject(updateHash = true) {
    pauseVideos(); if (lightbox.open) lightbox.close(); if (detailDialog.open) detailDialog.close();
    if (updateHash && location.hash.startsWith('#project=')) history.replaceState(null, '', state.previousHash || '#work');
    state.activeProject = null; setModalBody();
  }

  function openLightbox(index, entries = entriesFor(state.activeProject)) {
    if (!entries.length) return;
    pauseVideos(); state.imageIndex = index; state.lightboxEntries = entries;
    if (!lightbox.open) lightbox.showModal(); renderLightbox(); setModalBody();
  }

  function renderLightbox() {
    const entries = state.lightboxEntries;
    state.imageIndex = Math.max(0, Math.min(entries.length - 1, state.imageIndex));
    const entry = entries[state.imageIndex]; if (!entry) return;
    const { project, media } = entry;
    const caption = captionFor(project, media, state.imageIndex);
    const video = $('#lightbox-video'); video.pause(); const image = $('#lightbox-image'); const videoMode = isVideo(media);
    image.hidden = videoMode; video.hidden = !videoMode;
    if (videoMode) { video.src = safeURL(media.src); video.poster = safeURL(media.thumb) || ''; video.setAttribute('aria-label', caption); image.removeAttribute('src'); }
    else { video.removeAttribute('src'); video.load(); image.src = safeURL(media.src); image.alt = caption; }
    $('#lightbox-original').textContent = videoMode ? '查看视频原文件 ↗' : '查看原尺寸 ↗';
    $('#lightbox-caption').textContent = `${mediaRoleText(media)} · ${caption}`;
    const owners = entry.projects || [project];
    const ownership = owners.length > 1 ? `${project.title} · 关联 ${owners.length} 个项目` : project.title;
    $('#lightbox-count').textContent = `${String(state.imageIndex + 1).padStart(2, '0')} / ${String(entries.length).padStart(2, '0')} — ${ownership}`;
    $('#lightbox-original').href = safeURL(media.src);
    $('#lightbox-project').hidden = detailDialog.open && state.activeProject?.id === project.id;
    $('#lightbox-project').textContent = owners.length > 1 ? '查看首个所属项目 ↗' : '查看所属项目 ↗';
    $('#lightbox-project').title = owners.map(owner => owner.title).join(' / ');
    $('#lightbox-prev').disabled = state.imageIndex === 0; $('#lightbox-next').disabled = state.imageIndex === entries.length - 1;
    const thumbs = $('#lightbox-thumbnails'); thumbs.replaceChildren();
    const start = Math.max(0, Math.min(state.imageIndex - 6, entries.length - 13)); const end = Math.min(entries.length, start + 13);
    for (let index = start; index < end; index++) {
      const current = entries[index].media; const button = el('button', 'lightbox-thumb'); button.type = 'button';
      button.setAttribute('aria-label', `查看第 ${index + 1} 项${isVideo(current) ? '视频' : '图片'}`); button.setAttribute('aria-current', String(index === state.imageIndex));
      if (isVideo(current)) { if (safeURL(current.thumb)) button.append(createImage(current.thumb, '')); button.append(el('span', 'video-thumb-mark', '▶')); }
      else button.append(createImage(safeURL(current.thumb) || current.src, ''));
      button.append(el('span', 'thumb-index', index + 1));
      button.addEventListener('click', () => { state.imageIndex = index; renderLightbox(); }); thumbs.append(button);
    }
    thumbs.querySelector('[aria-current="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function closeLightbox() { $('#lightbox-video').pause(); lightbox.close(); setModalBody(); }

  function route() {
    if (!state.data) return;
    if (location.hash.startsWith('#project=')) {
      let id; try { id = decodeURIComponent(location.hash.slice(9)); } catch (_) { return; }
      const project = state.data.projects.find(item => item.id === id); if (project) openProject(project, false);
    } else {
      if (detailDialog.open) closeProject(false);
      if (location.hash === '#images') { setView('media', false); $('#work').scrollIntoView({ behavior: 'smooth' }); }
      else if (location.hash === '#work' && state.view !== 'projects') setView('projects', false);
    }
  }

  $('.close-detail').addEventListener('click', () => closeProject());
  $('#detail-back').addEventListener('click', event => { event.preventDefault(); closeProject(); });
  detailDialog.addEventListener('cancel', event => { event.preventDefault(); closeProject(); }); detailDialog.addEventListener('close', setModalBody);
  $('#lightbox-close').addEventListener('click', closeLightbox);
  lightbox.addEventListener('cancel', event => { event.preventDefault(); closeLightbox(); }); lightbox.addEventListener('close', setModalBody);
  $('#lightbox-project').addEventListener('click', () => { const entry = state.lightboxEntries[state.imageIndex]; closeLightbox(); if (entry) openProject(entry.project); });
  $('#lightbox-prev').addEventListener('click', () => { state.imageIndex--; renderLightbox(); });
  $('#lightbox-next').addEventListener('click', () => { state.imageIndex++; renderLightbox(); });
  $('#search').addEventListener('input', event => { state.query = event.target.value.trim().toLocaleLowerCase(); renderCurrentView(); });
  $('#view-projects').addEventListener('click', () => setView('projects'));
  $('#view-all-media').addEventListener('click', () => setView('media'));
  $('#archive-more').addEventListener('click', appendArchivePage);
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => { for (const grid of masonryGrids) queueMasonry(grid); });
  document.addEventListener('keydown', event => {
    const isInput = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    if (lightbox.open && document.activeElement?.tagName !== 'VIDEO') {
      if (event.key === 'ArrowLeft') { event.preventDefault(); state.imageIndex--; renderLightbox(); }
      if (event.key === 'ArrowRight') { event.preventDefault(); state.imageIndex++; renderLightbox(); }
      if (event.key === 'Home') { event.preventDefault(); state.imageIndex = 0; renderLightbox(); }
      if (event.key === 'End') { event.preventDefault(); state.imageIndex = state.lightboxEntries.length - 1; renderLightbox(); }
    } else if (event.key === '/' && !isInput && !detailDialog.open && !lightbox.open) { event.preventDefault(); $('#search').focus(); $('#work').scrollIntoView({ behavior: 'smooth' }); }
  });

  $('#all-media-section .archive-intro p').textContent = '输入图片、参考素材、迭代版本与成图，按项目追溯。';

  fetch('assets/portfolio.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }).then(data => {
    const projects = asArray(data.projects).filter(project => project && asText(project.id) && asText(project.title));
    let categories = asArray(data.categories).filter(category => category && asText(category.id));
    if (!categories.length) categories = categoryOrder.map(id => ({ id, title: categoryLabels[id], subtitle: '' }));
    categories = categories.map(category => ({ ...category, title: category.title || categoryLabels[category.id] || category.id }));
    for (const project of projects) if (!categories.some(category => category.id === project.category)) categories.push({ id: project.category, title: categoryLabels[project.category] || project.category, subtitle: '' });
    state.data = { ...data, categories, projects }; renderHero(); setView(location.hash === '#images' ? 'media' : 'projects', false); route();
  }).catch(() => { $('#project-sections').replaceChildren(el('p', 'empty-results', '作品资料暂时未能载入，请刷新页面重试。')); $('#collection-count').textContent = ''; });
})();
