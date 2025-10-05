const state = {
  events: [],
  view: 'grid',
  query: '',
  filters: {
    category: [], city: '', minPrice: '', maxPrice: '',
    minDate: '', maxDate: '', status: '' // 'available' | 'soldout' | ''
  },
  sort: 'date_asc',
  page: 1,
  pageSize: 12,
  cart: [],
  favorites: []
};

const els = {
  app: () => document.getElementById('app'),
  favCount: () => document.getElementById('favCount'),
  cartCount: () => document.getElementById('cartCount'),
};

// ---------- Utils ----------
const fmtDateTime = (iso) => new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
const fmtPrice = (n, c) => `${(n).toLocaleString('es-PE', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${c}`;
const byId = (id) => state.events.find(e => e.id === id);

const persist = () => {
  localStorage.setItem('cartelera_cart', JSON.stringify(state.cart));
  localStorage.setItem('cartelera_favs', JSON.stringify(state.favorites));
};
const loadPersisted = () => {
  state.cart = JSON.parse(localStorage.getItem('cartelera_cart') || '[]');
  state.favorites = JSON.parse(localStorage.getItem('cartelera_favs') || '[]');
  updateBadges();
};

const updateBadges = () => {
  els.favCount().textContent = state.favorites.length;
  els.cartCount().textContent = state.cart.reduce((acc, it) => acc + it.qty, 0);
};

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    alert('¡URL copiada!');
  } catch { alert('No se pudo copiar'); }
};

// ---------- Router ----------
function parseHash() {
  const raw = location.hash || '#/catalog';
  const [path, qs = ''] = raw.slice(2).split('?'); // remove "#/"
  const params = new URLSearchParams(qs);

  if (path.startsWith('event/')) {
    return { route: 'event', id: path.split('/')[1], params };
  }
  if (path === 'cart') return { route: 'cart', params };
  if (path === 'favorites') return { route: 'favorites', params };
  if (path === 'checkout') return { route: 'checkout', params };
  return { route: 'catalog', params };
}

function setHash(route, extras = {}) {
  const params = new URLSearchParams(extras);
  location.hash = `#/${route}?${params.toString()}`;
}

// ---------- Data ----------
async function loadEvents() {
  const res = await fetch('./event.json');
  state.events = await res.json();
}

// ---------- Filters ----------
function applyQueryAndFilters(list) {
  const q = state.query.trim().toLowerCase();
  let out = list.filter(e => {
    const inQuery = !q || [e.title, e.city, e.venue, (e.artists||[]).join(' ')]
      .join(' ').toLowerCase().includes(q);
    const catOk = !state.filters.category.length || state.filters.category.includes(e.category);
    const cityOk = !state.filters.city || e.city.toLowerCase() === state.filters.city.toLowerCase();
    const priceOk = (!state.filters.minPrice || e.priceFrom >= Number(state.filters.minPrice)) &&
                    (!state.filters.maxPrice || e.priceFrom <= Number(state.filters.maxPrice));
    const date = new Date(e.datetime).getTime();
    const minD = state.filters.minDate ? new Date(state.filters.minDate).getTime() : -Infinity;
    const maxD = state.filters.maxDate ? new Date(state.filters.maxDate).getTime() + 24*60*60*1000 - 1 : Infinity;
    const dateOk = date >= minD && date <= maxD;
    const statusOk = !state.filters.status ||
      (state.filters.status === 'soldout' ? e.soldOut : !e.soldOut);
    return inQuery && catOk && cityOk && priceOk && dateOk && statusOk;
  });

  // sort
  const [field, dir] = state.sort.split('_'); // date|price|popularity + asc|desc
  out.sort((a,b)=>{
    let va = field === 'date' ? new Date(a.datetime).getTime()
         : field === 'price' ? a.priceFrom
         : a.popularity;
    let vb = field === 'date' ? new Date(b.datetime).getTime()
         : field === 'price' ? b.priceFrom
         : b.popularity;
    return dir === 'asc' ? va - vb : vb - va;
  });

  return out;
}

