// Telegram WebApp API
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();

// State
let state = {
    products: [],
    categories: [],
    cart: [],
    currentCategory: null,
    currentProduct: null,
    currentPage: 1,
    itemsPerPage: 10
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    setupEventListeners();
    updateCartCount();
});

// Load data
async function loadData() {
    showLoading(true);
    try {
        const [productsRes, categoriesRes] = await Promise.all([
            fetch('/api/products').catch(err => {
                console.error('Ошибка загрузки товаров:', err);
                return { ok: false, json: async () => ({ success: false, error: err.message, products: [] }) };
            }),
            fetch('/api/categories').catch(err => {
                console.error('Ошибка загрузки категорий:', err);
                return { ok: false, json: async () => ({ success: false, error: err.message, categories: [] }) };
            })
        ]);
        
        let productsData, categoriesData;
        
        try {
            productsData = await productsRes.json();
        } catch (e) {
            console.error('Ошибка парсинга JSON товаров:', e);
            const text = await productsRes.text();
            console.error('Полученный ответ:', text.substring(0, 200));
            productsData = { success: false, error: 'Invalid JSON response', products: [] };
        }
        
        try {
            categoriesData = await categoriesRes.json();
        } catch (e) {
            console.error('Ошибка парсинга JSON категорий:', e);
            const text = await categoriesRes.text();
            console.error('Полученный ответ:', text.substring(0, 200));
            categoriesData = { success: false, error: 'Invalid JSON response', categories: [] };
        }
        
        if (productsData.success && productsData.products) {
            state.products = productsData.products;
            console.log(`Загружено ${state.products.length} товаров`);
        } else {
            console.warn('Товары не загружены:', productsData.error);
            state.products = [];
        }
        
        if (categoriesData.success && categoriesData.categories) {
            state.categories = categoriesData.categories;
            renderCategories();
            console.log(`Загружено ${state.categories.length} категорий`);
        } else {
            console.warn('Категории не загружены:', categoriesData.error);
            state.categories = [];
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
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) return;
    
    try {
        const res = await fetch(`/api/cart?user_id=${userId}`);
        const data = await res.json();
        if (data.success) {
            state.cart = data.cart;
            renderCart();
            updateCartCount();
        }
    } catch (error) {
        console.error('Ошибка загрузки корзины:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            showTab(tabName);
        });
    });
    
    // Back buttons
    document.getElementById('back-to-categories')?.addEventListener('click', () => {
        showCategories();
    });
    
    document.getElementById('back-to-products')?.addEventListener('click', () => {
        showProducts(state.currentCategory);
    });
    
    // Cart button
    document.getElementById('cart-btn')?.addEventListener('click', () => {
        showTab('cart');
    });
    
    // Checkout
    document.getElementById('checkout-btn')?.addEventListener('click', () => {
        openCheckoutModal();
    });
    
    document.getElementById('checkout-form')?.addEventListener('submit', handleCheckout);
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

// Show tab
function showTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
    const tabContent = document.getElementById(`${tabName}-tab`);
    
    if (tabButton) tabButton.classList.add('active');
    if (tabContent) tabContent.classList.add('active');
    
    if (tabName === 'cart') {
        loadCart();
    } else if (tabName === 'ai') {
        // Initialize AI chat
        const messagesContainer = document.getElementById('ai-messages');
        if (messagesContainer && messagesContainer.children.length === 0) {
            addAIMessage('assistant', '👋 Привет! Я Максим, твой ИИ-консультант по микрофибре. Задай мне любой вопрос о товарах, уборке или использовании микрофибры!');
        }
        // Фокус на поле ввода
        setTimeout(() => {
            const aiInput = document.getElementById('ai-input');
            if (aiInput) aiInput.focus();
        }, 100);
    } else if (tabName === 'info') {
        // Reset info section
        hideInfoSection();
    } else if (tabName === 'catalog') {
        // Убеждаемся что категории видны
        if (state.categories.length > 0 && !document.getElementById('categories-section').classList.contains('hidden')) {
            // Все ок
        } else if (state.categories.length === 0) {
            // Перезагружаем данные
            loadData();
        }
    }
}

// Render categories
function renderCategories() {
    const container = document.getElementById('categories-list');
    container.innerHTML = '';
    
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
}

// Show products
function showProducts(categoryId) {
    state.currentCategory = categoryId;
    state.currentPage = 1;
    
    const category = state.categories.find(c => c.id === categoryId);
    document.getElementById('category-title').textContent = category?.name || 'Товары';
    
    document.getElementById('categories-section').classList.add('hidden');
    document.getElementById('products-section').classList.remove('hidden');
    document.getElementById('product-details').classList.add('hidden');
    
    renderProducts();
}

