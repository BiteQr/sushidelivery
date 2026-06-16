/* ============================================================================
 *  FOOD ORDER APP — ФРОНТЕНД (app.js)
 *  Архитектура: единый объект state + функции api / render / handlers.
 * ========================================================================== */

// !!! ВСТАВЬТЕ СЮДА URL ВАШЕГО ВЕБ-ПРИЛОЖЕНИЯ GAS (заканчивается на /exec) !!!
// Адрес API берётся из config.js (window.API_URL). Менять адрес — только там.
const API_URL = window.API_URL || 'https://script.google.com/macros/s/AKfycbzc2BrNjTwEBtsMIU-j9TNaiAFbc13jq9jBkXxKW6UWbMfBMnI5zn2AH6vFL08oOuKk/exec';

// === ГЛОБАЛЬНОЕ СОСТОЯНИЕ ================================================
const state = {
  user: null,            // данные авторизованного пользователя
  settings: {},          // настройки лояльности с бэка
  menu: [],              // список блюд
  banners: [],           // акции
  cart: {},              // корзина: { productId: { item, qty } }
  activeCategory: 'Все', // выбранная категория
  pendingAuth: null,     // временные данные авторизации (телефон/токен)
  promo: null            // применённый промокод { code, type, value }
};

// === API: универсальные обёртки =========================================

// GET-запрос (чтение). Параметры уходят в query-строке.
async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

// POST-запрос (запись). БЕЗ заголовка Content-Type — чтобы не было CORS-preflight.
async function apiPost(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify(Object.assign({ action }, payload))
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json.data;
}

// === ИНИЦИАЛИЗАЦИЯ ======================================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  loadUserFromStorage();
  bindEvents();

  // 1) Мгновенно показываем из локального кэша прошлой загрузки (сайт не «тупит» на обновлении)
  const cached = safeJSON(localStorage.getItem('bootstrap'));
  if (cached) renderBootstrap(cached);

  // 2) Затем подтягиваем свежие данные ОДНИМ запросом
  try {
    const data = await apiGet('getBootstrap');
    localStorage.setItem('bootstrap', JSON.stringify(data));
    renderBootstrap(data);
    if (state.user) refreshUser(); // обновим баланс
  } catch (e) {
    if (!cached) alert('Ошибка загрузки: ' + e.message);
  }
  updateProfileUI();
}

// Отрисовать витрину из данных бутстрапа
function renderBootstrap(data) {
  state.settings = data.settings;
  state.menu = data.menu;
  state.banners = data.banners;
  applyBranding(data.settings);
  showWorkStatus(data.settings);
  renderBanners();
  renderCategories();
  renderMenu();
}

function safeJSON(str) { try { return JSON.parse(str); } catch (e) { return null; } }

// Подставить название и логотип бренда из настроек (меняются в админке)
function applyBranding(settings) {
  if (settings.BrandName) {
    document.getElementById('brandName').textContent = settings.BrandName;
    document.title = settings.BrandName;
  }
  const logo = document.getElementById('brandLogo');
  if (settings.LogoUrl) { logo.src = settings.LogoUrl; logo.classList.remove('hidden'); }
  else { logo.classList.add('hidden'); }
}

// Плашка нерабочего времени над меню
function showWorkStatus(settings) {
  let el = document.getElementById('closedNotice');
  if (settings.isOpen === false) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'closedNotice';
      el.className = 'container mt-2';
      document.getElementById('menuPage').before(el);
    }
    el.innerHTML = `<div class="welcome" style="background:#FFF4E5;border-color:#FFE0B2">
      <div class="welcome__text">🕒 Сейчас закрыто. Приём заказов с ${settings.WorkHoursStart} до ${settings.WorkHoursEnd}. Можно оформить предзаказ.</div></div>`;
  } else if (el) {
    el.remove();
  }
}

