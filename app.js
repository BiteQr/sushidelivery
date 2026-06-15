/* ============================================================================
 *  FOOD ORDER APP — ФРОНТЕНД (app.js)
 *  Архитектура: единый объект state + функции api / render / handlers.
 * ========================================================================== */

// !!! ВСТАВЬТЕ СЮДА URL ВАШЕГО ВЕБ-ПРИЛОЖЕНИЯ GAS (заканчивается на /exec) !!!
const API_URL = 'https://script.google.com/macros/s/AKfycbzc2BrNjTwEBtsMIU-j9TNaiAFbc13jq9jBkXxKW6UWbMfBMnI5zn2AH6vFL08oOuKk/exec';

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
  try {
    // Грузим параллельно настройки, меню и баннеры
    const [settings, menu, banners] = await Promise.all([
      apiGet('getSettings'),
      apiGet('getMenu'),
      apiGet('getBanners')
    ]);
    state.settings = settings;
    state.menu = menu;
    state.banners = banners;
    renderBanners();
    renderCategories();
    renderMenu();
    if (state.user) refreshUser(); // обновим баланс
  } catch (e) {
    alert('Ошибка загрузки: ' + e.message);
  }
  updateProfileUI();
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

// === РЕНДЕР: БАННЕРЫ =====================================================
function renderBanners() {
  const box = document.getElementById('bannerScroll');
  box.innerHTML = state.banners.map(b => `
    <div class="banner-card shadow-sm" data-banner="${b.id}">
      <img src="${b.imageUrl}" alt="">
      <div class="caption"><strong>${b.title}</strong></div>
    </div>`).join('');

  box.querySelectorAll('[data-banner]').forEach(el =>
    el.addEventListener('click', () => openBanner(el.dataset.banner)));
}

// Модалка акции со списком привязанных блюд
function openBanner(id) {
  const b = state.banners.find(x => x.id === id);
  const linked = state.menu.filter(m => b.productIds.includes(String(m.id)));
  document.getElementById('infoTitle').textContent = b.title;
  document.getElementById('infoBody').innerHTML = `
    <img src="${b.imageUrl}" class="img-fluid rounded mb-3">
    <p>${b.description || ''}</p>
    ${linked.map(m => `
      <div class="d-flex justify-content-between align-items-center border-top py-2">
        <div><strong>${m.name}</strong><br><small class="text-muted">${m.price} ₸</small></div>
        <button class="btn btn-sm btn-accent" data-add="${m.id}">В корзину</button>
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
    <button class="btn btn-sm cat-pill ${c === state.activeCategory ? 'btn-accent' : 'btn-outline-secondary'}"
            data-cat="${c}">${c}</button>`).join('');
  bar.querySelectorAll('[data-cat]').forEach(btn =>
    btn.addEventListener('click', () => { state.activeCategory = btn.dataset.cat; renderCategories(); renderMenu(); }));
}

function renderMenu() {
  const list = state.activeCategory === 'Все'
    ? state.menu
    : state.menu.filter(m => m.category === state.activeCategory);

  document.getElementById('menuList').innerHTML = list.map(m => `
    <div class="card menu-card mb-2 shadow-sm">
      <div class="card-body d-flex gap-3 p-2">
        <img src="${m.photoUrl}" alt="">
        <div class="flex-fill">
          <div class="d-flex gap-1 mb-1">
            ${m.tags.map(t => `<span class="badge text-bg-warning tag-badge">${t}</span>`).join('')}
          </div>
          <strong>${m.name}</strong>
          <p class="small text-muted mb-1">${m.description || ''}</p>
          <div class="d-flex justify-content-between align-items-center">
            <span class="fw-bold">${m.price} ₸</span>
            <button class="btn btn-sm btn-accent" data-add="${m.id}">
              <i class="bi bi-plus-lg"></i></button>
          </div>
        </div>
      </div>
    </div>`).join('');

  document.querySelectorAll('#menuList [data-add]').forEach(btn =>
    btn.addEventListener('click', () => addToCart(btn.dataset.add)));
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
    <div class="d-flex justify-content-between align-items-center mb-2">
      <div><strong>${c.item.name}</strong><br><small class="text-muted">${c.item.price} ₸</small></div>
      <div class="btn-group btn-group-sm">
        <button class="btn btn-outline-secondary" data-dec="${id}">−</button>
        <span class="btn btn-light disabled">${c.qty}</span>
        <button class="btn btn-outline-secondary" data-inc="${id}">+</button>
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

// === АВТОРИЗАЦИЯ ========================================================
async function requestAuth() {
  const name = document.getElementById('authName').value.trim();
  const phone = document.getElementById('authPhone').value.trim();
  const address = document.getElementById('authAddress').value.trim();
  const promocode = document.getElementById('authPromo').value.trim();
  if (!name || !phone) return alert('Введите имя и телефон');

  try {
    const res = await apiPost('requestAuth', { name, phone, address, promocode });
    state.pendingAuth = { phone, token: res.token };
    // Готовим ссылку WhatsApp с готовым текстом
    const text = encodeURIComponent(res.message);
    document.getElementById('waConfirmLink').href =
      `https://wa.me/${res.adminWhatsApp}?text=${text}`;
    // Переключаем шаги
    document.getElementById('authStep1').classList.add('hidden');
    document.getElementById('authStep2').classList.remove('hidden');
  } catch (e) { alert('Ошибка: ' + e.message); }
}

