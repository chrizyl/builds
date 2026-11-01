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
  'Paul Gauguin', 'Henri de Toulouse-Lautrec', 'Berthe Morisot', 'Georges Seurat',
  'Camille Pissarro', 'Albrecht Dürer', 'Francisco de Goya', 'El Greco',
  'Giovanni Battista Tiepolo', 'Titian', 'Peter Paul Rubens', 'Anthony van Dyck',
  'Jean-François Millet', 'Thomas Cole', 'Frederic Edwin Church', 'Thomas Eakins',
  'Artemisia Gentileschi', 'Jean-Honoré Fragonard', 'Eugène Delacroix',
]

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
  artistIndex: (q, page) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (page > 1) p.set('page', page)
    return 'artist.html' + (p.toString() ? '?' + p : '')
  },
}

const objectCache = new Map()
const artistPreviewCache = new Map()
let apiRequestQueue = Promise.resolve()
let lastApiRequestTime = 0
const API_REQUEST_GAP = 200

async function logApiFailure(response, url) {
  let body = ''
  try {
    body = await response.text()
  } catch {
    body = '[response body unavailable]'
  }

  const headers = {}
  response.headers.forEach((value, name) => {
    if (/^(access-control-|cf-|x-|server$|via$)/i.test(name)) headers[name] = value
  })

  console.error('[CURATORA API failure]', {
    status: response.status,
    statusText: response.statusText,
    url,
    headers,
    body: body.slice(0, 2000),
  })
}

async function limited(fn) {
  const request = apiRequestQueue.then(async () => {
    const wait = Math.max(0, API_REQUEST_GAP - (Date.now() - lastApiRequestTime))
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
    lastApiRequestTime = Date.now()
    return fn()
  })
  apiRequestQueue = request.catch(() => {})
  return request
}

async function searchObjects({ q = '', departmentId, isHighlight, artistOrCulture, offset = 0, limit = 24 }) {
  const p = new URLSearchParams({ q: q.trim() || '*', hasImages: 'true', offset, limit })
  if (departmentId) p.set('departmentId', departmentId)
  if (isHighlight) p.set('isHighlight', 'true')
  if (artistOrCulture) p.set('artistOrCulture', 'true')
  const url = `${API}/v1.1/search?${p}`
  const res = await limited(() => fetch(url))
  if (!res.ok) {
    await logApiFailure(res, url)
    const error = new Error(`Search failed: ${res.status}`)
    error.status = res.status
    throw error
  }
  const data = await res.json()
  return { total: data.total || 0, objectIDs: data.objectIDs || [], status: res.status }
}

function getObject(id) {
  if (!objectCache.has(id)) {
    const request = limited(async () => {
      const url = `${API}/v1/objects/${id}`
      const res = await fetch(url)
      if (!res.ok) {
        await logApiFailure(res, url)
        const error = new Error(`Artwork request failed: ${res.status}`)
        error.status = res.status
        throw error
      }
      return res.json()
    }).catch((error) => {
      objectCache.delete(id)
      throw error
    })
    objectCache.set(id, request)
  }
  return objectCache.get(id)
}

async function getObjectsWithImages(ids) {
  const results = await Promise.allSettled(ids.map(getObject))
  const objects = []
  const failedIds = []

  results.forEach((result, index) => {
    if (result.status === 'rejected') failedIds.push(ids[index])
    else if (result.value && result.value.primaryImageSmall) objects.push(result.value)
  })

  return { objects, failedIds }
}

const ARTIST_CREDIT_VARIANTS = {
  'el greco': ['El Greco', 'Domenikos Theotokopoulos', 'Domenico Theotocopuli'],
}