// Загрузка сессии из localStorage
function loadUserFromStorage() {
  const raw = localStorage.getItem('user');
  if (raw) state.user = JSON.parse(raw);
  // Плашка нового пользователя
  document.getElementById('newUserBanner').classList.toggle('hidden', !!state.user);
}

// Обновить данные пользователя (баланс) с сервера
async function refreshUser() {
  try {
    const u = await apiGet('getUser', { phone: state.user.phone });
    if (u) { state.user = u; localStorage.setItem('user', JSON.stringify(u)); updateProfileUI(); }
  } catch (e) { /* молча */ }
}

// === РЕНДЕР: БАННЕР-ГЕРОЙ (статичный, переключается стрелками) ============
function renderBanners() {
  const box = document.getElementById('bannerScroll');
  if (!state.banners.length) { box.innerHTML = ''; return; }
  state.bannerIndex = 0;
  box.innerHTML = `
    <div class="hero">
      <div class="hero__img" id="heroImg"></div>
      <button class="hero__arrow hero__arrow--prev" id="heroPrev" aria-label="Назад"><i class="bi bi-chevron-left"></i></button>
      <button class="hero__arrow hero__arrow--next" id="heroNext" aria-label="Вперёд"><i class="bi bi-chevron-right"></i></button>
      <div class="hero__dots" id="heroDots"></div>
    </div>`;

  // стрелки и точки нужны только если баннеров больше одного
  const multi = state.banners.length > 1;
  document.getElementById('heroPrev').classList.toggle('hidden', !multi);
  document.getElementById('heroNext').classList.toggle('hidden', !multi);
  document.getElementById('heroPrev').onclick = e => { e.stopPropagation(); changeBanner(-1); };
  document.getElementById('heroNext').onclick = e => { e.stopPropagation(); changeBanner(1); };
  renderHero();
}

function changeBanner(dir) {
  const n = state.banners.length;
  state.bannerIndex = (state.bannerIndex + dir + n) % n;
  renderHero();
}

function renderHero() {
  const b = state.banners[state.bannerIndex];
  const img = document.getElementById('heroImg');
  img.style.backgroundImage = `url('${b.imageUrl}')`;
  img.onclick = () => openBanner(b.id);
  // тёмная подложка с заголовком — только если заголовок задан (для «голой» картинки из Figma не мешает)
  img.innerHTML = b.title ? `<div class="hero__overlay"><span class="hero__title">${b.title}</span></div>` : '';
  const dots = document.getElementById('heroDots');
  if (dots) dots.innerHTML = state.banners.length > 1
    ? state.banners.map((_, i) => `<span class="hero__dot ${i === state.bannerIndex ? 'is-active' : ''}"></span>`).join('')
    : '';
}

// Модалка акции со списком привязанных блюд
function openBanner(id) {
  const b = state.banners.find(x => x.id === id);
  const linked = state.menu.filter(m => b.productIds.includes(String(m.id)));
  document.getElementById('infoTitle').textContent = b.title;
  document.getElementById('infoBody').innerHTML = `
    <img src="${b.imageUrl}" class="img-fluid mb-3" style="border-radius:var(--radius)">
    <p class="text-muted">${b.description || ''}</p>
    ${linked.map(m => `
      <div class="d-flex justify-content-between align-items-center py-2" style="border-top:1px solid var(--line)">
        <div><strong>${m.name}</strong><br><small class="text-muted">${m.price} ₸</small></div>
        <button class="btn btn-accent btn-sm" data-add="${m.id}">В корзину</button>
      </div>`).join('')}`;
  document.querySelectorAll('#infoBody [data-add]').forEach(btn =>
    btn.addEventListener('click', () => { addToCart(btn.dataset.add); }));
  new bootstrap.Modal('#infoModal').show();
}