async function confirmAuth() {
  if (!state.pendingAuth) return;
  try {
    const user = await apiPost('confirmAuth', state.pendingAuth);
    state.user = user;
    localStorage.setItem('user', JSON.stringify(user));
    document.getElementById('newUserBanner').classList.add('hidden');
    updateProfileUI();
    // сброс формы
    document.getElementById('authStep1').classList.remove('hidden');
    document.getElementById('authStep2').classList.add('hidden');
    // Если в корзине есть товары — после входа сразу вернём в корзину
    const authEl = document.getElementById('authModal');
    if (cartTotals().count > 0) {
      authEl.addEventListener('hidden.bs.modal',
        () => new bootstrap.Modal('#cartModal').show(), { once: true });
    }
    bootstrap.Modal.getInstance(authEl).hide();
  } catch (e) { alert('Ошибка: ' + e.message); }
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

  // Блокируем кнопку, чтобы двойной тап не создал второй заказ
  const btn = document.getElementById('sendOrderBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  const btnHtml = btn.innerHTML;
  btn.innerHTML = 'Отправляем...';

  const orderType = document.getElementById('orderType').value;
  const payment = document.getElementById('paymentMethod').value;
  const bonusesUsed = Number(document.getElementById('bonusInput').value) || 0;
  const preorder = document.getElementById('preorderTime').value;

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
      bonusesUsed, paymentMethod: payment, orderType, requestId, promoCode
    });

    // 2) Формируем красивый текст для администратора
    const lines = items.map(i => `• ${i.name} ×${i.qty} = ${i.price * i.qty}₸`).join('\n');
    const msg =
      `🛒 *Новый заказ ${res.orderId}*\n` +
      `👤 ${state.user.name}\n📞 ${state.user.phone}\n🏠 ${state.user.address || '—'}\n\n` +
      `${lines}\n\n` +
      `Сумма: ${sum}₸\n` +
      (res.discount ? `Скидка по промокоду ${res.promoCode}: −${res.discount}₸\n` : '') +
      (res.bonusesUsed ? `Списано бонусов: ${res.bonusesUsed}₸\n` : '') +
      `*К оплате: ${res.finalSum}₸*\n` +
      `Оплата: ${payment}\nТип: ${orderType}` +
      (orderType === 'Предзаказ' && preorder ? `\nВремя: ${preorder.replace('T', ' ')}` : '');

    // 3) Открываем WhatsApp админа
    window.open(`https://wa.me/${state.settings.AdminWhatsApp}?text=${encodeURIComponent(msg)}`, '_blank');

    // 4) Чистим корзину, промокод и обновляем баланс
    state.cart = {};
    state.promo = null;
    document.getElementById('promoInput').value = '';
    document.getElementById('promoMsg').textContent = '';
    state.user.bonusBalance = res.newBalance;
    localStorage.setItem('user', JSON.stringify(state.user));
    updateCartUI(); updateProfileUI();
    bootstrap.Modal.getInstance(document.getElementById('cartModal')).hide();
    alert(`Заказ оформлен! Начислено бонусов: ${res.accrued}₸`);
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
    <div class="card mb-3 border-warning shadow-sm">
      <div class="card-body p-3">
        <h6 class="mb-1"><i class="bi bi-gift"></i> Приглашайте друзей</h6>
        <p class="small text-muted mb-2">Друг вводит ваш промокод при регистрации — вы получаете 10% бонусами с каждого его заказа.</p>
        <div class="d-flex gap-2">
          <input class="form-control text-center fw-bold" value="${state.user.referralCode}" readonly>
          <button class="btn btn-outline-secondary" id="copyRefBtn" title="Скопировать"><i class="bi bi-clipboard"></i></button>
          <button class="btn btn-success" id="shareRefBtn" title="Поделиться"><i class="bi bi-whatsapp"></i></button>
        </div>
      </div>
    </div>`;

  box.innerHTML = refBlock + '<p class="text-muted">Загрузка заказов...</p>';
  bindReferralButtons();

  try {
    const orders = await apiGet('getOrders', { phone: state.user.phone });
    const ordersHtml = !orders.length
      ? '<p class="text-muted">Заказов пока нет</p>'
      : orders.map(o => `
        <div class="card mb-2 shadow-sm"><div class="card-body p-3">
          <div class="d-flex justify-content-between">
            <strong>${o.orderId}</strong>
            <span class="badge text-bg-secondary">${o.orderType}</span>
          </div>
          <small class="text-muted">${new Date(o.dateTime).toLocaleString('ru-RU')}</small>
          <div class="small mt-2 mb-1" style="white-space:pre-line">${o.items}</div>
          <div class="d-flex justify-content-between small">
            <span>Оплата: ${o.paymentMethod}</span>
            <strong>${o.totalSum - o.bonusesUsed} ₸</strong>
          </div>
        </div></div>`).join('');
    box.innerHTML = refBlock + ordersHtml;
    bindReferralButtons();
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

  // авторизация
  document.getElementById('authRequestBtn').addEventListener('click', requestAuth);
  document.getElementById('authConfirmBtn').addEventListener('click', confirmAuth);

  // корзина: открытие модалки
  document.getElementById('cartModal').addEventListener('show.bs.modal', () => {
    renderCartItems();
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