// Show categories
function showCategories() {
    document.getElementById('categories-section').classList.remove('hidden');
    document.getElementById('products-section').classList.add('hidden');
    document.getElementById('all-products-section').classList.add('hidden');
    document.getElementById('product-details').classList.add('hidden');
    state.currentCategory = null;
    state.currentProduct = null;
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
    
    document.getElementById('products-section').classList.add('hidden');
    document.getElementById('all-products-section').classList.add('hidden');
    document.getElementById('product-details').classList.remove('hidden');
    
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
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) {
        tg.showAlert('Ошибка: не удалось определить пользователя');
        return;
    }
    
    try {
        const res = await fetch('/api/cart/add', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                product_id: productId,
                quantity: 1
            })
        });
        
        const data = await res.json();
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
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) return;
    
    try {
        const res = await fetch('/api/cart/remove', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                product_id: productId
            })
        });
        
        const data = await res.json();
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
    
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) return;
    
    try {
        const res = await fetch('/api/cart/update', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                product_id: productId,
                quantity: quantity
            })
        });
        
        const data = await res.json();
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
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) {
        tg.showAlert('Ошибка: не удалось определить пользователя');
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
        const res = await fetch('/api/order', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                order_data: orderData
            })
        });
        
        const data = await res.json();
        if (data.success) {
            tg.showPopup({
                title: 'Заказ оформлен!',
                message: 'Спасибо за заказ! Мы свяжемся с вами в ближайшее время.',
                buttons: [{type: 'ok'}]
            });
            closeCheckoutModal();
            await loadCart();
            showTab('catalog');
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
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        if (data.success) {
            state.currentCategory = null;
            document.getElementById('categories-section').classList.add('hidden');
            document.getElementById('products-section').classList.add('hidden');
            document.getElementById('all-products-section').classList.remove('hidden');
            
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
    document.getElementById('categories-section').classList.add('hidden');
    document.getElementById('products-section').classList.add('hidden');
    document.getElementById('all-products-section').classList.remove('hidden');
    document.getElementById('product-details').classList.add('hidden');
    
    state.currentCategory = null;
    state.currentProduct = null;
    
    const container = document.getElementById('all-products-list');
    container.innerHTML = '';
    
    if (state.products.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Товары не загружены</p></div>';
        return;
    }
    
    state.products.forEach(product => {
        const card = createProductCard(product);
        container.appendChild(card);
    });
}

// AI Chat functions
let aiMessages = [];

async function sendAIMessage() {
    const input = document.getElementById('ai-input');
    const message = input.value.trim();
    if (!message) return;
    
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) {
        tg.showAlert('Ошибка: не удалось определить пользователя');
        return;
    }
    
    // Add user message
    addAIMessage('user', message);
    input.value = '';
    input.disabled = true;
    document.getElementById('ai-send-btn').disabled = true;
    
    // Show typing indicator
    const typingId = addAIMessage('assistant', '🤔 Думаю...', true);
    
    try {
        const res = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                message: message
            })
        });
        
        const data = await res.json();
        
        // Remove typing indicator
        const typingEl = document.getElementById(`ai-msg-${typingId}`);
        if (typingEl) typingEl.remove();
        
        if (data.success) {
            // Парсим HTML ответ от ИИ
            addAIMessage('assistant', data.reply, false, true);
            
            // Show recommended products if any
            if (data.recommended_products && data.recommended_products.length > 0) {
                const productsHtml = data.recommended_products.map(p => {
                    const productId = p.id || p.product_id || '';
                    const productName = p.name || 'Товар';
                    const productPrice = p.price || '?';
                    return `<div class="ai-product-suggestion" onclick="showProductDetailsById('${productId}')">
                        <strong>${escapeHtml(productName)}</strong> - ${productPrice} ₽
                    </div>`;
                }).join('');
                addAIMessage('assistant', '<div class="ai-products"><b>Рекомендую:</b><br>' + productsHtml + '</div>', false, true);
            }
        } else {
            addAIMessage('assistant', 'Извините, произошла ошибка: ' + (data.error || 'Неизвестная ошибка') + '. Попробуйте еще раз.');
        }
    } catch (error) {
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
function showProductDetailsById(productId) {
    if (!productId) {
        tg.showAlert('Ошибка: ID товара не указан');
        return;
    }
    
    // Ищем товар в загруженных
    let product = state.products.find(p => p.id === String(productId));
    
    // Если не найден, загружаем из API
    if (!product) {
        fetch(`/api/products`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    state.products = data.products;
                    product = state.products.find(p => p.id === String(productId));
                    if (product) {
                        showTab('catalog');
                        setTimeout(() => showProductDetails(product), 100);
                    } else {
                        tg.showAlert('Товар не найден');
                    }
                }
            })
            .catch(err => {
                tg.showAlert('Ошибка загрузки товара: ' + err.message);
            });
    } else {
        showTab('catalog');
        setTimeout(() => showProductDetails(product), 100);
    }
}

