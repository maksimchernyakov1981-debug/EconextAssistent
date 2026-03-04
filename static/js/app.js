// Telegram WebApp API
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
} else {
    console.warn('Telegram WebApp API не доступен. Работаем в режиме разработки.');
}

// Base URL для API запросов
// Приоритет: window.API_BASE_URL (устанавливается сервером) > window.location.origin
// Это нужно, когда мини-приложение на Vercel, а API на другом сервере
const API_BASE_URL = window.API_BASE_URL || window.location.origin;
console.log('🌐 Базовый URL для API:', API_BASE_URL);
console.log('📍 Текущий URL:', window.location.href);
console.log('📍 window.location.origin:', window.location.origin);
console.log('📍 window.API_BASE_URL:', window.API_BASE_URL);
if (API_BASE_URL === window.location.origin) {
    console.warn('⚠️ API_BASE_URL равен window.location.origin. Если мини-приложение на Vercel, а API на другом сервере, установите API_BASE_URL в .env');
}

// Helper function to get user ID from Telegram WebApp
function getUserId() {
    // Метод 0: Проверка доступности Telegram WebApp API
    if (!tg) {
        console.warn('⚠️ Telegram WebApp API не доступен. Используем тестовый режим.');
        // В режиме разработки используем тестовый ID
        const urlParams = new URLSearchParams(window.location.search);
        const testUserId = urlParams.get('test_user_id');
        if (testUserId) {
            console.warn('✅ Используется тестовый user_id из URL: ' + testUserId);
            return parseInt(testUserId);
        }
        // Если нет тестового ID, используем дефолтный для разработки
        console.warn('⚠️ Используется дефолтный тестовый user_id: 123456789');
        return 123456789; // Дефолтный тестовый ID для разработки
    }
    
    // Метод 1: initDataUnsafe (быстрый, но может быть недоступен)
    if (tg.initDataUnsafe?.user?.id) {
        const userId = tg.initDataUnsafe.user.id;
        console.log('✅ User ID получен из initDataUnsafe:', userId);
        return userId;
    }
    
    // Метод 2: Парсинг initData (более надежный)
    if (tg.initData) {
        try {
            const params = new URLSearchParams(tg.initData);
            const userParam = params.get('user');
            if (userParam) {
                const user = JSON.parse(decodeURIComponent(userParam));
                if (user?.id) {
                    const userId = user.id;
                    console.log('✅ User ID получен из initData:', userId);
                    return userId;
                }
            }
        } catch (e) {
            console.error('❌ Ошибка парсинга initData:', e);
        }
    }
    
    // Метод 3: Попытка получить из query параметров (для тестирования)
    const urlParams = new URLSearchParams(window.location.search);
    const testUserId = urlParams.get('test_user_id');
    if (testUserId) {
        console.warn('✅ Используется тестовый user_id из URL параметров:', testUserId);
        return parseInt(testUserId);
    }
    
    // Метод 4: Для разработки используем дефолтный ID
    console.warn('⚠️ Не удалось определить user_id из Telegram. Используется тестовый режим.');
    console.warn('💡 Для тестирования добавьте ?test_user_id=YOUR_ID в URL');
    return 123456789; // Дефолтный тестовый ID
}

// State
let state = {
    products: [],
    categories: [],
    cart: [],
    currentCategory: null,
    currentProduct: null,
    currentPage: 1,
    itemsPerPage: 10,
    currentScreen: 'home',
    catalogView: 'categories', // 'categories' | 'products' | 'all' | 'product'
    infoSubSection: null       // null | 'faq' | 'order-conditions' | ...
};

// Helper function to safely parse JSON response
async function safeJsonParse(response) {
    try {
        // Клонируем response для чтения текста без потери оригинала
        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        
        // Если ответ не OK, пытаемся получить сообщение об ошибке
        if (!response.ok) {
            let errorData = null;
            try {
                if (isJson) {
                    errorData = await response.json();
                } else {
                    const text = await response.text();
                    console.error(`HTTP ${response.status} - Не-JSON ответ для ${response.url}:`, text.substring(0, 500));
                    // Пытаемся извлечь полезную информацию из HTML
                    const htmlMatch = text.match(/<title>(.*?)<\/title>/i) || text.match(/<h1>(.*?)<\/h1>/i);
                    let errorMsg = htmlMatch ? htmlMatch[1] : `HTTP ${response.status}: ${response.statusText}`;
                    
                    // Специальная обработка для 404
                    if (response.status === 404) {
                        errorMsg = `Endpoint не найден: ${new URL(response.url).pathname}`;
                    }
                    
                    return { 
                        success: false, 
                        error: errorMsg,
                        status: response.status,
                        data: [] 
                    };
                }
            } catch (parseError) {
                console.error('Ошибка парсинга ответа об ошибке:', parseError);
                let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
                if (response.status === 404) {
                    errorMsg = `Endpoint не найден: ${new URL(response.url).pathname}`;
                }
                return { 
                    success: false, 
                    error: errorMsg,
                    status: response.status,
                    data: [] 
                };
            }
            
            // Если получили JSON с ошибкой, возвращаем его
            if (errorData) {
                return {
                    success: false,
                    error: errorData.error || errorData.message || `HTTP ${response.status}`,
                    status: response.status,
                    ...errorData
                };
            }
        }
        
        // Если ответ OK и это JSON
        if (isJson) {
            return await response.json();
        }
        
        // Если ответ OK, но не JSON - читаем как текст
        const text = await response.text();
        console.warn('Получен не-JSON ответ (OK):', text.substring(0, 200));
        
        // Пытаемся распарсить как JSON вручную (на случай если content-type неправильный)
        try {
            return JSON.parse(text);
        } catch {
            return { 
                success: false, 
                error: 'Invalid response format: expected JSON, got ' + contentType,
                data: [] 
            };
        }
    } catch (error) {
        console.error('Критическая ошибка парсинга ответа:', error);
        return { 
            success: false, 
            error: error.message || 'Unknown error',
            data: [] 
        };
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Инициализация Mini App...');
    console.log('🌐 API:', API_BASE_URL);
    const userId = getUserId();
    console.log('User ID:', userId || 'не определен');
    
    await loadData();
    setupEventListeners();
    updateCartCount();
    updateHomeCartSummary();
});