function syncStateFromURL(params) {
  state.view = params.get('view') || 'grid';
  state.query = params.get('query') || '';
  state.filters.category = (params.get('cat') || '').split(',').filter(Boolean);
  state.filters.city = params.get('city') || '';
  state.filters.minPrice = params.get('minPrice') || '';
  state.filters.maxPrice = params.get('maxPrice') || '';
  state.filters.minDate = params.get('minDate') || '';
  state.filters.maxDate = params.get('maxDate') || '';
  state.filters.status = params.get('status') || '';
  state.sort = params.get('sort') || 'date_asc';
  state.page = Number(params.get('page') || 1);
}

function pushURLFromState() {
  const extras = {
    view: state.view,
    query: state.query || '',
    cat: state.filters.category.join(','),
    city: state.filters.city || '',
    minPrice: state.filters.minPrice || '',
    maxPrice: state.filters.maxPrice || '',
    minDate: state.filters.minDate || '',
    maxDate: state.filters.maxDate || '',
    status: state.filters.status || '',
    sort: state.sort,
    page: String(state.page)
  };
  setHash('catalog', extras);
}

// ---------- Views ----------
function viewCatalog() {
  const controls = /*html*/`
    <section class="controls" aria-label="Controles de filtro y búsqueda">
      <div class="row">
        <input type="search" id="q" placeholder="Buscar por título, artista o ciudad" value="${state.query}" />
        <select id="cat" multiple title="Categorías (Ctrl/Cmd para multi)">
          ${['musica','teatro','festival','standup','otros'].map(c => `<option value="${c}" ${state.filters.category.includes(c)?'selected':''}>${c}</option>`).join('')}
        </select>
        <input type="text" id="city" placeholder="Ciudad" value="${state.filters.city}" />
        <input type="number" id="minPrice" placeholder="Precio min" value="${state.filters.minPrice}" />
        <input type="number" id="maxPrice" placeholder="Precio max" value="${state.filters.maxPrice}" />
        <select id="status">
          <option value="">Estado</option>
          <option value="available" ${state.filters.status==='available'?'selected':''}>Disponible</option>
          <option value="soldout" ${state.filters.status==='soldout'?'selected':''}>Sold Out</option>
        </select>
      </div>
      <div class="row">
        <label>Desde: <input type="date" id="minDate" value="${state.filters.minDate}"></label>
        <label>Hasta: <input type="date" id="maxDate" value="${state.filters.maxDate}"></label>
        <select id="sort">
          <option value="date_asc" ${state.sort==='date_asc'?'selected':''}>Fecha ↑</option>
          <option value="date_desc" ${state.sort==='date_desc'?'selected':''}>Fecha ↓</option>
          <option value="price_asc" ${state.sort==='price_asc'?'selected':''}>Precio ↑</option>
          <option value="price_desc" ${state.sort==='price_desc'?'selected':''}>Precio ↓</option>
          <option value="popularity_desc" ${state.sort==='popularity_desc'?'selected':''}>Popularidad</option>
        </select>
        <button id="apply" class="primary">Aplicar</button>
        <button id="clear" class="ghost">Limpiar filtros</button>
        <button id="toggle" class="ghost">Vista: ${state.view==='grid'?'Grid':'Lista'}</button>
      </div>
    </section>
  `;

  const list = applyQueryAndFilters(state.events);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  if (state.page > pages) state.page = pages;
  const start = (state.page - 1) * state.pageSize;
  const pageItems = list.slice(start, start + state.pageSize);

  const cards = pageItems.map(e => /*html*/`
    <article class="card" role="article">
      <img src="${e.images[0]}" alt="${e.title} — ${e.city}" loading="lazy">
      <div class="p">
        <h3>${e.title}</h3>
        <p class="meta">${e.category} · ${e.city} — ${e.venue}</p>
        <p class="meta">${fmtDateTime(e.datetime)}</p>
        <p class="price">Desde ${fmtPrice(e.priceFrom, e.currency)} 
          ${e.soldOut?'<span class="soldout">Sold Out</span>':''}
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <button class="primary" data-go="event" data-id="${e.id}">Ver detalle</button>
          <button class="ghost" data-fav="${e.id}">${state.favorites.includes(e.id)?'★ Quitar':'☆ Favorito'}</button>
        </div>
      </div>
    </article>
  `).join('');

  const pager = /*html*/`
    <div class="pager" aria-label="Paginación">
      <button ${state.page<=1?'disabled':''} data-page="${state.page-1}">« Prev</button>
      <span>Página ${state.page} / ${pages}</span>
      <button ${state.page>=pages?'disabled':''} data-page="${state.page+1}">Next »</button>
    </div>
  `;

  const empty = /*html*/`
    <div class="alert">
      No hay resultados. <button id="reset" class="ghost">Limpiar filtros</button>
    </div>
  `;

  els.app().innerHTML = controls + (total? `<section class="${state.view==='grid'?'grid':''}">${cards}</section>${pager}` : empty);

  // events
  document.getElementById('apply').onclick = () => {
    const catSel = Array.from(document.getElementById('cat').selectedOptions).map(o=>o.value);
    state.query = document.getElementById('q').value;
    state.filters.category = catSel;
    state.filters.city = document.getElementById('city').value;
    state.filters.minPrice = document.getElementById('minPrice').value;
    state.filters.maxPrice = document.getElementById('maxPrice').value;
    state.filters.minDate = document.getElementById('minDate').value;
    state.filters.maxDate = document.getElementById('maxDate').value;
    state.filters.status = document.getElementById('status').value;
    state.page = 1;
    pushURLFromState();
  };
  document.getElementById('clear').onclick = () => {
    state.query = ''; state.filters = {category:[], city:'', minPrice:'', maxPrice:'', minDate:'', maxDate:'', status:''}; state.page=1;
    pushURLFromState();
  };
  const toggle = document.getElementById('toggle');
  toggle.onclick = () => { state.view = state.view==='grid'?'list':'grid'; pushURLFromState(); };
  const pagerEl = document.querySelector('.pager');
  if (pagerEl){
    pagerEl.addEventListener('click', e => {
      const p = e.target.getAttribute('data-page');
      if (p){ state.page = Number(p); pushURLFromState(); }
    });
  }
  document.querySelectorAll('[data-go="event"]').forEach(b => b.onclick = () => location.hash = `#/event/${b.dataset.id}`);
  document.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => toggleFavorite(b.dataset.fav));
  const reset = document.getElementById('reset'); if (reset) reset.onclick = () => document.getElementById('clear').click();
}