// === РЕНДЕР: КАТЕГОРИИ И МЕНЮ ============================================
function renderCategories() {
  const cats = ['Все', ...new Set(state.menu.map(m => m.category).filter(Boolean))];
  const bar = document.getElementById('categoryBar');
  bar.innerHTML = cats.map(c => `
    <button class="pill ${c === state.activeCategory ? 'is-active' : ''}" data-cat="${c}">${c}</button>`).join('');
  bar.querySelectorAll('[data-cat]').forEach(btn =>
    btn.addEventListener('click', () => { state.activeCategory = btn.dataset.cat; renderCategories(); renderMenu(); }));
}

function renderMenu() {
  const list = state.activeCategory === 'Все'
    ? state.menu
    : state.menu.filter(m => m.category === state.activeCategory);

  document.getElementById('menuList').innerHTML = list.map(m => {
    const html = m.bigCard ? bigCardHtml(m) : regularCardHtml(m);
    // Подменяем плейсхолдер кнопки/инкрементора на нужное
    const qty = state.cart[m.id]?.qty || 0;
    const btnHtml = qty === 0
      ? `<button class="dish__add" data-add="${m.id}" aria-label="Добавить"><i class="bi bi-plus-lg"></i></button>`
      : `<div class="dish__counter">
          <button data-minus="${m.id}">−</button>
          <span>${qty}</span>
          <button data-plus="${m.id}">+</button>
        </div>`;
    return html.replace('<!-- BTN -->', btnHtml);
  }).join('');

  // Привязываем события
  document.querySelectorAll('#menuList [data-add]').forEach(btn =>
    btn.addEventListener('click', () => {
      addToCart(btn.dataset.add);
      renderMenu(); // перерисовываем, чтобы кнопка стала инкрементором
    }));
  document.querySelectorAll('#menuList [data-plus]').forEach(btn =>
    btn.addEventListener('click', () => {
      changeQty(btn.dataset.plus, 1);
      renderMenu();
    }));
  document.querySelectorAll('#menuList [data-minus]').forEach(btn =>
    btn.addEventListener('click', () => {
      changeQty(btn.dataset.minus, -1);
      renderMenu();
    }));
}

// Обычная карточка: фото сверху, под ним название, описание, цена-пилюля
function regularCardHtml(m) {
  return `
    <article class="dish">
      <div class="dish__media">
        <img src="${m.photoUrl}" loading="lazy" decoding="async" alt="">
        ${m.tags.length ? `<div class="dish__tags">${m.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
        <!-- BTN -->
      </div>
      <div class="dish__body">
        <h3 class="dish__name">${m.name}</h3>
        <p class="dish__desc">${m.description || ''}</p>
        <div class="price-pill">${m.price} ₸</div>
      </div>
    </article>`;
}

// Большая карточка (метка BigCard): название оранжевым капсом, описание, пилюля — сверху; крупное фото — снизу
function bigCardHtml(m) {
  return `
    <article class="dish dish--big">
      <div class="dish__head">
        <h3 class="dish__name">${m.name}</h3>
        <p class="dish__desc">${m.description || ''}</p>
        <div class="price-pill">${m.price} ₸</div>
      </div>
      <div class="dish__media">
        <img src="${m.photoUrl}" loading="lazy" decoding="async" alt="">
        ${m.tags.length ? `<div class="dish__tags">${m.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
        <!-- BTN -->
      </div>
    </article>`;
}

// === КОРЗИНА ============================================================
function addToCart(id) {
  const item = state.menu.find(m => String(m.id) === String(id));
  if (!item) return;
  if (!state.cart[id]) state.cart[id] = { item, qty: 0 };
  state.cart[id].qty++;
  updateCartUI();
}

function changeQty(id, delta) {
  if (!state.cart[id]) return;
  state.cart[id].qty += delta;
  if (state.cart[id].qty <= 0) delete state.cart[id];
  updateCartUI();
  renderCartItems();
  recalcFinal();
}

// Сумма и количество позиций
function cartTotals() {
  let sum = 0, count = 0;
  Object.values(state.cart).forEach(c => { sum += c.item.price * c.qty; count += c.qty; });
  return { sum, count };
}

// Обновить плавающую кнопку корзины
function updateCartUI() {
  const { sum, count } = cartTotals();
  const fab = document.getElementById('cartFab');
  fab.classList.toggle('hidden', count === 0);
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartTotal').textContent = sum;
}

// Отрисовать содержимое корзины внутри модалки
function renderCartItems() {
  const box = document.getElementById('cartItems');
  const entries = Object.entries(state.cart);
  if (!entries.length) { box.innerHTML = '<p class="text-muted">Корзина пуста</p>'; return; }
  box.innerHTML = entries.map(([id, c]) => `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <div><strong>${c.item.name}</strong><br><small class="text-muted">${c.item.price} ₸</small></div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-ghost btn-sm px-3" data-dec="${id}">−</button>
        <strong style="min-width:18px;text-align:center">${c.qty}</strong>
        <button class="btn btn-ghost btn-sm px-3" data-inc="${id}">+</button>
      </div>
    </div>`).join('');
  box.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => changeQty(b.dataset.inc, 1));
  box.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => changeQty(b.dataset.dec, -1));
}