// Load data
async function loadData() {
    showLoading(true);
    try {
        // Загружаем товары
        let productsData = { success: false, products: [], error: 'Unknown error' };
        try {
            const url = `${API_BASE_URL}/api/products`;
            console.log('📦 Запрос товаров - URL:', url);
            const productsRes = await fetch(url);
            console.log('📦 Ответ товаров - статус:', productsRes.status, 'URL:', productsRes.url, 'content-type:', productsRes.headers.get('content-type'));
            productsData = await safeJsonParse(productsRes);
            if (!productsData.products) {
                productsData.products = [];
            }
            console.log('📦 Результат загрузки товаров:', productsData.success ? `✅ ${productsData.products?.length || 0} товаров` : `❌ ${productsData.error}`);
        } catch (error) {
            console.error('❌ Критическая ошибка загрузки товаров:', error);
            console.error('❌ URL запроса был:', `${API_BASE_URL}/api/products`);
            console.error('❌ Тип ошибки:', error.name, 'Сообщение:', error.message);
            productsData = { success: false, error: error.message || 'Network error', products: [] };
        }
        
        // Загружаем категории
        let categoriesData = { success: false, categories: [], error: 'Unknown error' };
        try {
            const url = `${API_BASE_URL}/api/categories`;
            console.log('📁 Запрос категорий - URL:', url);
            const categoriesRes = await fetch(url);
            console.log('📁 Ответ категорий - статус:', categoriesRes.status, 'URL:', categoriesRes.url, 'content-type:', categoriesRes.headers.get('content-type'));
            categoriesData = await safeJsonParse(categoriesRes);
            if (!categoriesData.categories) {
                categoriesData.categories = [];
            }
            console.log('📁 Результат загрузки категорий:', categoriesData.success ? `✅ ${categoriesData.categories?.length || 0} категорий` : `❌ ${categoriesData.error}`);
        } catch (error) {
            console.error('❌ Критическая ошибка загрузки категорий:', error);
            console.error('❌ URL запроса был:', `${API_BASE_URL}/api/categories`);
            console.error('❌ Тип ошибки:', error.name, 'Сообщение:', error.message);
            categoriesData = { success: false, error: error.message || 'Network error', categories: [] };
        }
        
        // Обрабатываем результаты
        if (productsData.success && productsData.products && productsData.products.length > 0) {
            state.products = productsData.products;
            console.log(`✅ Загружено ${state.products.length} товаров`);
            // Показываем категории, если товары загружены
            if (categoriesData.success && categoriesData.categories && categoriesData.categories.length > 0) {
                state.categories = categoriesData.categories;
                renderCategories();
                console.log(`✅ Загружено ${state.categories.length} категорий`);
            } else {
                console.warn('⚠️ Категории не загружены:', categoriesData.error);
                state.categories = categoriesData.categories || [];
            }
        } else {
            console.error('❌ Товары не загружены:', productsData.error || 'Неизвестная ошибка');
            state.products = productsData.products || [];
            state.categories = categoriesData.categories || [];
            
            // Показываем понятное сообщение пользователю
            const errorMsg = productsData.error || 'Каталог товаров еще не загружен. Пожалуйста, подождите немного и обновите страницу.';
            showError(errorMsg);
            
            // Показываем пустое состояние
            const catalogTab = document.getElementById('catalog-tab');
            if (catalogTab) {
                const emptyState = document.createElement('div');
                emptyState.className = 'empty-state';
                emptyState.innerHTML = `
                    <p>📦 Каталог товаров загружается...</p>
                    <p class="text-muted">${errorMsg}</p>
                    <button class="btn-primary" onclick="location.reload()">🔄 Обновить страницу</button>
                `;
                catalogTab.appendChild(emptyState);
            }
        }
        
        await loadCart();
    } catch (error) {
        console.error('Критическая ошибка загрузки данных:', error);
        showError('Ошибка загрузки данных: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Load cart
async function loadCart() {
    const userId = getUserId();
    // В тестовом режиме userId всегда будет определен
    if (!userId) {
        console.warn('⚠️ Не удалось загрузить корзину: user_id не определен (тестовый режим)');
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/cart?user_id=${userId}`);
        const data = await safeJsonParse(res);
        if (data.success) {
            state.cart = data.cart;
            renderCart();
            updateCartCount();
            updateHomeCartSummary();
        } else {
            console.warn('Ошибка загрузки корзины:', data.error);
        }
    } catch (error) {
        console.error('Ошибка загрузки корзины:', error);
    }
}

// --- Навигация по экранам (как в боте) ---
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
    const screen = document.getElementById('screen-' + screenId);
    if (screen) screen.classList.add('active');
    state.currentScreen = screenId;
    
    const headerBack = document.getElementById('header-back');
    if (headerBack) headerBack.classList.toggle('hidden', screenId === 'home');
    
    if (screenId === 'catalog') {
        state.catalogView = 'categories';
        showCatalogView('categories');
    } else if (screenId === 'info') {
        state.infoSubSection = null;
        document.getElementById('info-menu').classList.remove('hidden');
        document.getElementById('info-content').classList.add('hidden');
    } else if (screenId === 'cart') {
        loadCart();
    } else if (screenId === 'ai') {
        const messagesContainer = document.getElementById('ai-messages');
        if (messagesContainer && messagesContainer.children.length === 0) {
            addAIMessage('assistant', '👋 Привет! Я Максим, ИИ-консультант по микрофибре. Спрашивайте о товарах, уборке, использовании — отвечу и подскажу товары.');
        }
        setTimeout(() => document.getElementById('ai-input')?.focus(), 100);
    } else if (screenId === 'orders') {
        loadOrders();
    } else if (screenId === 'referral') {
        loadReferralContent();
    }
    
    updateHomeCartSummary();
}

function showCatalogView(view) {
    state.catalogView = view;
    document.getElementById('categories-section').classList.toggle('hidden', view !== 'categories');
    document.getElementById('products-section').classList.toggle('hidden', view !== 'products');
    document.getElementById('all-products-section').classList.toggle('hidden', view !== 'all');
    document.getElementById('product-details').classList.toggle('hidden', view !== 'product');
    if (view === 'categories') renderCategories();
    else if (view === 'products') renderProducts();
}

function goBack() {
    if (state.currentScreen === 'catalog') {
        if (state.catalogView === 'product') {
            showCatalogView(state.currentCategory ? 'products' : 'all');
        } else if (state.catalogView === 'products' || state.catalogView === 'all') {
            showCatalogView('categories');
        } else {
            showScreen('home');
        }
    } else if (state.currentScreen === 'info' && state.infoSubSection) {
        state.infoSubSection = null;
        document.getElementById('info-menu').classList.remove('hidden');
        document.getElementById('info-content').classList.add('hidden');
    } else {
        showScreen('home');
    }
}

function updateHomeCartSummary() {
    const el = document.getElementById('home-cart-summary');
    if (!el) return;
    if (state.cart.length === 0) {
        el.textContent = 'Пусто';
        return;
    }
    const count = state.cart.reduce((s, i) => s + i.quantity, 0);
    const total = state.cart.reduce((s, i) => s + (i.subtotal || 0), 0);
    el.textContent = count + ' т., ' + total.toFixed(0) + ' ₽';
}

// Setup event listeners
function setupEventListeners() {
    document.querySelectorAll('.menu-btn[data-screen]').forEach(btn => {
        btn.addEventListener('click', () => showScreen(btn.dataset.screen));
    });
    document.querySelectorAll('.btn-back-to-menu[data-screen]').forEach(btn => {
        btn.addEventListener('click', () => showScreen(btn.dataset.screen));
    });
    
    document.getElementById('header-back')?.addEventListener('click', goBack);
    document.getElementById('back-from-info-section')?.addEventListener('click', goBack);
    document.getElementById('header-cart')?.addEventListener('click', () => showScreen('cart'));
    
    document.querySelector('#cart-empty [data-screen="catalog"]')?.addEventListener('click', () => showScreen('catalog'));
    
    document.getElementById('checkout-btn')?.addEventListener('click', openCheckoutModal);
    document.getElementById('checkout-form')?.addEventListener('submit', handleCheckout);
    document.getElementById('close-checkout')?.addEventListener('click', closeCheckoutModal);
    
    document.getElementById('btn-show-all-products')?.addEventListener('click', () => {
        if (state.currentScreen !== 'catalog') showScreen('catalog');
        showAllProducts();
    });
    document.getElementById('search-btn')?.addEventListener('click', searchProducts);
    document.getElementById('search-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchProducts(); });
    
    document.getElementById('ai-send-btn')?.addEventListener('click', sendAIMessage);
    document.getElementById('ai-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendAIMessage(); });
    
    document.querySelectorAll('.info-menu-item[data-info]').forEach(btn => {
        btn.addEventListener('click', () => showInfoSection(btn.dataset.info));
    });
    
    document.getElementById('toggle-subscription-btn')?.addEventListener('click', toggleSubscription);
    document.getElementById('wholesale-form')?.addEventListener('submit', submitWholesale);
    
    document.getElementById('back-from-product')?.addEventListener('click', () => goBack());
}

// Show loading
function showLoading(show) {
    document.getElementById('loading').classList.toggle('hidden', !show);
}

// Show error
function showError(message) {
    const errorEl = document.getElementById('error');
    document.getElementById('error-message').textContent = message;
    errorEl.classList.remove('hidden');
    setTimeout(() => errorEl.classList.add('hidden'), 5000);
}

// Совместимость: showTab -> showScreen
function showTab(tabName) {
    const map = { catalog: 'catalog', ai: 'ai', cart: 'cart', info: 'info' };
    showScreen(map[tabName] || tabName);
}

// Render categories
function renderCategories() {
    const container = document.getElementById('categories-list');
    if (!container) {
        console.error('Контейнер categories-list не найден');
        return;
    }
    
    container.innerHTML = '';
    
    if (state.categories.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Категории не найдены</p></div>';
        return;
    }
    
    state.categories.forEach(category => {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.innerHTML = `
            <div class="emoji">${getCategoryEmoji(category.name)}</div>
            <div class="name">${escapeHtml(category.name)}</div>
        `;
        card.addEventListener('click', () => showProducts(category.id));
        container.appendChild(card);
    });
    
    console.log(`✅ Отображено ${state.categories.length} категорий`);
}

// Show products (в каталоге)
function showProducts(categoryId) {
    state.currentCategory = categoryId;
    state.currentPage = 1;
    const category = state.categories.find(c => c.id === categoryId);
    document.getElementById('category-title').textContent = category?.name || 'Товары';
    showCatalogView('products');
    renderProducts();
}

// Show categories (назад к категориям)
function showCategories() {
    state.currentCategory = null;
    state.currentProduct = null;
    showCatalogView('categories');
}

// Render products
function renderProducts() {
    const container = document.getElementById('products-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!state.products || state.products.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Товары не загружены</p></div>';
        return;
    }
    
    const categoryProducts = state.products.filter(p => 
        p.categoryId === state.currentCategory
    );
    
    if (categoryProducts.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>В этой категории пока нет товаров</p></div>';
        return;
    }
    
    const start = (state.currentPage - 1) * state.itemsPerPage;
    const end = start + state.itemsPerPage;
    const pageProducts = categoryProducts.slice(start, end);
    
    pageProducts.forEach(product => {
        const card = createProductCard(product);
        container.appendChild(card);
    });
    
    renderPagination(categoryProducts.length);
}

// Create product card
function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    
    const image = product.pictures && product.pictures[0] 
        ? `<img src="${escapeHtml(product.pictures[0])}" alt="${escapeHtml(product.name)}" class="product-image" onerror="this.style.display='none'">`
        : '<div class="product-image" style="display:flex;align-items:center;justify-content:center;font-size:48px;">📦</div>';
    
    card.innerHTML = `
        ${image}
        <div class="product-info">
            <div class="product-name">${escapeHtml(product.name)}</div>
            <div>
                <span class="product-price">${product.price} руб.</span>
                ${product.oldprice ? `<span class="product-old-price">${product.oldprice} ₽</span>` : ''}
            </div>
        </div>
    `;
    
    card.addEventListener('click', () => showProductDetails(product));
    return card;
}

// Show product details
function showProductDetails(product) {
    state.currentProduct = product;
    showCatalogView('product');
    
    const container = document.getElementById('product-content');
    const image = product.pictures && product.pictures[0]
        ? `<img src="${escapeHtml(product.pictures[0])}" alt="${escapeHtml(product.name)}" class="product-details-image" onerror="this.style.display='none'">`
        : '';
    
    container.innerHTML = `
        ${image}
        <div class="product-details-name">${escapeHtml(product.name)}</div>
        <div class="product-details-price">${product.price} ₽</div>
        <div class="product-details-description">${escapeHtml(product.description || 'Нет описания')}</div>
        <button class="btn-primary" onclick="addToCart('${product.id}')">➕ Добавить в корзину</button>
    `;
}

// Add to cart
async function addToCart(productId) {
    const userId = getUserId();
    // getUserId() всегда возвращает значение (реальный или тестовый)
    if (!userId) {
        console.error('❌ Критическая ошибка: userId не определен');
        const errorMsg = 'Ошибка: не удалось определить пользователя. Попробуйте обновить страницу.';
        if (tg && tg.showAlert) {
            tg.showAlert(errorMsg);
        } else {
            alert(errorMsg);
        }
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/cart/add`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                product_id: productId,
                quantity: 1
            })
        });
        
        const data = await safeJsonParse(res);
        if (data.success) {
            tg.showPopup({
                title: 'Успешно',
                message: 'Товар добавлен в корзину!',
                buttons: [{type: 'ok'}]
            });
            await loadCart();
        } else {
            tg.showAlert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        tg.showAlert('Ошибка добавления в корзину: ' + error.message);
    }
}