function viewEvent(id) {
  const e = byId(id);
  if (!e) { els.app().innerHTML = `<p class="alert">Evento no encontrado. <a class="link" href="#/catalog">Volver</a></p>`; return; }

  const gal = e.images.map(src => `<img src="${src}" alt="${e.title}" loading="lazy">`).join('');
  els.app().innerHTML = /*html*/`
    <article class="detail">
      <section>
        <h2>${e.title} ${e.soldOut?'<span class="soldout">Sold Out</span>':''}</h2>
        <div class="gallery" aria-label="Galería">${gal}</div>
        <p class="meta">${e.category} · ${e.city} — ${e.venue}</p>
        <p class="meta">${fmtDateTime(e.datetime)}</p>
        <p>${e.description}</p>
        <p><strong>Artistas/Line-up:</strong> ${(e.artists||[]).join(', ')}</p>
        <p><strong>Políticas:</strong> Edad: ${e.policies?.age || '-'} · Reembolso: ${e.policies?.refund || '-'}</p>
        <p class="price">Precio desde: ${fmtPrice(e.priceFrom, e.currency)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
          <label>Cantidad: <input id="qty" type="number" min="1" value="1" style="width:90px"></label>
          <button class="primary" id="add">Agregar al carrito</button>
          <button class="ghost" id="fav">${state.favorites.includes(e.id)?'★ Quitar de favoritos':'☆ Agregar a favoritos'}</button>
          <button class="ghost" id="share">Compartir</button>
          <a class="link" href="#/catalog">← Volver</a>
        </div>
      </section>
      <aside>
        <h3>Venue</h3>
        <img src="https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(e.city)}&zoom=12&size=600x300&markers=color:red|${encodeURIComponent(e.city)}" alt="Mapa estático de ${e.city}" style="width:100%;height:auto;border-radius:12px">
        <table class="table">
          <tr><th>Stock</th><td>${e.stock}</td></tr>
          <tr><th>Popularidad</th><td>${e.popularity}</td></tr>
          <tr><th>Ciudad</th><td>${e.city}</td></tr>
          <tr><th>Moneda</th><td>${e.currency}</td></tr>
        </table>
      </aside>
    </article>
  `;

  document.getElementById('add').onclick = () => {
    if (e.soldOut) { alert('Evento agotado'); return; }
    const qty = Math.max(1, Number(document.getElementById('qty').value || 1));
    const inCart = state.cart.find(it => it.id === e.id);
    const current = inCart ? inCart.qty : 0;
    if (qty + current > e.stock) { alert('No hay suficiente stock'); return; }
    if (inCart) inCart.qty += qty; else state.cart.push({ id: e.id, qty });
    persist(); updateBadges();
    alert('Agregado al carrito');
  };
  document.getElementById('fav').onclick = () => { toggleFavorite(e.id); viewEvent(e.id); };
  document.getElementById('share').onclick = () => copyToClipboard(location.href);
}

