/* Curatora — standalone script (no build step needed).
   Data: The Met Collection API — https://metmuseum.github.io/
   Search uses the paginated v1.1 endpoint; object records live under v1. */

const API = 'https://collectionapi.metmuseum.org/public/collection'

const DEPARTMENTS = [
  { label: 'All', id: null },
  { label: 'Painting', id: 11 },
  { label: 'Sculpture', id: 13 },
  { label: 'Decorative Arts', id: 12 },
  { label: 'Photography', id: 19 },
  { label: 'Asian Art', id: 6 },
  { label: 'Egyptian Art', id: 10 },
]

const FEATURED_ARTISTS = [
  'Vincent van Gogh', 'Johannes Vermeer', 'Rembrandt', 'Edgar Degas',
  'Paul Cézanne', 'Katsushika Hokusai', 'Auguste Renoir', 'Edouard Manet',
  'Jacques Louis David', 'Pieter Bruegel the Elder', 'Winslow Homer', 'John Singer Sargent',
]

/* ---------- Icons ---------- */
const svg = (paths, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
const ICON = {
  arrow: (s) => svg('<path d="M5 12h14M13 6l6 6-6 6"/>', s),
  arrowUpRight: (s) => svg('<path d="M7 17 17 7M8 7h9v9"/>', s),
  expand: (s) => svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', s),
  search: (s) => svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', s),
  building: (s) => svg('<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6"/>', s),
  brush: (s) => svg('<path d="M18.4 2.6a2 2 0 0 1 2.9 2.9L12 14.8 9.2 12l9.2-9.4Z"/><path d="M9 14c-2 0-4 1.5-4 4 0 1.2-.8 2-2 2 2.5 1.5 8 1 8-3.5"/>', s),
  ruler: (s) => svg('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h4M3 15h4M9 3v4M15 3v4"/>', s),
  pin: (s) => svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>', s),
  gift: (s) => svg('<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M12 8v13M3 12h18M12 8s-1.5-5-4.5-5a2.5 2.5 0 0 0 0 5M12 8s1.5-5 4.5-5a2.5 2.5 0 0 1 0 5"/>', s),
}

/* ---------- Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel)
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const short = (s, max = 70) => (s.length > max ? s.slice(0, max).trimEnd() + '…' : s)
const normalize = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const params = new URLSearchParams(location.search)

const link = {
  explore: (q, dept, page = 1) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (dept) p.set('dept', dept)
    if (page > 1) p.set('page', page)
    return 'explore.html' + (p.toString() ? '?' + p : '')
  },
  artwork: (id) => `artwork.html?id=${id}`,
  artist: (name) => (name ? `artist.html?name=${encodeURIComponent(name)}` : 'artist.html'),
}

/* ---------- API ---------- */
const objectCache = new Map()
let active = 0
const waiting = []

// Keep concurrent requests modest; the API rate-limits bursts.
async function limited(fn) {
  if (active >= 8) await new Promise((r) => waiting.push(r))
  active++
  try {
    return await fn()
  } finally {
    active--
    const next = waiting.shift()
    if (next) next()
  }
}

async function searchObjects({ q = '', departmentId, isHighlight, artistOrCulture, offset = 0, limit = 24 }) {
  const p = new URLSearchParams({ q: q.trim() || '*', hasImages: 'true', offset, limit })
  if (departmentId) p.set('departmentId', departmentId)
  if (isHighlight) p.set('isHighlight', 'true')
  if (artistOrCulture) p.set('artistOrCulture', 'true')
  const res = await fetch(`${API}/v1.1/search?${p}`)
  if (!res.ok) throw new Error('Search failed')
  const data = await res.json()
  return { total: data.total || 0, objectIDs: data.objectIDs || [] }
}

function getObject(id) {
  if (!objectCache.has(id)) {
    objectCache.set(
      id,
      limited(async () => {
        const res = await fetch(`${API}/v1/objects/${id}`)
        return res.ok ? res.json() : null
      }).catch(() => null),
    )
  }
  return objectCache.get(id)
}

async function getObjectsWithImages(ids) {
  const objs = await Promise.all(ids.map(getObject))
  return objs.filter((o) => o && o.primaryImageSmall)
}

/** artistOrCulture search is broad; keep works whose credited artist matches the name. */
async function worksBy(name, offset, limit) {
  const res = await searchObjects({ q: name, artistOrCulture: true, offset, limit })
  const objs = await getObjectsWithImages(res.objectIDs)
  const words = normalize(name).split(' ').filter((w) => w.length > 2)
  const key = words[words.length - 1] || normalize(name)
  const matching = objs.filter((o) => normalize(o.artistDisplayName).includes(key))
  return { total: res.total, fetched: res.objectIDs.length, works: matching.length ? matching : objs }
}

/* ---------- Shared templates ---------- */
function card(o, variant = '') {
  const by = o.artistDisplayName || o.culture || o.department
  return `
    <a class="card ${variant}" href="${link.artwork(o.objectID)}">
      <div class="card-media"><img src="${esc(o.primaryImageSmall)}" alt="${esc(o.title)}" loading="lazy" /></div>
      <h3>${esc(short(o.title))}</h3>
      <p>${esc(by)}${o.objectDate ? `<span> · ${esc(o.objectDate)}</span>` : ''}</p>
    </a>`
}

const skeletons = (n, mixed = true) =>
  Array.from(
    { length: n },
    (_, i) => `<div class="skeleton ${mixed && i % 3 === 0 ? 'tall' : ''}"><div class="block"></div><div class="line"></div><div class="line short"></div></div>`,
  ).join('')

const notice = (title, body = '') => `<div class="notice"><h2>${esc(title)}</h2>${body ? `<p>${body}</p>` : ''}</div>`

/* ---------- Header ---------- */
function initHeader() {
  const page = document.body.dataset.page
  document.querySelectorAll(`[data-nav="${page}"]`).forEach((a) => {
    a.classList.add('active')
    a.setAttribute('aria-current', 'page')
  })
  const toggle = $('.menu-toggle')
  const mobile = $('.mobile-nav')
  toggle?.addEventListener('click', () => {
    const open = mobile.classList.toggle('open')
    toggle.setAttribute('aria-expanded', open)
  })
  const year = $('#year')
  if (year) year.textContent = new Date().getFullYear()
}

/* ---------- Home ---------- */
async function initHome() {
  const grid = $('#highlights-grid')
  grid.innerHTML = skeletons(4, false)
  try {
    // A random window over the paintings highlights keeps the page fresh.
    const offset = Math.floor(Math.random() * 60)
    const res = await searchObjects({ departmentId: 11, isHighlight: true, offset, limit: 12 })
    const objs = await getObjectsWithImages(res.objectIDs)
    grid.innerHTML = objs.slice(0, 4).map((o) => card(o, 'cover')).join('')
  } catch {
    $('#highlights').hidden = true
  }
}

/* ---------- Explore ---------- */
function initExplore() {
  const pageSize = 9
  // v1.1 only allows offset + limit values up to 10,000.
  const maxPage = 1111
  const state = {
    q: params.get('q') || '',
    dept: Number(params.get('dept')) || null,
    page: Math.min(Math.max(Number(params.get('page')) || 1, 1), maxPage),
    total: 0,
    request: 0,
  }
  const form = $('#search-form')
  const input = $('#q')
  const clear = $('#search-clear')
  const chips = $('#chips')
  const count = $('#result-count')
  const results = $('#results')
  const pagination = $('#pagination')

  input.value = state.q
  clear.hidden = !state.q

  function renderChips() {
    chips.innerHTML = DEPARTMENTS.map(
      (d) =>
        `<button type="button" class="chip ${d.id === state.dept ? 'active' : ''}" aria-pressed="${d.id === state.dept}" data-id="${d.id ?? ''}">${d.label}</button>`,
    ).join('')
  }

  function syncUrl() {
    history.replaceState(null, '', link.explore(state.q, state.dept, state.page))
    document.title = state.q ? `“${state.q}” · Explore · Curatora` : 'Explore Artworks · Curatora'
  }

  function renderPagination(totalPages) {
    if (totalPages <= 1) {
      pagination.innerHTML = ''
      pagination.hidden = true
      return
    }

    const start = Math.max(1, Math.min(state.page - 2, totalPages - 4))
    const end = Math.min(totalPages, start + 4)
    const buttons = []
    buttons.push(`<button type="button" class="page-button page-arrow" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''} aria-label="Previous page">Previous</button>`)
    for (let page = start; page <= end; page++) {
      buttons.push(`<button type="button" class="page-button ${page === state.page ? 'active' : ''}" data-page="${page}" ${page === state.page ? 'aria-current="page"' : ''}>${page}</button>`)
    }
    buttons.push(`<button type="button" class="page-button page-arrow" data-page="${state.page + 1}" ${state.page === totalPages ? 'disabled' : ''} aria-label="Next page">Next</button>`)
    pagination.innerHTML = buttons.join('')
    pagination.hidden = false
  }

  async function load(reset = false) {
    const id = ++state.request
    if (reset) {
      state.page = 1
      syncUrl()
    }
    results.className = 'masonry'
    results.innerHTML = skeletons(pageSize)
    count.textContent = 'Searching the collection…'
    pagination.hidden = true
    try {
      // With no search terms, show museum highlights rather than an arbitrary slice.
      const res = await searchObjects({
        q: state.q,
        departmentId: state.dept,
        isHighlight: !state.q,
        offset: (state.page - 1) * pageSize,
        limit: pageSize,
      })
      if (id !== state.request) return
      state.total = res.total
      const totalPages = Math.min(Math.ceil(state.total / pageSize), maxPage)
      if (totalPages > 0 && state.page > totalPages) {
        state.page = totalPages
        syncUrl()
        load()
        return
      }
      const objs = await getObjectsWithImages(res.objectIDs)
      if (id !== state.request) return

      count.textContent = state.q
        ? `${state.total.toLocaleString()} results for “${state.q}”`
        : `${state.total.toLocaleString()} highlighted works`

      if (objs.length === 0) {
        results.className = ''
        results.innerHTML = notice('No artworks found', 'Try a different term or another department.')
      } else {
        results.innerHTML = objs.map((o) => card(o)).join('')
      }
      renderPagination(totalPages)
    } catch {
      if (id !== state.request) return
      results.className = ''
      results.innerHTML = notice('The collection is unreachable', `The Met's API didn't respond. <button type="button" id="retry">Try again</button>`)
      $('#retry').addEventListener('click', () => load())
      count.textContent = ''
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    state.q = input.value.trim()
    clear.hidden = !state.q
    syncUrl()
    load(true)
  })
  input.addEventListener('input', () => (clear.hidden = !input.value))
  clear.addEventListener('click', () => {
    input.value = ''
    state.q = ''
    clear.hidden = true
    syncUrl()
    load(true)
  })
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip')
    if (!btn) return
    state.dept = Number(btn.dataset.id) || null
    renderChips()
    syncUrl()
    load(true)
  })
  pagination.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]')
    if (!btn || btn.disabled) return
    state.page = Number(btn.dataset.page)
    syncUrl()
    load()
  })

  renderChips()
  syncUrl()
  load()
}