// Remove from cart
async function removeFromCart(productId) {
    const userId = getUserId();
    if (!userId) return;
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/cart/remove`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                product_id: productId
            })
        });
        
        const data = await safeJsonParse(res);
        if (data.success) {
            await loadCart();
        }
    } catch (error) {
        console.error('Ошибка удаления из корзины:', error);
    }
}

// Update quantity
async function updateQuantity(productId, quantity) {
    if (quantity < 1) {
        await removeFromCart(productId);
        return;
    }
    
    const userId = getUserId();
    if (!userId) return;
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/cart/update`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                product_id: productId,
                quantity: quantity
            })
        });
        
        const data = await safeJsonParse(res);
        if (data.success) {
            await loadCart();
        }
    } catch (error) {
        console.error('Ошибка обновления количества:', error);
    }
}

// Render cart
function renderCart() {
    const container = document.getElementById('cart-items');
    const emptyState = document.getElementById('cart-empty');
    const summary = document.getElementById('cart-summary');
    
    if (state.cart.length === 0) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        summary.classList.add('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    container.classList.remove('hidden');
    summary.classList.remove('hidden');
    
    container.innerHTML = '';
    let total = 0;
    let itemsCount = 0;
    
    state.cart.forEach(item => {
        const product = item.product;
        const subtotal = item.subtotal || 0;
        total += subtotal;
        itemsCount += item.quantity;
        
        const image = product.pictures && product.pictures[0]
            ? `<img src="${escapeHtml(product.pictures[0])}" alt="${escapeHtml(product.name)}" class="cart-item-image" onerror="this.style.display='none'">`
            : '<div class="cart-item-image" style="display:flex;align-items:center;justify-content:center;font-size:24px;">📦</div>';
        
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = `
            ${image}
            <div class="cart-item-info">
                <div class="cart-item-name">${escapeHtml(product.name)}</div>
                <div class="cart-item-price">${product.price} ₽ × ${item.quantity}</div>
            </div>
            <div class="cart-item-controls">
                <div class="quantity-control">
                    <button class="quantity-btn" onclick="updateQuantity('${product.id}', ${item.quantity - 1})">-</button>
                    <span class="quantity-value">${item.quantity}</span>
                    <button class="quantity-btn" onclick="updateQuantity('${product.id}', ${item.quantity + 1})">+</button>
                </div>
                <div class="cart-item-total">${subtotal.toFixed(2)} ₽</div>
                <button class="remove-btn" onclick="removeFromCart('${product.id}')">Удалить</button>
            </div>
        `;
        container.appendChild(cartItem);
    });
    
    document.getElementById('cart-items-count').textContent = itemsCount;
    document.getElementById('cart-total').textContent = total.toFixed(2) + ' ₽';
}

// Update cart count
function updateCartCount() {
    const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cart-count').textContent = count;
}

// Render pagination
function renderPagination(totalItems) {
    const container = document.getElementById('pagination');
    const totalPages = Math.ceil(totalItems / state.itemsPerPage);
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = `
        <button ${state.currentPage === 1 ? 'disabled' : ''} onclick="changePage(${state.currentPage - 1})">⬅️ Назад</button>
        <span>Страница ${state.currentPage} из ${totalPages}</span>
        <button ${state.currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${state.currentPage + 1})">Вперед ➡️</button>
    `;
}

// Change page
function changePage(page) {
    state.currentPage = page;
    renderProducts();
    window.scrollTo(0, 0);
}

// Open checkout modal
function openCheckoutModal() {
    document.getElementById('checkout-modal').classList.remove('hidden');
}

// Close checkout modal
function closeCheckoutModal() {
    document.getElementById('checkout-modal').classList.add('hidden');
}

// Handle checkout
async function handleCheckout(e) {
    e.preventDefault();
    const userId = getUserId();
    if (!userId) {
        const errorMsg = 'Ошибка: не удалось определить пользователя';
        if (tg && tg.showAlert) {
            tg.showAlert(errorMsg);
        } else {
            alert(errorMsg);
        }
        return;
    }
    
    const formData = new FormData(e.target);
    const orderData = {
        name: formData.get('name'),
        shipping: formData.get('shipping'),
        address: formData.get('address'),
        phone: formData.get('phone'),
        telegram: formData.get('telegram') || '',
        comment: formData.get('comment') || ''
    };
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/order`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                order_data: orderData
            })
        });
        
        const data = await safeJsonParse(res);
        if (data.success) {
            tg.showPopup({
                title: 'Заказ оформлен!',
                message: 'Спасибо за заказ! Мы свяжемся с вами в ближайшее время.',
                buttons: [{type: 'ok'}]
            });
            closeCheckoutModal();
            await loadCart();
            showScreen('catalog');
        } else {
            tg.showAlert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        tg.showAlert('Ошибка оформления заказа: ' + error.message);
    }
}

// Get category emoji
function getCategoryEmoji(categoryName) {
    const emojis = {
        'стекол': '🪟',
        'окон': '🪟',
        'зеркал': '🪟',
        'пыли': '💨',
        'кухни': '🍽️',
        'посуды': '🥄',
        'автомобиля': '🚗',
        'ванной': '🛁',
        'лица': '🧼',
        'пола': '🧽',
        'полотенца': '🧖',
        'спорта': '🏃',
        'подарки': '🎁'
    };
    
    for (const [key, emoji] of Object.entries(emojis)) {
        if (categoryName.toLowerCase().includes(key)) {
            return emoji;
        }
    }
    return '📦';
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Search products
async function searchProducts() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) {
        showError('Введите поисковый запрос');
        return;
    }
    
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`);
        const data = await safeJsonParse(res);
        
        if (data.success) {
            state.currentCategory = null;
            showScreen('catalog');
            showCatalogView('all');
            const container = document.getElementById('all-products-list');
            container.innerHTML = '';
            if (data.products.length === 0) {
                container.innerHTML = '<div class="empty-state"><p>Товары не найдены</p></div>';
            } else {
                data.products.forEach(product => {
                    const card = createProductCard(product);
                    container.appendChild(card);
                });
            }
        } else {
            showError('Ошибка поиска: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        showError('Ошибка поиска: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Show all products
function showAllProducts() {
    if (state.products.length === 0) {
        showError('Товары не загружены. Пожалуйста, обновите страницу.');
        return;
    }
    state.currentCategory = null;
    state.currentProduct = null;
    showCatalogView('all');
    
    const container = document.getElementById('all-products-list');
    if (!container) {
        console.error('Контейнер all-products-list не найден');
        return;
    }
    
    container.innerHTML = '';
    
    if (state.products.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Товары не найдены</p></div>';
        return;
    }
    
    state.products.forEach(product => {
        const card = createProductCard(product);
        container.appendChild(card);
    });
    
    console.log(`✅ Отображено ${state.products.length} товаров`);
}

// AI Chat functions
let aiMessages = [];

async function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const message = input.value.trim();
    if (!message) return;
    
    const userId = getUserId();
    
    // Показываем предупреждение только если это не тестовый режим
    if (!userId || userId === 123456789) {
        const isTestMode = !tg || !tg.initData;
        if (isTestMode) {
            console.warn('⚠️ Работаем в тестовом режиме. Для продакшена откройте Mini App из Telegram.');
        }
    }
    
    // Add user message
    addAIMessage('user', message);
    input.value = '';
    input.disabled = true;
    document.getElementById('ai-send-btn').disabled = true;
    
    // Show typing indicator
    const typingId = addAIMessage('assistant', '🤔 Думаю...', true);
    
    try {
        const url = `${API_BASE_URL}/api/ai/chat`;
        console.log('🤖 Отправка запроса к ИИ:', url);
        console.log('📤 Данные запроса:', { user_id: userId, message: message.substring(0, 50) + '...' });
        
        const res = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                message: message
            })
        });
        
        console.log('📥 Ответ от ИИ:', res.status, res.statusText, res.url);
        const data = await safeJsonParse(res);
        
        // Remove typing indicator
        const typingEl = document.getElementById(`ai-msg-${typingId}`);
        if (typingEl) typingEl.remove();
        
        if (data.success) {
            // Парсим HTML ответ от ИИ
            addAIMessage('assistant', data.reply, false, true);
            
            // Show recommended products if any
            if (data.recommended_products && data.recommended_products.length > 0) {
                const productsHtml = data.recommended_products.map(p => {
                    const productId = String(p.id || p.product_id || '');
                    const productName = p.name || 'Товар';
                    const productPrice = p.price || '?';
                    // Экранируем productId для использования в onclick
                    const safeProductId = escapeHtml(productId);
                    return `<div class="ai-product-suggestion" onclick="showProductDetailsById('${safeProductId}')" style="cursor: pointer; padding: 10px; margin: 5px 0; background: #f0f0f0; border-radius: 5px;">
                        <strong>${escapeHtml(productName)}</strong> - ${productPrice} ₽
                    </div>`;
                }).join('');
                addAIMessage('assistant', '<div class="ai-products"><b>🛒 Рекомендую:</b><br>' + productsHtml + '</div>', false, true);
            }
            
            // Show order buttons if in order mode
            if (data.order_buttons_mode) {
                const orderButtonsHtml = `
                    <div class="ai-order-buttons" style="margin-top: 10px;">
                        <button class="btn-primary" onclick="showScreen('cart'); setTimeout(() => openCheckoutModal(), 300);" style="margin: 5px; padding: 10px;">🚀 Оформить заказ</button>
                        <button class="btn-secondary" onclick="showScreen('cart');" style="margin: 5px; padding: 10px;">🛒 Корзина</button>
                    </div>
                `;
                addAIMessage('assistant', orderButtonsHtml, false, true);
            }
        } else {
            console.error('❌ Ошибка от ИИ:', data.error);
            addAIMessage('assistant', 'Извините, произошла ошибка: ' + (data.error || 'Неизвестная ошибка') + '. Попробуйте еще раз.');
        }
    } catch (error) {
        console.error('❌ Критическая ошибка запроса к ИИ:', error);
        console.error('❌ URL запроса был:', `${API_BASE_URL}/api/ai/chat`);
        console.error('❌ Тип ошибки:', error.name, 'Сообщение:', error.message);
        const typingEl = document.getElementById(`ai-msg-${typingId}`);
        if (typingEl) typingEl.remove();
        addAIMessage('assistant', 'Ошибка соединения: ' + error.message + '. Проверьте интернет.');
    } finally {
        input.disabled = false;
        document.getElementById('ai-send-btn').disabled = false;
        input.focus();
    }
}