// Текущая скидка по применённому промокоду (пересчитывается от суммы корзины)
function currentDiscount(sum) {
  if (!state.promo) return 0;
  let d = String(state.promo.type).toLowerCase() === 'percent'
    ? Math.floor(sum * Number(state.promo.value) / 100)
    : Number(state.promo.value) || 0;
  return Math.min(d, sum); // не больше суммы заказа
}

// Пересчёт итоговой суммы с учётом промокода и списания бонусов
function recalcFinal() {
  const { sum } = cartTotals();

  // 1) Скидка по промокоду
  const discount = currentDiscount(sum);
  const afterPromo = Math.max(0, sum - discount);
  const discountRow = document.getElementById('discountRow');
  discountRow.classList.toggle('hidden', discount <= 0);
  document.getElementById('discountSum').textContent = '−' + discount + ' ₸';

  // 2) Бонусы: ограничение от суммы ПОСЛЕ скидки (бэк всё равно перепроверит)
  let bonus = Number(document.getElementById('bonusInput').value) || 0;
  const maxByPercent = afterPromo * (state.settings.MaxBonusSpendPercent || 0);
  const maxByBalance = state.user ? state.user.bonusBalance : 0;
  const maxBonus = Math.floor(Math.min(maxByPercent, maxByBalance));
  if (bonus > maxBonus) { bonus = maxBonus; document.getElementById('bonusInput').value = bonus; }
  document.getElementById('bonusMax').textContent = maxBonus;

  // 3) Итог
  document.getElementById('finalSum').textContent = (afterPromo - bonus) + ' ₸';
}

// Применить промокод (проверка на бэке)
async function applyPromo() {
  const code = document.getElementById('promoInput').value.trim();
  const msg = document.getElementById('promoMsg');
  if (!code) { state.promo = null; msg.textContent = ''; recalcFinal(); return; }
  const { sum } = cartTotals();
  try {
    const res = await apiGet('getPromo', { code, total: sum });
    // Храним так, чтобы recalcFinal мог пересчитать скидку при изменении корзины
    state.promo = res.type === 'percent'
      ? { code: res.code, type: 'percent', value: res.discount / Math.max(sum, 1) * 100 }
      : { code: res.code, type: 'fixed', value: res.discount };
    msg.className = 'small mb-2 text-success';
    msg.textContent = `Промокод применён: −${res.discount} ₸`;
  } catch (e) {
    state.promo = null;
    msg.className = 'small mb-2 text-danger';
    msg.textContent = e.message;
  }
  recalcFinal();
}

// === АВТОРИЗАЦИЯ (мгновенная, без кода из WhatsApp) =====================