/* ---------- Artwork ---------- */
async function initArtwork() {
  const id = Number(params.get('id')) || 436535
  const root = $('#artwork')
  root.innerHTML = `<div class="detail skeleton"><div class="block" style="height:520px"></div><div><div class="line" style="height:40px"></div><div class="line short"></div></div></div>`

  const o = await getObject(id)
  if (!o) {
    root.innerHTML = notice('Artwork not found', `We couldn't load this record from The Met. <a href="explore.html">Explore other works</a>`)
    return
  }
  document.title = `${o.title} · Curatora`

  const images = [o.primaryImageSmall, ...(o.additionalImages || [])].filter(Boolean).slice(0, 6)
  const where = o.GalleryNumber
    ? `The Metropolitan Museum of Art, New York · Gallery ${esc(o.GalleryNumber)}`
    : 'The Metropolitan Museum of Art, New York (not on view)'
  const fact = (icon, label, value) =>
    value ? `<div class="fact">${icon(17)}<div><dt>${label}: </dt><dd>${esc(value)}</dd></div></div>` : ''
  const artistLine = o.artistDisplayName
    ? `<a class="detail-artist" href="${link.artist(o.artistDisplayName)}">${esc(o.artistDisplayName)}</a>`
    : o.culture || o.period
      ? `<p class="detail-artist">${esc(o.culture || o.period)}</p>`
      : ''

  root.innerHTML = `
    <article class="detail">
      <div class="fade-up">
        <div class="detail-media">
          ${o.primaryImageSmall ? `<img id="main-image" src="${esc(o.primaryImageSmall)}" alt="${esc(o.title)}" />` : '<p>No image available</p>'}
          ${o.primaryImage ? `<a class="expand" id="expand" href="${esc(o.primaryImage)}" target="_blank" rel="noreferrer" aria-label="Open full-resolution image">${ICON.expand(16)}</a>` : ''}
        </div>
        ${
          images.length > 1
            ? `<div class="thumbs">${images
                .map((src, i) => `<button type="button" class="${i === 0 ? 'active' : ''}" data-src="${esc(src)}" aria-label="Show image ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy" /></button>`)
                .join('')}</div>`
            : ''
        }
      </div>
      <div class="detail-info fade-up" style="animation-delay:100ms">
        ${o.isHighlight ? '<p class="badge">Museum highlight</p>' : ''}
        <h1>${esc(o.title)}</h1>
        ${artistLine}
        ${o.artistDisplayBio ? `<p class="detail-bio">${esc(o.artistDisplayBio)}</p>` : ''}
        <p class="detail-meta">${esc([o.objectDate, o.medium].filter(Boolean).join(' · '))}</p>
        <dl class="facts">
          ${fact(ICON.building, 'Department', o.department)}
          ${fact(ICON.brush, 'Classification', o.classification)}
          ${fact(ICON.ruler, 'Dimensions', o.dimensions)}
          <div class="fact">${ICON.pin(17)}<div><dt>Location: </dt><dd>${where}</dd></div></div>
          ${fact(ICON.gift, 'Credit', o.creditLine)}
        </dl>
        ${
          o.tags && o.tags.length
            ? `<div class="tags">${o.tags.slice(0, 6).map((t) => `<a class="tag" href="${link.explore(t.term)}">${esc(t.term)}</a>`).join('')}</div>`
            : ''
        }
        <a class="btn" href="${esc(o.objectURL)}" target="_blank" rel="noreferrer">View in Museum Collection ${ICON.arrowUpRight(15)}</a>
      </div>
    </article>`

  // Thumbnail switching
  root.querySelector('.thumbs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn) return
    $('#main-image').src = btn.dataset.src
    const expand = $('#expand')
    if (expand) expand.href = btn.dataset.src === o.primaryImageSmall ? o.primaryImage : btn.dataset.src
    root.querySelectorAll('.thumbs button').forEach((b) => b.classList.toggle('active', b === btn))
  })

  // Related works
  const byArtist = !!o.artistDisplayName
  const section = $('#related')
  const grid = $('#related-grid')
  section.hidden = false
  $('#related-title').textContent = byArtist ? `More by ${o.artistDisplayName}` : `More ${o.objectName || 'works'}`
  if (byArtist) {
    const a = $('#related-link')
    a.hidden = false
    a.href = link.artist(o.artistDisplayName)
    a.innerHTML = `View artist ${ICON.arrow(15)}`
  }
  grid.innerHTML = skeletons(4, false)
  try {
    const res = await searchObjects(
      byArtist
        ? { q: o.artistDisplayName, artistOrCulture: true, limit: 16 }
        : { q: o.objectName || o.classification || '*', isHighlight: true, limit: 16 },
    )
    const objs = await getObjectsWithImages(res.objectIDs.filter((x) => x !== o.objectID).slice(0, 12))
    if (!objs.length) section.hidden = true
    else grid.innerHTML = objs.slice(0, 4).map((r) => card(r, 'square')).join('')
  } catch {
    section.hidden = true
  }
}