function addAIMessage(role, text, isTyping = false, isHtml = false) {
    const messagesContainer = document.getElementById('ai-messages');
    if (!messagesContainer) return Date.now();
    
    const messageId = Date.now() + Math.random();
    const messageEl = document.createElement('div');
    messageEl.id = `ai-msg-${messageId}`;
    messageEl.className = `ai-message ai-message-${role}`;
    
    if (isHtml) {
        // Безопасная обработка HTML
        messageEl.innerHTML = text.replace(/\n/g, '<br>');
    } else {
        messageEl.textContent = text;
    }
    
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return messageId;
}

// Show product by ID
async function showProductDetailsById(productId) {
    if (!productId) {
        const errorMsg = 'Ошибка: ID товара не указан';
        if (tg && tg.showAlert) {
            tg.showAlert(errorMsg);
        } else {
            alert(errorMsg);
        }
        return;
    }
    
    // Ищем товар в загруженных
    let product = state.products.find(p => String(p.id) === String(productId));
    
    // Если не найден, загружаем из API
    if (!product) {
        try {
            const res = await fetch(`${API_BASE_URL}/api/products`);
            const data = await safeJsonParse(res);
            if (data.success && data.products) {
                state.products = data.products;
                product = state.products.find(p => String(p.id) === String(productId));
                if (product) {
                    showScreen('catalog');
                    setTimeout(() => showProductDetails(product), 100);
                } else {
                    const errorMsg = 'Товар не найден';
                    if (tg && tg.showAlert) {
                        tg.showAlert(errorMsg);
                    } else {
                        alert(errorMsg);
                    }
                }
            } else {
                const errorMsg = 'Ошибка загрузки товаров: ' + (data.error || 'Неизвестная ошибка');
                if (tg && tg.showAlert) {
                    tg.showAlert(errorMsg);
                } else {
                    alert(errorMsg);
                }
            }
        } catch (err) {
            const errorMsg = 'Ошибка загрузки товара: ' + err.message;
            if (tg && tg.showAlert) {
                tg.showAlert(errorMsg);
            } else {
                alert(errorMsg);
            }
        }
    } else {
        showScreen('catalog');
        setTimeout(() => showProductDetails(product), 100);
    }
}