function normalizeArtistName(name) {
  return normalize(name)
    .replace(/[\u2018\u2019\u0060\u00B4]/g, "'")
    .replace(/[\-\u2010-\u2015]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function artistCreditMatches(artwork, name) {
  const credit = normalizeArtistName(artwork.artistDisplayName)
  const variants = ARTIST_CREDIT_VARIANTS[normalizeArtistName(name)] || [name]
  return variants.some((variant) => credit.includes(normalizeArtistName(variant)))
}

function getArtworkImage(artwork) {
  const image = artwork.primaryImageSmall || artwork.primaryImage
  if (!image) return ''

  try {
    const url = new URL(image)
    return url.protocol === 'https:' || url.protocol === 'http:' ? image : ''
  } catch {
    return ''
  }
}

async function worksBy(name, offset, limit) {
  const works = []
  const failedIds = []
  let total = 0
  let fetched = 0
  let successfulDetails = 0
  let imageRecords = 0
  let matchingCredits = 0
  const diagnose = limit > 1
  const diagnosePreview = limit === 1
  let previewReason = 'candidate limit reached'
  if (diagnose) console.groupCollapsed(`[CURATORA artist diagnostics] ${name} (offset ${offset}, limit ${limit})`)
  if (diagnose) console.info('Requested artist:', name)
  if (diagnosePreview) console.groupCollapsed(`[CURATORA artist preview] ${name}`)
  if (diagnosePreview) console.info('Requested artist:', name)
  const batchSize = Math.max(limit, 1)
  const requestCap = limit === 1 ? 4 : 24
  const seenIds = new Set()

  while (fetched < requestCap && works.length < limit) {
    const currentLimit = Math.min(batchSize, requestCap - fetched)
    let res
    try {
      res = await searchObjects({
        q: name,
        artistOrCulture: true,
        offset: offset + fetched,
        limit: currentLimit,
      })
    } catch (error) {
      if (diagnosePreview) {
        previewReason = 'search request failed'
        console.info('Search failed:', { status: error.status || 'unavailable (CORS/network error)', message: error.message })
        console.info('Preview summary:', {
          requestedArtist: name,
          candidatesChecked: fetched,
          matchingArtistCredits: matchingCredits,
          validImageURLs: imageRecords,
          previewEndedBecause: previewReason,
        })
        console.groupEnd()
      }
      throw error
    }
    total = res.total
    if (diagnose) console.info('Search batch:', { total, candidateIDs: res.objectIDs.length, offset: offset + fetched })
    if (diagnosePreview) console.info('Search succeeded:', { status: res.status, total, candidateIDsReturned: res.objectIDs.length, offset: offset + fetched })
    if (!res.objectIDs.length) {
      previewReason = 'search returned no candidate IDs'
      break
    }

    const candidateIDs = res.objectIDs.filter((id) => !seenIds.has(id))
    candidateIDs.forEach((id) => seenIds.add(id))
    if (!candidateIDs.length) {
      previewReason = 'all returned candidate IDs were duplicates'
      break
    }
    const result = { objects: [], failedIds: [] }
    let batchImages = 0
    let batchMatches = 0
    let successfulInBatch = 0
    let processedInBatch = 0
    let blocked = false
    for (const id of candidateIDs) {
      let artwork
      try {
        artwork = await getObject(id)
        successfulDetails++
        successfulInBatch++
      } catch (error) {
        result.failedIds.push(id)
        processedInBatch++
        if (diagnose) console.info('Candidate:', { objectID: id, request: 'failed', artistDisplayName: null, constituents: [], hasPrimaryImageSmall: false, artistCreditMatches: false, reason: 'Detail request failed; no artwork data available.' })
        if (diagnosePreview) console.info('Candidate:', { objectID: id, detailRequest: 'failed', status: error.status || 'unavailable (CORS/network error)', artistCreditMatches: false, imageURLAvailable: false, reason: 'Artwork details could not be read.' })
        if (error.status === 403 || error instanceof TypeError) {
          blocked = true
          previewReason = error.status === 403 ? 'artwork detail request returned HTTP 403' : 'artwork detail request failed at network/CORS level'
          break
        }
        continue
      }
      processedInBatch++

      const image = getArtworkImage(artwork)
      const hasImage = Boolean(image)
      if (hasImage) {
        imageRecords++
        batchImages++
      }
      const matches = artistCreditMatches(artwork, name)
      if (matches) {
        matchingCredits++
        batchMatches++
      }
      const included = hasImage && matches
      if (included) result.objects.push({ ...artwork, primaryImageSmall: image })
      if (diagnosePreview) {
        const reason = included
          ? 'included: artist credit matches and a valid image URL exists'
          : !matches
            ? 'excluded: artist credit does not match'
            : 'excluded: no valid primaryImageSmall or primaryImage URL exists'
        console.info('Candidate:', {
          objectID: id,
          detailRequest: 'success',
          status: 'HTTP 200',
          artistDisplayName: artwork.artistDisplayName || '',
          artistCreditMatches: matches,
          imageURLAvailable: hasImage,
          reason,
        })
      }
      if (diagnose) {
        const constituents = Array.isArray(artwork.constituents) ? artwork.constituents.map((item) => item.name).filter(Boolean) : []
        const reason = !matches
          ? 'Excluded: artistDisplayName did not match configured artist credit variants.'
          : !hasImage
            ? 'Excluded: artist credit matched, but no valid primaryImageSmall or primaryImage URL exists.'
            : 'Included: artist credit matched and a valid image URL exists.'
        console.info('Candidate:', {
          objectID: id,
          request: 'success',
          artistDisplayName: artwork.artistDisplayName || '',
          constituents,
          hasPrimaryImageSmall: Boolean(artwork.primaryImageSmall),
          hasPrimaryImage: Boolean(artwork.primaryImage),
          artistCreditMatches: matches,
          reason,
        })
      }
    }
    fetched += processedInBatch
    failedIds.push(...result.failedIds)
    works.push(...result.objects)
    if (diagnose) console.info('Batch counts:', { successfullyFetchedDetails: successfulInBatch, recordsWithUsableImages: batchImages, matchingArtistCredits: batchMatches, includedRecords: result.objects.length })
    if (works.length) previewReason = 'eligible artwork found'
    if (blocked) break
    if (res.objectIDs.length < currentLimit) {
      previewReason = 'search results ended before an eligible artwork was found'
      break
    }
  }

  const displayedWorks = works.slice(0, limit)
  if (diagnose) {
    console.info('Profile totals:', { requestedArtist: name, searchTotal: total, candidateIDsReturned: fetched, successfullyFetchedDetails: successfulDetails, recordsWithImages: imageRecords, matchingArtistCredits: matchingCredits, finalDisplayedWorks: displayedWorks.length })
    console.groupEnd()
  }
  if (diagnosePreview) {
    if (works.length) previewReason = 'eligible artwork found'
    console.info('Preview summary:', {
      requestedArtist: name,
      candidatesChecked: fetched,
      matchingArtistCredits: matchingCredits,
      validImageURLs: imageRecords,
      previewEndedBecause: previewReason,
    })
    console.groupEnd()
  }
  return { total, fetched, works: displayedWorks, failedIds }
}

function getArtistPreview(name) {
  if (!artistPreviewCache.has(name)) {
    const request = worksBy(name, 0, 1)
      .then(({ works, failedIds }) => {
        if (failedIds.length) throw new Error('Artwork preview temporarily unavailable')
        return works[0] || null
      })
      .catch((error) => {
        artistPreviewCache.delete(name)
        throw error
      })
    artistPreviewCache.set(name, request)
  }
  return artistPreviewCache.get(name)
}

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

function clearTemporaryUnavailable(target) {
  if (target.nextElementSibling?.classList.contains('temporary-unavailable')) {
    target.nextElementSibling.remove()
  }
}

function showTemporaryUnavailable(target, retry) {
  let status = target.nextElementSibling
  if (!status?.classList.contains('temporary-unavailable')) {
    status = document.createElement('p')
    status.className = 'temporary-unavailable'
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    target.insertAdjacentElement('afterend', status)
  }

  status.innerHTML = 'Some artwork records are temporarily unavailable. <button type="button" class="text-link">Try again</button>'
  status.querySelector('button').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true
    status.textContent = 'Retrying unavailable artwork requests…'
    try {
      await retry()
    } catch {
      showTemporaryUnavailable(target, retry)
    }
  })
}

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