/* ---------- Artists ---------- */
function initArtist() {
  const name = (params.get('name') || '').trim()
  if (name) renderProfile(name)
  else renderArtistIndex()
}

function renderArtistIndex() {
  const root = $('#artist-root')
  root.innerHTML = `
    <div class="container">
      <section class="artists-intro">
        <div>
          <p class="eyebrow">The hands behind the work</p>
          <h1 class="fade-up">Discover <em>artists.</em></h1>
          <p>Step into the lives and work of painters, printmakers, and sculptors held in The Met's collection.</p>
        </div>
        <form class="search-bar" id="artist-form" role="search">
          <label for="artist-q" class="sr-only">Find an artist</label>
          <input id="artist-q" placeholder="Find an artist, e.g. Monet" autocomplete="off" />
          <button type="submit" class="search-submit" aria-label="Find artist">${ICON.search(18)}</button>
        </form>
      </section>
      <section class="artist-grid">
        ${FEATURED_ARTISTS.map(
          (n, i) => `
          <a class="artist-tile" href="${link.artist(n)}" data-artist="${esc(n)}">
            <div class="media skeleton"><span class="num">${String(i + 1).padStart(2, '0')}</span></div>
            <div class="row">
              <div><h2>${esc(n)}</h2><p class="bio">&nbsp;</p></div>
              ${ICON.arrow(18)}
            </div>
          </a>`,
        ).join('')}
      </section>
    </div>`

  $('#artist-form').addEventListener('submit', (e) => {
    e.preventDefault()
    const q = $('#artist-q').value.trim()
    if (q) location.href = link.artist(q)
  })

  document.querySelectorAll('.artist-tile').forEach(async (tile) => {
    const media = tile.querySelector('.media')
    try {
      const { works } = await worksBy(tile.dataset.artist, 0, 6)
      const w = works[0]
      media.classList.remove('skeleton')
      if (!w) return
      media.insertAdjacentHTML('afterbegin', `<img src="${esc(w.primaryImageSmall)}" alt="${esc(w.title)}" loading="lazy" />`)
      if (w.artistDisplayBio) tile.querySelector('.bio').textContent = w.artistDisplayBio
    } catch {
      media.classList.remove('skeleton')
    }
  })
}