// Info section functions
function showInfoSection(section) {
    state.infoSubSection = section;
    document.getElementById('info-menu').classList.add('hidden');
    document.getElementById('info-content').classList.remove('hidden');
    document.querySelectorAll('#info-content .info-section').forEach(s => s.classList.add('hidden'));
    const sectionEl = document.getElementById(`${section}-section`);
    if (sectionEl) {
        sectionEl.classList.remove('hidden');
        if (section === 'faq') loadFAQ();
        else if (section === 'order-conditions') loadOrderConditions();
        else if (section === 'how-to-order') loadHowToOrder();
        else if (section === 'delivery') loadDelivery();
        else if (section === 'contacts') loadContacts();
        else if (section === 'promotions') loadPromotions();
        else if (section === 'wholesale') { /* form already in HTML */ }
        else if (section === 'subscription') loadSubscription();
    }
}

function hideInfoSection() {
    state.infoSubSection = null;
    document.getElementById('info-menu').classList.remove('hidden');
    document.getElementById('info-content').classList.add('hidden');
}

async function loadFAQ() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/faq`);
        const data = await safeJsonParse(res);
        
        if (data.success) {
            const container = document.getElementById('faq-list');
            container.innerHTML = data.faq.map((item, idx) => `
                <div class="faq-item">
                    <div class="faq-question">${escapeHtml(item.question)}</div>
                    <div class="faq-answer">${escapeHtml(item.answer)}</div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Ошибка загрузки FAQ:', error);
    }
}