function viewCart() {
  if (!state.cart.length){
    els.app().innerHTML = `<div class="alert">Tu carrito está vacío. <a class="link" href="#/catalog">Ir al catálogo</a></div>`;
    return;
  }

  const rows = state.cart.map(it => {
    const e = byId(it.id);
    const subtotal = it.qty * e.priceFrom;
    return `<tr>
      <td>${e.title}</td>
      <td><input type="number" min="1" value="${it.qty}" data-qty="${e.id}" style="width:90px"></td>
      <td>${fmtPrice(e.priceFrom, e.currency)}</td>
      <td>${fmtPrice(subtotal, e.currency)}</td>
      <button class="danger" data-del="${e.id}">Eliminar</button>
    </tr>`;
  }).join('');

  const total = state.cart.reduce((acc, it) => {
    const e = byId(it.id); return acc + it.qty * e.priceFrom;
  }, 0);
  const currency = byId(state.cart[0].id).currency;

  els.app().innerHTML = /*html*/`
    <h2>Carrito</h2>
    <table class="table">
      <thead><tr><th>Evento</th><th>Cant.</th><th>Precio</th><th>Subtotal</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="text-align:right;font-weight:700">Total: ${fmtPrice(total, currency)}</p>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <a class="link" href="#/catalog">Seguir comprando</a>
      <a href="#/checkout"><button class="success">Ir a pagar</button></a>
    </div>
  `;

  // events
  document.querySelectorAll('[data-qty]').forEach(inp => {
    inp.addEventListener('change', () => {
      const id = inp.getAttribute('data-qty');
      const e = byId(id);
      let qty = Math.max(1, Number(inp.value||1));
      if (qty > e.stock){ qty = e.stock; inp.value = qty; alert('No hay suficiente stock'); }
      const it = state.cart.find(x => x.id === id);
      it.qty = qty; persist(); updateBadges(); viewCart();
    });
  });
  document.querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => {
    state.cart = state.cart.filter(x => x.id !== btn.getAttribute('data-del'));
    persist(); updateBadges(); viewCart();
  });
}