async function renderProfile(name) {
  const root = $('#artist-root')
  const state = { works: [], total: 0, offset: 0 }

  root.innerHTML = `
    <section class="profile-hero">
      <div class="container profile-grid">
        <div class="fade-up">
          <a class="crumb" href="artist.html">Artists</a>
          <h1 id="artist-name">${esc(name)}</h1>
          <div id="artist-facts"><div class="dark-skeleton" style="height:96px;max-width:380px;margin-top:24px"></div></div>
        </div>
        <div class="profile-lead" id="artist-lead"><div class="dark-skeleton" style="height:420px;max-width:380px;margin:0 auto"></div></div>
      </div>
    </section>
    <section class="container" style="padding:64px 0">
      <div class="works-head">
        <h2>Works in the collection</h2>
        <a class="text-link" href="${link.explore(name)}">Search in Explore</a>
      </div>
      <div style="padding-top:40px">
        <div class="masonry" id="artist-works">${skeletons(8)}</div>
        <div class="load-more"><button class="btn-outline" id="artist-more" hidden>Load more works</button></div>
      </div>
    </section>`

  const grid = $('#artist-works')
  const more = $('#artist-more')

  async function load() {
    const first = state.offset === 0
    more.disabled = true
    more.textContent = 'Loading…'
    try {
      const r = await worksBy(name, state.offset, 24)
      state.total = r.total
      state.offset += r.fetched
      const fresh = r.works.filter((w) => !state.works.some((p) => p.objectID === w.objectID))
      state.works.push(...fresh)

      if (first) {
        if (!state.works.length) {
          root.innerHTML = notice(`No works found for “${name}”`, `<a href="artist.html">Browse featured artists</a>`)
          return
        }
        renderLead(state.works[0], state.total)
        grid.innerHTML = state.works.slice(1).map((o) => card(o)).join('')
      } else {
        grid.insertAdjacentHTML('beforeend', fresh.map((o) => card(o)).join(''))
      }
      more.hidden = state.offset >= state.total
    } catch {
      if (first) root.innerHTML = notice('The collection is unreachable', 'Please try again in a moment.')
    } finally {
      more.disabled = false
      more.textContent = 'Load more works'
    }
  }

  function renderLead(lead, total) {
    const display = lead.artistDisplayName || name
    document.title = `${display} · Curatora`
    $('#artist-name').textContent = display
    const fact = (label, value) => (value ? `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>` : '')
    $('#artist-facts').innerHTML = `
      ${lead.artistDisplayBio ? `<p class="bio">${esc(lead.artistDisplayBio)}</p>` : ''}
      <dl class="profile-facts">
        ${fact('Nationality', lead.artistNationality)}
        ${lead.artistBeginDate ? fact('Lifespan', `${lead.artistBeginDate}–${lead.artistEndDate}`) : ''}
        ${fact('In the collection', `${total.toLocaleString()} records`)}
      </dl>
      ${lead.artistWikidata_URL ? `<a class="wiki" href="${esc(lead.artistWikidata_URL)}" target="_blank" rel="noreferrer">Read more on Wikidata ${ICON.arrowUpRight(14)}</a>` : ''}`
    $('#artist-lead').innerHTML = `
      <a href="${link.artwork(lead.objectID)}">
        <img class="fade-up" src="${esc(lead.primaryImageSmall)}" alt="${esc(lead.title)}" />
        <p><em>${esc(lead.title)}</em>${lead.objectDate ? ` · ${esc(lead.objectDate)}` : ''}</p>
      </a>`
  }

  more.addEventListener('click', load)
  load()
}

/* ---------- Boot ---------- */
initHeader()
const page = document.body.dataset.page
if (page === 'home') initHome()
else if (page === 'explore') initExplore()
else if (page === 'artwork') initArtwork()
else if (page === 'artist') initArtist()