function loadOrderConditions() {
    const container = document.getElementById('order-conditions-content');
    container.innerHTML = `
        <h2>📋 Условия заказа</h2>
        <div class="info-text">
            <p><b>📦 Способы оплаты:</b></p>
            <p>• Наличными при получении</p>
            <p>• Банковской картой онлайн</p>
            <p>• Переводом на карту</p>
            <p><b>⏱️ Сроки обработки заказа:</b></p>
            <p>• Обычно в течение 15 минут после оформления</p>
            <p>• Подтверждение заказа по телефону или Telegram</p>
            <p><b>🔄 Возврат и обмен:</b></p>
            <p>• Возврат в течение 14 дней с момента покупки</p>
            <p>• Товар должен быть в оригинальной упаковке</p>
        </div>
    `;
}

function loadHowToOrder() {
    const container = document.getElementById('how-to-order-content');
    container.innerHTML = `
        <h2>📋 Как заказать товар?</h2>
        <div class="info-text">
            <p><b>🔹 1. Через сайт:</b></p>
            <p>• Сайт: <a href="https://www.эколайф.рус" target="_blank">www.эколайф.рус</a></p>
            <p><b>🔹 2. Скачать приложение:</b></p>
            <p>• Приложение: <a href="https://econext.uds.app/c/join?ref=cvaw5707" target="_blank">econext.uds.app</a></p>
            <p><b>🔹 3. Прямо в этом боте:</b></p>
            <p>• Откройте 🛍️ Каталог</p>
            <p>• Выберите товар и нажмите '➕ В корзину'</p>
            <p>• Перейдите в 🛒 Корзина</p>
            <p>• Оформите заказ</p>
            <p><b>🔹 4. Написать или позвонить:</b></p>
            <p>• Telegram: <a href="https://t.me/MaxChe1981" target="_blank">@MaxChe1981</a></p>
            <p>• Телефон: <b>+7 921 252-32-95</b></p>
            <p><i>⏱️ Я свяжусь с Вами в течение 15 минут для подтверждения заказа!</i></p>
        </div>
    `;
}