function viewFavorites() {
  if (!state.favorites.length){
    els.app().innerHTML = `<div class="alert">No tienes favoritos. <a class="link" href="#/catalog">Explorar</a></div>`;
    return;
  }
  const items = state.favorites.map(id => byId(id)).filter(Boolean);
  els.app().innerHTML = `
    <h2>Favoritos</h2>
    <section class="grid">
      ${items.map(e => `
        <article class="card">
          <img src="${e.images[0]}" alt="${e.title}" loading="lazy">
          <div class="p">
            <h3>${e.title}</h3>
            <p class="meta">${e.city} — ${fmtDateTime(e.datetime)}</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
              <button class="primary" data-go="event" data-id="${e.id}">Ver detalle</button>
              <button class="ghost" data-fav="${e.id}">Quitar</button>
            </div>
          </div>
        </article>
      `).join('')}
    </section>
  `;
  document.querySelectorAll('[data-go="event"]').forEach(b => b.onclick = () => location.hash = `#/event/${b.dataset.id}`);
  document.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => { toggleFavorite(b.dataset.fav); viewFavorites(); });
}

function viewCheckout() {
  if (!state.cart.length){
    els.app().innerHTML = `<div class="alert">No hay items en el carrito.</div>`; return;
  }
  const total = state.cart.reduce((acc, it) => acc + it.qty * byId(it.id).priceFrom, 0);
  const currency = byId(state.cart[0].id).currency;

  els.app().innerHTML = /*html*/`
<div class="carrito-container">
    <h2>Carrito</h2>
    <table class="table">
      <!-- aquí van las filas del carrito -->
    </table>
    <div class="carrito-total">Total: ...</div>
    <div class="carrito-actions">
      <a class="link" href="#/catalog">Seguir comprando</a>
      <a href="#/checkout"><button class="success">Ir a pagar</button></a>
    </div>
  </div>
`;

  document.getElementById('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const email = fd.get('email'); const dni = fd.get('dni'); const phone = fd.get('phone');
    const valid = /\S+@\S+\.\S+/.test(email) && /^\d{8}$/.test(dni) && /^\d{7,15}$/.test(phone);
    if (!valid){ alert('Revisa los datos del formulario'); return; }

    // build order
    const ts = Date.now();
    const code = `EVT-${ts}-${state.cart[0].id}`;
    const order = {
      id: code,
      buyer: { name: fd.get('name'), email, dni, phone },
      items: state.cart.map(it => ({ id: it.id, qty: it.qty, price: byId(it.id).priceFrom })),
      total, currency, createdAt: new Date(ts).toISOString()
    };
    const orders = JSON.parse(localStorage.getItem('cartelera_orders') || '[]');
    orders.push(order);
    localStorage.setItem('cartelera_orders', JSON.stringify(orders));

    // clear cart
    state.cart = []; persist(); updateBadges();
    els.app().innerHTML = `
      <div class="alert">
        <h3>¡Compra confirmada!</h3>
        <p>Código: <kbd>${code}</kbd></p>
        <p>Se ha guardado localmente tu orden.</p>
        <a class="link" href="#/catalog">Volver al catálogo</a>
      </div>
    `;
  });
}

// ---------- Favorites & Cart helpers ----------
function toggleFavorite(id){
  const idx = state.favorites.indexOf(id);
  if (idx >= 0) state.favorites.splice(idx,1);
  else state.favorites.push(id);
  persist(); updateBadges();
}

// ---------- Boot ----------
async function render() {
  const { route, id, params } = parseHash();
  if (!state.events.length) await loadEvents();
  loadPersisted();

  if (route === 'catalog'){
    syncStateFromURL(params);
    viewCatalog();
  } else if (route === 'event'){
    viewEvent(id);
  } else if (route === 'cart'){
    viewCart();
  } else if (route === 'favorites'){
    viewFavorites();
  } else if (route === 'checkout'){
    viewCheckout();
  }
  // focus main
  setTimeout(()=>document.getElementById('app')?.focus(), 0);
}

window.addEventListener('hashchange', render);
render();