// Форматирование телефона к виду +7 XXX XXX XX XX. 8/7/+7 — сводим к +7.
function formatPhone(el) {
  let d = el.value.replace(/\D/g, '');
  if (d.charAt(0) === '8') d = '7' + d.slice(1);
  if (d.charAt(0) !== '7') d = '7' + d;
  d = d.slice(0, 11);                 // 7 + 10 цифр
  const rest = d.slice(1);
  let r = '+7';
  if (rest.length) r += ' ' + rest.slice(0, 3);
  if (rest.length > 3) r += ' ' + rest.slice(3, 6);
  if (rest.length > 6) r += ' ' + rest.slice(6, 8);
  if (rest.length > 8) r += ' ' + rest.slice(8, 10);
  el.value = r;
}

async function doRegister() {
  const name = document.getElementById('authName').value.trim();
  const phone = document.getElementById('authPhone').value.trim();
  const address = document.getElementById('authAddress').value.trim();
  const pin = document.getElementById('authPin').value.trim();
  const promocode = document.getElementById('authPromo').value.trim();
  if (!name || !phone) return alert('Введите имя и телефон');
  if (!/^\d{4}$/.test(pin)) return alert('PIN должен состоять из 4 цифр');

  const btn = document.getElementById('authRequestBtn');
  btn.disabled = true; const t = btn.textContent; btn.textContent = 'Сохраняем...';
  try {
    const user = await apiPost('register', { name, phone, address, pin, promocode });
    state.user = user;
    localStorage.setItem('user', JSON.stringify(user));
    document.getElementById('newUserBanner').classList.add('hidden');
    updateProfileUI();
    // Если в корзине есть товары — после входа сразу вернём в корзину
    const authEl = document.getElementById('authModal');
    if (cartTotals().count > 0) {
      authEl.addEventListener('hidden.bs.modal',
        () => new bootstrap.Modal('#cartModal').show(), { once: true });
    }
    bootstrap.Modal.getInstance(authEl).hide();
  } catch (e) {
    alert('Ошибка: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = t;
  }
}

// Профиль в шапке
function updateProfileUI() {
  const label = document.getElementById('profileLabel');
  label.textContent = state.user
    ? `${state.user.name} · ${state.user.bonusBalance}₸`
    : 'Войти';
}

// === ОТПРАВКА ЗАКАЗА ====================================================
async function sendOrder() {
  if (!state.user) {
    // Не залогинен: сначала закрываем корзину, ПОТОМ открываем форму входа.
    // Иначе модалка авторизации появляется ПОД слоем корзины.
    const cartEl = document.getElementById('cartModal');
    const cartInst = bootstrap.Modal.getInstance(cartEl);
    if (cartInst) {
      cartEl.addEventListener('hidden.bs.modal',
        () => new bootstrap.Modal('#authModal').show(), { once: true });
      cartInst.hide();
    } else {
      new bootstrap.Modal('#authModal').show();
    }
    return;
  }
  const { sum, count } = cartTotals();
  if (count === 0) return alert('Корзина пуста');

  const orderType = document.getElementById('orderType').value;
  const payment = document.getElementById('paymentMethod').value;
  const bonusesUsed = Number(document.getElementById('bonusInput').value) || 0;
  const preorder = document.getElementById('preorderTime').value;

  // Рабочие часы: обычный заказ вне графика не принимаем (предзаказ — можно)
  if (orderType !== 'Предзаказ' && state.settings.isOpen === false) {
    return alert('Сейчас мы закрыты (приём с ' + state.settings.WorkHoursStart +
      ' до ' + state.settings.WorkHoursEnd + '). Выберите тип «Предзаказ», чтобы заказать на рабочее время.');
  }
  if (orderType === 'Предзаказ' && !preorder) {
    return alert('Укажите дату и время предзаказа');
  }

  // Запоминаем предпочтения, чтобы подставлять в следующий раз
  localStorage.setItem('prefs', JSON.stringify({ orderType, payment }));

  // Блокируем кнопку, чтобы двойной тап не создал второй заказ
  const btn = document.getElementById('sendOrderBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  const btnHtml = btn.innerHTML;
  btn.innerHTML = 'Отправляем...';

  // Уникальный ключ запроса — бэкенд по нему отсекает повторы
  const requestId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  const items = Object.values(state.cart).map(c => ({
    name: c.item.name, qty: c.qty, price: c.item.price
  }));
  const promoCode = state.promo ? state.promo.code : '';

  try {
    // 1) Сохраняем заказ на бэке (скидка, бонусы и кэшбэк считаются там же)
    const res = await apiPost('createOrder', {
      phone: state.user.phone, items, totalSum: sum,
      bonusesUsed, paymentMethod: payment, orderType, requestId, promoCode,
      preorderTime: orderType === 'Предзаказ' ? preorder : ''
    });

    // 2) Формируем красивый текст для администратора.
    //    Эмодзи заданы escape-кодами (\u{...}) — так их не сломает кодировка редактора.
    const lines = items.map(i => `• ${i.name} ×${i.qty} = ${i.price * i.qty}₸`).join('\n');
    const msg =
      `\u{1F6D2} *Новый заказ ${res.orderId}*\n` +
      `\u{1F464} ${state.user.name}\n\u{1F4DE} ${state.user.phone}\n\u{1F3E0} ${state.user.address || '—'}\n\n` +
      `${lines}\n\n` +
      `Сумма: ${sum}₸\n` +
      (res.discount ? `Скидка по промокоду ${res.promoCode}: −${res.discount}₸\n` : '') +
      (res.bonusesUsed ? `Списано бонусов: ${res.bonusesUsed}₸\n` : '') +
      `*К оплате: ${res.finalSum}₸*\n` +
      `Оплата: ${payment}\nТип: ${orderType}` +
      (orderType === 'Предзаказ' && preorder ? `\nВремя: ${preorder.replace('T', ' ')}` : '');

    const waUrl = `https://wa.me/${state.settings.AdminWhatsApp}?text=${encodeURIComponent(msg)}`;

    // 3) Чистим корзину, промокод и обновляем баланс
    state.cart = {};
    state.promo = null;
    document.getElementById('promoInput').value = '';
    document.getElementById('promoMsg').textContent = '';
    state.user.bonusBalance = res.newBalance;
    localStorage.setItem('user', JSON.stringify(state.user));
    updateCartUI(); updateProfileUI();
    bootstrap.Modal.getInstance(document.getElementById('cartModal')).hide();

    // 4) Переходим в WhatsApp. Именно переход (location), а не window.open —
    //    иначе мобильные браузеры блокируют открытие после ожидания ответа сервера.
    window.location.href = waUrl;
  } catch (e) {
    alert('Ошибка: ' + e.message);
  } finally {
    // Разблокируем кнопку в любом случае
    btn.disabled = false;
    btn.innerHTML = btnHtml;
  }
}

// === ВКЛАДКА "МОИ ЗАКАЗЫ" ===============================================
async function loadOrders() {
  const box = document.getElementById('ordersList');
  if (!state.user) { box.innerHTML = '<p class="text-muted">Войдите, чтобы видеть заказы</p>'; return; }

  // Блок реферальной программы — всегда наверху вкладки
  const refBlock = `
    <div class="ref-card">
      <h6 class="mb-1"><i class="bi bi-gift"></i> Приглашайте друзей</h6>
      <p class="small text-muted mb-2">Друг вводит ваш промокод при регистрации — вы получаете бонусами с каждого его заказа.</p>
      <div class="d-flex gap-2">
        <input class="form-control text-center fw-bold" value="${state.user.referralCode}" readonly>
        <button class="btn btn-ghost" id="copyRefBtn" title="Скопировать"><i class="bi bi-clipboard"></i></button>
        <button class="btn btn-wa" id="shareRefBtn" title="Поделиться"><i class="bi bi-whatsapp"></i></button>
      </div>
    </div>`;

  box.innerHTML = refBlock + '<p class="text-muted">Загрузка заказов...</p>';
  bindReferralButtons();

  try {
    const orders = await apiGet('getOrders', { phone: state.user.phone });
    window._lastOrders = orders; // для кнопки «Повторить»
    const statusColors = { 'Новый':'#8A8A8E','Готовится':'#E8A317','В пути':'#2F73E8','Доставлен':'#1FAA53','Отменён':'#E2492F' };
    const ordersHtml = !orders.length
      ? '<p class="text-muted">Заказов пока нет</p>'
      : orders.map((o, idx) => {
        const st = o.status || 'Новый';
        const color = statusColors[st] || '#8A8A8E';
        const timeInfo = o.deliveryTime
          ? `<div style="margin-top:8px;padding:9px 12px;border-radius:12px;background:#FFF4E5;border:1px solid #FFD79A;color:#B26A00;font-weight:600;font-size:14px">
               <i class="bi bi-clock-fill"></i> Время доставки: ${o.deliveryTime}</div>`
          : (o.preorderTime ? `<div class="small mt-1 text-muted"><i class="bi bi-calendar"></i> Предзаказ на: ${String(o.preorderTime).replace('T',' ')}</div>` : '');
        const cashback = (o.bonusesAccrued > 0)
          ? (st === 'Доставлен'
              ? `<div class="small mt-1" style="color:#1FAA53"><i class="bi bi-coin"></i> Начислен кэшбэк +${o.bonusesAccrued} ₸</div>`
              : `<div class="small mt-1 text-muted"><i class="bi bi-coin"></i> Кэшбэк +${o.bonusesAccrued} ₸ после доставки</div>`)
          : '';
        return `
        <div class="order-card">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <strong>${o.orderId}</strong>
            <span style="background:${color};color:#fff;font-weight:700;font-size:14px;padding:6px 14px;border-radius:999px">${st}</span>
          </div>
          <small class="text-muted">${new Date(o.dateTime).toLocaleString('ru-RU')} · ${o.orderType}</small>
          <div class="small mt-2 mb-2" style="white-space:pre-line">${o.items}</div>
          ${timeInfo}
          ${cashback}
          <div class="d-flex justify-content-between align-items-center mt-2">
            <strong>${o.totalSum - o.bonusesUsed - (o.discount || 0)} ₸</strong>
            <button class="btn btn-ghost btn-sm" data-repeat="${idx}"><i class="bi bi-arrow-repeat"></i> Повторить</button>
          </div>
        </div>`; }).join('');
    box.innerHTML = refBlock + ordersHtml;
    bindReferralButtons();
    document.querySelectorAll('[data-repeat]').forEach(b =>
      b.addEventListener('click', () => repeatOrder(Number(b.dataset.repeat))));
  } catch (e) {
    box.innerHTML = refBlock + '<p class="text-danger">Ошибка: ' + e.message + '</p>';
    bindReferralButtons();
  }
}

// Кнопки "копировать" и "поделиться" для реферального кода
function bindReferralButtons() {
  const code = state.user.referralCode;
  const copyBtn = document.getElementById('copyRefBtn');
  const shareBtn = document.getElementById('shareRefBtn');
  if (copyBtn) copyBtn.onclick = () => {
    navigator.clipboard.writeText(code).then(() => alert('Промокод скопирован: ' + code));
  };
  if (shareBtn) shareBtn.onclick = () => {
    const text = `Заказывай вкусно! Введи мой промокод ${code} при регистрации 🎁`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };
}

// Повторить прошлый заказ — кладёт его позиции обратно в корзину
function repeatOrder(idx) {
  const orders = window._lastOrders || [];
  const o = orders[idx];
  if (!o) return;
  let added = 0, missing = 0;
  String(o.items).split('\n').filter(Boolean).forEach(line => {
    const m = line.match(/^(.*) x(\d+) — /); // "Название xКОЛ — СУММА₸"
    if (!m) return;
    const name = m[1].trim(), qty = Number(m[2]) || 1;
    const item = state.menu.find(mi => mi.name === name);
    if (item) {
      if (!state.cart[item.id]) state.cart[item.id] = { item, qty: 0 };
      state.cart[item.id].qty += qty; added++;
    } else missing++;
  });
  updateCartUI();
  if (added) { switchPage('menu'); new bootstrap.Modal('#cartModal').show(); }
  if (missing && added) alert('Некоторых позиций больше нет в меню — добавил остальные.');
  if (!added) alert('Эти позиции сейчас недоступны.');
}

// === ПЕРЕКЛЮЧЕНИЕ СТРАНИЦ ================================================
function switchPage(page) {
  document.getElementById('menuPage').classList.toggle('hidden', page !== 'menu');
  document.getElementById('ordersPage').classList.toggle('hidden', page !== 'orders');
  document.querySelectorAll('.navbar-bottom .nav-link').forEach(l =>
    l.classList.toggle('active', l.dataset.page === page));
  if (page === 'orders') loadOrders();
}

// === ПРИВЯЗКА СОБЫТИЙ ====================================================
function bindEvents() {
  // нижнее меню
  document.querySelectorAll('.navbar-bottom .nav-link').forEach(l =>
    l.addEventListener('click', e => { e.preventDefault(); switchPage(l.dataset.page); }));

  // профиль / вход
  document.getElementById('profileBtn').addEventListener('click', () => {
    if (state.user) {
      if (confirm('Выйти из аккаунта?')) { localStorage.removeItem('user'); location.reload(); }
    } else new bootstrap.Modal('#authModal').show();
  });

  // авторизация (один шаг)
  document.getElementById('authRequestBtn').addEventListener('click', doRegister);

  // телефон: всегда начинается с +7, пользователь дописывает остальное
  const phoneEl = document.getElementById('authPhone');
  phoneEl.addEventListener('focus', () => { if (!phoneEl.value.trim()) phoneEl.value = '+7 '; });
  phoneEl.addEventListener('input', () => formatPhone(phoneEl));

  // корзина: открытие модалки
  document.getElementById('cartModal').addEventListener('show.bs.modal', () => {
    renderCartItems();
    // подставляем прошлые предпочтения (тип заказа и оплату)
    try {
      const prefs = JSON.parse(localStorage.getItem('prefs') || '{}');
      if (prefs.orderType) document.getElementById('orderType').value = prefs.orderType;
      if (prefs.payment) document.getElementById('paymentMethod').value = prefs.payment;
    } catch (e) {}
    document.getElementById('preorderBox').classList.toggle('hidden',
      document.getElementById('orderType').value !== 'Предзаказ');
    // показать блок бонусов, если есть баланс
    const hasBonus = state.user && state.user.bonusBalance > 0;
    document.getElementById('bonusBox').classList.toggle('hidden', !hasBonus);
    if (hasBonus) document.getElementById('bonusAvail').textContent = state.user.bonusBalance;
    recalcFinal();
  });

  // тип заказа -> показать выбор времени для предзаказа
  document.getElementById('orderType').addEventListener('change', e =>
    document.getElementById('preorderBox').classList.toggle('hidden', e.target.value !== 'Предзаказ'));

  // ввод бонусов -> пересчёт
  document.getElementById('bonusInput').addEventListener('input', recalcFinal);

  // промокод: применить
  document.getElementById('promoApplyBtn').addEventListener('click', applyPromo);

  // отправка заказа
  document.getElementById('sendOrderBtn').addEventListener('click', sendOrder);
}