function loadPromotions() {
    const container = document.getElementById('promotions-content');
    container.innerHTML = `
        <h2>🎁 Акции от Econext</h2>
        <div class="info-text">
            <p><b>🔥 Лови горячие предложения и скидки на микрофибру!</b></p>
            <p><b>📱 Скачай наше приложение и получи персональную скидку:</b></p>
            <p><a href="https://econext.uds.app/c/join?ref=cvaw5707" target="_blank" class="btn-primary" style="display: inline-block; padding: 10px 20px; margin: 10px 0;">👉 Скачать приложение</a></p>
            <p><b>💎 Бонус новичка:</b></p>
            <p>Промокод <b>START10</b> на 10% скидку!</p>
            <p><b>🎁 Бесплатная доставка:</b></p>
            <p>При заказе от 3000 ₽ доставка бесплатная!</p>
        </div>
    `;
}

function loadDelivery() {
    const container = document.getElementById('delivery-content');
    container.innerHTML = `
        <h2>🚚 Доставка</h2>
        <div class="info-text">
            <p><b>Бесплатная доставка от 3000 ₽</b></p>
            <p>При сумме заказа менее 3000 ₽ стоимость доставки составляет 350 ₽</p>
            <p><b>Способы доставки:</b></p>
            <p>• Почта России</p>
            <p>• СДЭК</p>
            <p>• Пятёрочка</p>
        </div>
    `;
}

function loadContacts() {
    const container = document.getElementById('contacts-content');
    container.innerHTML = `
        <h2>📞 Контакты</h2>
        <div class="info-text">
            <p><b>Telegram:</b> <a href="https://t.me/MaxChe1981">@MaxChe1981</a></p>
            <p><b>Телефон:</b> +7 921 252-32-95</p>
            <p><b>Сайт:</b> <a href="https://www.эколайф.рус">www.эколайф.рус</a></p>
            <p><b>Канал:</b> <a href="https://t.me/ecoNEXT_microfiber">t.me/ecoNEXT_microfiber</a></p>
            <p><b>Группа ВК:</b> <a href="https://vk.com/ecolifemicrofiber">vk.com/ecolifemicrofiber</a></p>
        </div>
    `;
}

function loadReferral() {
    const container = document.getElementById('referral-content');
    if (!container) return;
    container.innerHTML = `
        <h2 class="section-title">🎁 Реферальная программа</h2>
        <div class="info-text">
            <p>Приглашайте друзей и получайте бонусы!</p>
            <p>За каждого приглашенного друга вы получите бонусы на ваш счет.</p>
            <p>Ваша реферальная ссылка будет доступна в боте.</p>
        </div>
    `;
}

function loadReferralContent() {
    loadReferral();
}