// Info section functions
function showInfoSection(section) {
    document.querySelectorAll('.info-section').forEach(s => s.classList.add('hidden'));
    document.querySelector('.info-menu').classList.add('hidden');
    
    const sectionEl = document.getElementById(`${section}-section`);
    if (sectionEl) {
        sectionEl.classList.remove('hidden');
        
        // Load section data
        if (section === 'faq') loadFAQ();
        else if (section === 'orders') loadOrders();
        else if (section === 'subscription') loadSubscription();
        else if (section === 'order-conditions') loadOrderConditions();
        else if (section === 'delivery') loadDelivery();
        else if (section === 'contacts') loadContacts();
        else if (section === 'referral') loadReferral();
    }
}

function hideInfoSection() {
    document.querySelectorAll('.info-section').forEach(s => s.classList.add('hidden'));
    document.querySelector('.info-menu').classList.remove('hidden');
}

async function loadFAQ() {
    try {
        const res = await fetch('/api/faq');
        const data = await res.json();
        
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
            <p><b>🛒 Как заказать товар?</b></p>
            <p>1. Через сайт: <a href="https://www.эколайф.рус">www.эколайф.рус</a></p>
            <p>2. Скачать приложение: <a href="https://econext.uds.app/c/join?ref=cvaw5707">econext.uds.app</a></p>
            <p>3. Прямо в этом боте: выберите товар, добавьте в корзину и оформите заказ</p>
            <p>4. Написать или позвонить:</p>
            <p>   • Telegram: @MaxChe1981</p>
            <p>   • Телефон: +7 921 252-32-95</p>
            <p><i>⏱️ Я свяжусь с Вами в течение 15 минут для подтверждения заказа!</i></p>
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
    container.innerHTML = `
        <h2>🎁 Реферальная программа</h2>
        <div class="info-text">
            <p>Приглашайте друзей и получайте бонусы!</p>
            <p>За каждого приглашенного друга вы получите бонусы на ваш счет.</p>
            <p>Ваша реферальная ссылка будет доступна в боте.</p>
        </div>
    `;
}

async function loadOrders() {
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) {
        const container = document.getElementById('orders-list');
        container.innerHTML = '<div class="empty-state"><p>Не удалось определить пользователя</p></div>';
        return;
    }
    
    showLoading(true);
    try {
        const res = await fetch(`/api/orders?user_id=${userId}`);
        const data = await res.json();
        
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
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) return;
    
    try {
        const res = await fetch(`/api/subscription?user_id=${userId}`);
        const data = await res.json();
        
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
    const userId = tg.initDataUnsafe?.user?.id;
    const chatId = tg.initDataUnsafe?.chat?.id;
    const username = tg.initDataUnsafe?.user?.username || '';
    
    if (!userId || !chatId) {
        tg.showAlert('Ошибка: не удалось определить пользователя');
        return;
    }
    
    try {
        const res = await fetch('/api/subscription/toggle', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                chat_id: chatId,
                username: username
            })
        });
        
        const data = await res.json();
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
    const userId = tg.initDataUnsafe?.user?.id;
    if (!userId) {
        tg.showAlert('Ошибка: не удалось определить пользователя');
        return;
    }
    
    const formData = new FormData(e.target);
    try {
        const res = await fetch('/api/wholesale', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                user_id: userId,
                name: formData.get('name'),
                contact: formData.get('contact'),
                question: formData.get('question')
            })
        });
        
        const data = await res.json();
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

// Update event listeners
function setupEventListeners() {
    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            showTab(tabName);
        });
    });
    
    // Back buttons
    document.getElementById('back-to-categories')?.addEventListener('click', () => {
        showCategories();
    });
    
    document.getElementById('back-to-categories-from-all')?.addEventListener('click', () => {
        showCategories();
    });
    
    document.getElementById('back-to-products')?.addEventListener('click', () => {
        if (state.currentCategory) {
            showProducts(state.currentCategory);
        } else {
            showAllProducts();
        }
    });
    
    // Cart button
    document.getElementById('cart-btn')?.addEventListener('click', () => {
        showTab('cart');
    });
    
    // Checkout
    document.getElementById('checkout-btn')?.addEventListener('click', () => {
        openCheckoutModal();
    });
    
    document.getElementById('checkout-form')?.addEventListener('submit', handleCheckout);
    
    // Search
    document.getElementById('search-btn')?.addEventListener('click', searchProducts);
    document.getElementById('search-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchProducts();
    });
    
    // AI Chat
    document.getElementById('ai-send-btn')?.addEventListener('click', sendAIMessage);
    document.getElementById('ai-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendAIMessage();
    });
    
    // Subscription
    document.getElementById('toggle-subscription-btn')?.addEventListener('click', toggleSubscription);
    
    // Wholesale
    document.getElementById('wholesale-form')?.addEventListener('submit', submitWholesale);
}

// Make functions global for onclick handlers
window.showTab = showTab;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQuantity = updateQuantity;
window.changePage = changePage;
window.closeCheckoutModal = closeCheckoutModal;
window.showInfoSection = showInfoSection;
window.hideInfoSection = hideInfoSection;
window.showProductDetailsById = showProductDetailsById;
window.toggleSubscription = toggleSubscription;
window.showAllProducts = showAllProducts;
window.searchProducts = searchProducts;
window.sendAIMessage = sendAIMessage;

