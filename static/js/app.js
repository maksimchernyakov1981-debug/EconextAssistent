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
            fetch('/api/products'),
            fetch('/api/categories')
        ]);
        
        const productsData = await productsRes.json();
        const categoriesData = await categoriesRes.json();
        
        if (productsData.success) {
            state.products = productsData.products;
        }
        
        if (categoriesData.success) {
            state.categories = categoriesData.categories;
            renderCategories();
        }
        
        await loadCart();
    } catch (error) {
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
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    if (tabName === 'cart') {
        loadCart();
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
    document.getElementById('product-details').classList.add('hidden');
    state.currentCategory = null;
    state.currentProduct = null;
}

// Render products
function renderProducts() {
    const container = document.getElementById('products-list');
    container.innerHTML = '';
    
    const categoryProducts = state.products.filter(p => 
        p.categoryId === state.currentCategory
    );
    
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
                <span class="product-price">${product.price} ₽</span>
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

// Make functions global for onclick handlers
window.showTab = showTab;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQuantity = updateQuantity;
window.changePage = changePage;
window.closeCheckoutModal = closeCheckoutModal;