async function renderHighlights(ids) {
  const grid = $('#highlights-grid')
  clearTemporaryUnavailable(grid)
  const { objects, failedIds } = await getObjectsWithImages(ids)
  grid.innerHTML = objects.map((o) => card(o, 'cover')).join('')
  if (failedIds.length) showTemporaryUnavailable(grid, () => renderHighlights(ids))
}

async function initHome() {
  const grid = $('#highlights-grid')
  grid.innerHTML = skeletons(4, false)
  try {
    const offset = Math.floor(Math.random() * 60)
    const res = await searchObjects({ departmentId: 11, isHighlight: true, offset, limit: 4 })
    await renderHighlights(res.objectIDs.slice(0, 4))
  } catch {
    $('#highlights').hidden = true
  }
}

function initExplore() {
  const pageSize = 9
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
    clearTemporaryUnavailable(results)
    if (reset) {
      state.page = 1
      syncUrl()
    }
    results.className = 'masonry'
    results.innerHTML = skeletons(pageSize)
    count.textContent = 'Searching the collection…'
    pagination.hidden = true
    try {
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
      const { objects: objs, failedIds } = await getObjectsWithImages(res.objectIDs)
      if (id !== state.request) return

      count.textContent = state.q
        ? `${state.total.toLocaleString()} results for “${state.q}”`
        : `${state.total.toLocaleString()} highlighted works`

      if (objs.length === 0 && failedIds.length) {
        results.className = ''
        results.innerHTML = ''
      } else if (objs.length === 0) {
        results.className = ''
        results.innerHTML = notice('No artworks found', 'Try a different term or another department.')
      } else {
        results.innerHTML = objs.map((o) => card(o)).join('')
      }
      if (failedIds.length) showTemporaryUnavailable(results, () => load())
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

async function initArtwork() {
  const id = Number(params.get('id')) || 436535
  const root = $('#artwork')
  root.innerHTML = `<div class="detail skeleton"><div class="block" style="height:520px"></div><div><div class="line" style="height:40px"></div><div class="line short"></div></div></div>`

  let o
  try {
    o = await getObject(id)
  } catch {
    root.innerHTML = notice('Artwork temporarily unavailable', `The Met could not return this record right now. <button type="button" id="retry-artwork">Try again</button>`)
    $('#retry-artwork').addEventListener('click', initArtwork)
    return
  }
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
        ${images.length > 1
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
        ${o.tags && o.tags.length
      ? `<div class="tags">${o.tags.slice(0, 6).map((t) => `<a class="tag" href="${link.explore(t.term)}">${esc(t.term)}</a>`).join('')}</div>`
      : ''
    }
        <a class="btn" href="${esc(o.objectURL)}" target="_blank" rel="noreferrer">View in Museum Collection ${ICON.arrowUpRight(15)}</a>
      </div>
    </article>`

  root.querySelector('.thumbs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn) return
    $('#main-image').src = btn.dataset.src
    const expand = $('#expand')
    if (expand) expand.href = btn.dataset.src === o.primaryImageSmall ? o.primaryImage : btn.dataset.src
    root.querySelectorAll('.thumbs button').forEach((b) => b.classList.toggle('active', b === btn))
  })

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

  async function renderRelated(ids) {
    clearTemporaryUnavailable(grid)
    const { objects, failedIds } = await getObjectsWithImages(ids)
    if (!objects.length && failedIds.length) {
      grid.innerHTML = ''
    } else if (!objects.length) {
      section.hidden = true
      return
    } else {
      section.hidden = false
      grid.innerHTML = objects.slice(0, 4).map((work) => card(work, 'square')).join('')
    }
    if (failedIds.length) showTemporaryUnavailable(grid, () => renderRelated(ids))
  }

  try {
    const res = await searchObjects(
      byArtist
        ? { q: o.artistDisplayName, artistOrCulture: true, limit: 16 }
        : { q: o.objectName || o.classification || '*', isHighlight: true, limit: 16 },
    )
    const ids = res.objectIDs.filter((objectId) => objectId !== o.objectID).slice(0, 4)
    if (!ids.length) section.hidden = true
    else await renderRelated(ids)
  } catch {
    section.hidden = true
  }
}

function initArtist() {
  const name = (params.get('name') || '').trim()
  if (name) renderProfile(name)
  else renderArtistIndex()
}

function renderArtistIndex() {
  const root = $('#artist-root')
  const pageSize = 3
  const state = {
    query: params.get('q') || '',
    page: Math.max(Number(params.get('page')) || 1, 1),
    request: 0,
  }

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
          <input id="artist-q" value="${esc(state.query)}" placeholder="Find an artist, e.g. Monet" autocomplete="off" />
          <button type="submit" class="search-submit" aria-label="Find artist">${ICON.search(18)}</button>
        </form>
      </section>
      <p class="artist-status" id="artist-status" role="status" aria-live="polite"></p>
      <section class="artist-grid" id="artist-grid"></section>
      <nav class="artist-pagination" id="artist-pagination" aria-label="Artist pages" hidden></nav>
    </div>`

  const form = $('#artist-form')
  const input = $('#artist-q')
  const grid = $('#artist-grid')
  const status = $('#artist-status')
  const pagination = $('#artist-pagination')

  function syncUrl() {
    history.replaceState(null, '', link.artistIndex(state.query, state.page))
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
    buttons.push(`<button type="button" class="page-button page-arrow" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>Previous</button>`)
    for (let page = start; page <= end; page++) {
      buttons.push(`<button type="button" class="page-button ${page === state.page ? 'active' : ''}" data-page="${page}" ${page === state.page ? 'aria-current="page"' : ''}>${page}</button>`)
    }
    buttons.push(`<button type="button" class="page-button page-arrow" data-page="${state.page + 1}" ${state.page === totalPages ? 'disabled' : ''}>Next</button>`)
    pagination.innerHTML = buttons.join('')
    pagination.hidden = false
  }

  async function loadPreviews(artists) {
    const request = ++state.request
    let errors = 0
    status.textContent = 'Loading artwork previews…'

    for (const name of artists) {
      if (request !== state.request) break
      const tile = Array.from(grid.querySelectorAll('.artist-tile')).find((item) => item.dataset.artist === name)
      const media = tile.querySelector('.media')
      try {
        const work = await getArtistPreview(name)
        if (request !== state.request) return
        media.classList.remove('skeleton')
        if (work) {
          media.insertAdjacentHTML('afterbegin', `<img src="${esc(work.primaryImageSmall)}" alt="${esc(work.title)}" loading="lazy" />`)
          if (work.artistDisplayBio) tile.querySelector('.bio').textContent = work.artistDisplayBio
        } else {
          media.insertAdjacentHTML('beforeend', '<span class="preview-message">Preview temporarily unavailable</span>')
        }
      } catch {
        if (request !== state.request) return
        errors++
        media.classList.remove('skeleton')
        media.insertAdjacentHTML('beforeend', '<span class="preview-message">Preview temporarily unavailable</span>')
      }
    }

    if (request !== state.request) return
    if (errors) {
      status.innerHTML = `Some artwork previews are temporarily unavailable. <button type="button" id="artist-retry">Retry</button>`
      $('#artist-retry').addEventListener('click', () => loadPreviews(artists))
    } else {
      status.textContent = ''
    }
  }

  function renderArtists() {
    const query = normalize(state.query)
    const matches = FEATURED_ARTISTS.filter((name) => normalize(name).includes(query))
    const totalPages = Math.ceil(matches.length / pageSize)

    if (totalPages && state.page > totalPages) {
      state.page = totalPages
      syncUrl()
    }

    if (!matches.length) {
      grid.className = ''
      grid.innerHTML = notice('No artists found', 'Try a different name.')
      status.textContent = ''
      pagination.hidden = true
      state.request++
      return
    }

    grid.className = 'artist-grid'
    const firstIndex = (state.page - 1) * pageSize
    const artists = matches.slice(firstIndex, firstIndex + pageSize)
    grid.innerHTML = artists.map((name, index) => `
      <a class="artist-tile" href="${link.artist(name)}" data-artist="${esc(name)}">
        <div class="media skeleton"><span class="num">${String(firstIndex + index + 1).padStart(2, '0')}</span></div>
        <div class="row">
          <div><h2>${esc(name)}</h2><p class="bio">&nbsp;</p></div>
          ${ICON.arrow(18)}
        </div>
      </a>`).join('')
    renderPagination(totalPages)
    loadPreviews(artists)
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    state.query = input.value.trim()
    state.page = 1
    syncUrl()
    renderArtists()
  })
  pagination.addEventListener('click', (e) => {
    const button = e.target.closest('[data-page]')
    if (!button || button.disabled) return
    state.page = Number(button.dataset.page)
    syncUrl()
    renderArtists()
  })

  syncUrl()
  renderArtists()
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

  async function load(offset = state.offset) {
    const first = offset === 0
    more.disabled = true
    more.textContent = 'Loading…'
    try {
      const r = await worksBy(name, offset, 24)
      state.total = r.total
      state.offset = offset + r.fetched
      const fresh = r.works.filter((w) => !state.works.some((p) => p.objectID === w.objectID))
      state.works.push(...fresh)

      if (first) {
        if (!state.works.length && !r.failedIds.length) {
          root.innerHTML = notice(`No works found for “${name}”`, `<a href="artist.html">Browse featured artists</a>`)
          return
        }
        if (state.works.length) {
          renderLead(state.works[0], state.total)
          grid.innerHTML = state.works.slice(1).map((o) => card(o)).join('')
        } else {
          $('#artist-facts').innerHTML = '<p class="bio">Artist details are temporarily unavailable.</p>'
          $('#artist-lead').innerHTML = '<p class="bio">Artwork preview temporarily unavailable.</p>'
          grid.innerHTML = ''
        }
      } else {
        grid.insertAdjacentHTML('beforeend', fresh.map((o) => card(o)).join(''))
      }
      more.hidden = state.offset >= state.total
      if (r.failedIds.length) showTemporaryUnavailable(grid, () => load(offset))
      else clearTemporaryUnavailable(grid)
    } catch (error) {
      console.error('[CURATORA artist profile error]', error)
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

  more.addEventListener('click', () => load())
  load()
}

initHeader()
const page = document.body.dataset.page
if (page === 'home') initHome()
else if (page === 'explore') initExplore()
else if (page === 'artwork') initArtwork()
else if (page === 'artist') initArtist()