async function loadOrders() {
    const userId = getUserId();
    // getUserId() всегда возвращает значение (реальный или тестовый)
    if (!userId) {
        console.error('❌ Критическая ошибка: userId не определен');
        const container = document.getElementById('orders-list');
        if (container) {
            container.innerHTML = '<div class="empty-state"><p>Ошибка определения пользователя. Попробуйте обновить страницу.</p></div>';
        }
        return;
    }
    
    showLoading(true);
    try {
        const res = await fetch(`${API_BASE_URL}/api/orders?user_id=${userId}`);
        const data = await safeJsonParse(res);
        
        if (data.success) {
            const container = document.getElementById('orders-list');
            if (!container) return;
            
            if (data.orders.length === 0) {
                container.innerHTML = '<div class="empty-state"><p>📦 У вас пока нет заказов</p><p class="text-muted">Ваши заказы будут отображаться здесь</p></div>';
            } else {
                container.innerHTML = data.orders.map(order => {
                    const orderData = order.order_data || {};
                    const createdDate = order.created_at ? new Date(order.created_at).toLocaleDateString('ru-RU', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    }) : 'Дата не указана';
                    
                    return `
                        <div class="order-item">
                            <div class="order-header">
                                <span><b>Заказ #${order.id}</b></span>
                                <span class="order-status">${order.status || 'pending'}</span>
                            </div>
                            <div class="order-info">
                                <p><b>Сумма:</b> ${(order.total_amount || 0).toFixed(2)} ₽</p>
                                <p><b>Дата:</b> ${createdDate}</p>
                                ${orderData.name ? `<p><b>Получатель:</b> ${escapeHtml(orderData.name)}</p>` : ''}
                                ${orderData.phone ? `<p><b>Телефон:</b> ${escapeHtml(orderData.phone)}</p>` : ''}
                                ${orderData.address ? `<p><b>Адрес:</b> ${escapeHtml(orderData.address)}</p>` : ''}
                                ${orderData.shipping ? `<p><b>Доставка:</b> ${escapeHtml(orderData.shipping)}</p>` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } else {
            const container = document.getElementById('orders-list');
            if (container) {
                container.innerHTML = '<div class="empty-state"><p>Ошибка загрузки заказов: ' + (data.error || 'Неизвестная ошибка') + '</p></div>';
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки заказов:', error);
        const container = document.getElementById('orders-list');
        if (container) {
            container.innerHTML = '<div class="empty-state"><p>Ошибка соединения: ' + error.message + '</p></div>';
        }
    } finally {
        showLoading(false);
    }
}

async function loadSubscription() {
    const userId = getUserId();
    // getUserId() всегда возвращает значение
    if (!userId) {
        console.warn('⚠️ Не удалось загрузить подписку: user_id не определен');
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/subscription?user_id=${userId}`);
        const data = await safeJsonParse(res);
        
        if (data.success) {
            const statusEl = document.getElementById('subscription-status');
            const btnEl = document.getElementById('toggle-subscription-btn');
            
            if (data.subscribed) {
                statusEl.innerHTML = '<p>✅ Вы подписаны на обновления</p>';
                btnEl.textContent = 'Отписаться';
            } else {
                statusEl.innerHTML = '<p>❌ Вы не подписаны</p>';
                btnEl.textContent = 'Подписаться';
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки подписки:', error);
    }
}

async function toggleSubscription() {
    const userId = getUserId();
    // Получаем chatId (может быть null в тестовом режиме)
    const chatId = tg?.initDataUnsafe?.chat?.id || (tg?.initData ? (() => {
        try {
            const params = new URLSearchParams(tg.initData);
            const chatParam = params.get('chat');
            if (chatParam) {
                const chat = JSON.parse(decodeURIComponent(chatParam));
                return chat?.id;
            }
        } catch (e) {}
        return null;
    })() : null);
    const username = tg?.initDataUnsafe?.user?.username || '';
    
    // В тестовом режиме используем userId как chatId
    const finalChatId = chatId || userId;
    
    if (!userId) {
        const errorMsg = 'Ошибка: не удалось определить пользователя';
        if (tg && tg.showAlert) {
            tg.showAlert(errorMsg);
        } else {
            alert(errorMsg);
        }
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/subscription/toggle`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                chat_id: finalChatId,
                username: username
            })
        });
        
        const data = await safeJsonParse(res);
        if (data.success) {
            await loadSubscription();
            tg.showPopup({
                title: data.subscribed ? 'Подписка оформлена' : 'Подписка отменена',
                message: data.subscribed 
                    ? 'Вы будете получать уведомления о новинках и акциях!'
                    : 'Вы отписались от уведомлений',
                buttons: [{type: 'ok'}]
            });
        }
    } catch (error) {
        tg.showAlert('Ошибка: ' + error.message);
    }
}

async function submitWholesale(e) {
    e.preventDefault();
    const userId = getUserId();
    // getUserId() всегда возвращает значение
    if (!userId) {
        console.error('❌ Критическая ошибка: userId не определен');
        const errorMsg = 'Ошибка: не удалось определить пользователя. Попробуйте обновить страницу.';
        if (tg && tg.showAlert) {
            tg.showAlert(errorMsg);
        } else {
            alert(errorMsg);
        }
        return;
    }
    
    const formData = new FormData(e.target);
    try {
        const res = await fetch(`${API_BASE_URL}/api/wholesale`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                name: formData.get('name'),
                contact: formData.get('contact'),
                question: formData.get('question')
            })
        });
        
        const data = await safeJsonParse(res);
        if (data.success) {
            tg.showPopup({
                title: 'Заявка отправлена!',
                message: 'Спасибо за заявку! Мы свяжемся с вами в ближайшее время.',
                buttons: [{type: 'ok'}]
            });
            e.target.reset();
            hideInfoSection();
        } else {
            tg.showAlert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        tg.showAlert('Ошибка отправки заявки: ' + error.message);
    }
}

// Глобальные функции для onclick в разметке
window.showScreen = showScreen;
window.showTab = showTab;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQuantity = updateQuantity;
window.changePage = changePage;
window.closeCheckoutModal = closeCheckoutModal;
window.showInfoSection = showInfoSection;
window.hideInfoSection = hideInfoSection;
window.showProductDetailsById = showProductDetailsById;
window.showAllProducts = showAllProducts;
window.searchProducts = searchProducts;
window.openCheckoutModal = openCheckoutModal;
window.showCategories = showCategories;
window.toggleSubscription = toggleSubscription;
window.sendAIMessage = sendAIMessage;

