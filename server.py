"""Web server for Telegram Mini App."""
import json
import sqlite3
import aiohttp
from aiohttp import web
from aiohttp.web import Response
from typing import Dict, List
from config.settings import logger


async def get_products(request: web.Request) -> Response:
    """Get all products for Mini App."""
    try:
        with sqlite3.connect("cache.db") as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT content FROM products_cache WHERE key = 'products'")
            row = c.fetchone()
            if row:
                products = json.loads(row['content'])
                return web.json_response({"success": True, "products": products})
            return web.json_response(
                {"success": False, "error": "Products not found"},
                status=404
            )
    except Exception as e:
        logger.error("Ошибка получения товаров для Mini App: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


async def get_categories(request: web.Request) -> Response:
    """Get all categories for Mini App."""
    try:
        with sqlite3.connect("cache.db") as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT content FROM categories_cache WHERE key = 'categories'")
            row = c.fetchone()
            if row:
                categories = json.loads(row['content'])
                return web.json_response(
                    {"success": True, "categories": categories}
                )
            return web.json_response(
                {"success": False, "error": "Categories not found"},
                status=404
            )
    except Exception as e:
        logger.error("Ошибка получения категорий для Mini App: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


async def get_cart(request: web.Request) -> Response:
    """Get user's cart for Mini App."""
    try:
        user_id = request.query.get('user_id')
        if not user_id:
            return web.json_response(
                {"success": False, "error": "user_id required"},
                status=400
            )
        
        user_id = int(user_id)
        
        with sqlite3.connect("cache.db") as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(
                "SELECT product_id, quantity FROM cart WHERE user_id = ?",
                (user_id,)
            )
            cart_items = [
                {"product_id": row['product_id'], "quantity": row['quantity']}
                for row in c.fetchall()
            ]
            
            # Получаем информацию о товарах
            c.execute("SELECT content FROM products_cache WHERE key = 'products'")
            row = c.fetchone()
            products_dict = {}
            if row:
                products = json.loads(row['content'])
                products_dict = {p["id"]: p for p in products}
            
            # Обогащаем корзину данными о товарах
            cart_with_products = []
            total = 0
            for item in cart_items:
                product = products_dict.get(item['product_id'])
                if product:
                    try:
                        price = float(product.get("price", 0))
                        subtotal = price * item['quantity']
                        total += subtotal
                        cart_with_products.append({
                            **item,
                            "product": product,
                            "subtotal": subtotal
                        })
                    except (ValueError, TypeError):
                        cart_with_products.append({
                            **item,
                            "product": product,
                            "subtotal": 0
                        })
            
            return web.json_response({
                "success": True,
                "cart": cart_with_products,
                "total": total
            })
    except Exception as e:
        logger.error("Ошибка получения корзины для Mini App: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


async def add_to_cart_api(request: web.Request) -> Response:
    """Add product to cart via API."""
    try:
        data = await request.json()
        user_id = data.get('user_id')
        product_id = data.get('product_id')
        quantity = data.get('quantity', 1)
        
        if not user_id or not product_id:
            return web.json_response(
                {"success": False, "error": "user_id and product_id required"},
                status=400
            )
        
        from database.cart import add_to_cart
        # Добавляем товар quantity раз
        for _ in range(int(quantity)):
            add_to_cart(int(user_id), str(product_id))
        
        return web.json_response({"success": True})
    except Exception as e:
        logger.error("Ошибка добавления в корзину через API: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


async def remove_from_cart_api(request: web.Request) -> Response:
    """Remove product from cart via API."""
    try:
        data = await request.json()
        user_id = data.get('user_id')
        product_id = data.get('product_id')
        
        if not user_id or not product_id:
            return web.json_response(
                {"success": False, "error": "user_id and product_id required"},
                status=400
            )
        
        from database.cart import remove_from_cart
        remove_from_cart(int(user_id), str(product_id))
        
        return web.json_response({"success": True})
    except Exception as e:
        logger.error("Ошибка удаления из корзины через API: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


async def update_cart_quantity_api(request: web.Request) -> Response:
    """Update product quantity in cart via API."""
    try:
        data = await request.json()
        user_id = data.get('user_id')
        product_id = data.get('product_id')
        quantity = data.get('quantity')
        
        if not user_id or not product_id or quantity is None:
            return web.json_response(
                {"success": False, "error": "user_id, product_id and quantity required"},
                status=400
            )
        
        from database.cart import update_cart_quantity
        update_cart_quantity(int(user_id), str(product_id), int(quantity))
        
        return web.json_response({"success": True})
    except Exception as e:
        logger.error("Ошибка обновления количества в корзине через API: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


async def submit_order_api(request: web.Request) -> Response:
    """Submit order from Mini App."""
    try:
        data = await request.json()
        user_id = data.get('user_id')
        order_data = data.get('order_data')
        
        if not user_id or not order_data:
            return web.json_response(
                {"success": False, "error": "user_id and order_data required"},
                status=400
            )
        
        from database.orders import save_order
        from database.cart import clear_cart, get_cart_items
        from utils.delivery import calculate_delivery_cost
        
        # Получаем корзину для расчета суммы
        cart_items = get_cart_items(int(user_id))
        products_dict = {}
        total = 0
        
        # Загружаем товары для расчета
        with sqlite3.connect("cache.db") as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT content FROM products_cache WHERE key = 'products'")
            row = c.fetchone()
            if row:
                products = json.loads(row['content'])
                products_dict = {p["id"]: p for p in products}
        
        for product_id, quantity in cart_items:
            product = products_dict.get(product_id)
            if product:
                try:
                    price = float(product.get("price", 0))
                    total += price * quantity
                except (ValueError, TypeError):
                    pass
        
        delivery_cost = calculate_delivery_cost(total)
        total_with_delivery = total + delivery_cost
        
        # Сохраняем заказ
        order_id = save_order(int(user_id), order_data, total_with_delivery)
        
        # Очищаем корзину
        clear_cart(int(user_id))
        
        return web.json_response({
            "success": True,
            "order_id": order_id
        })
    except Exception as e:
        logger.error("Ошибка оформления заказа через API: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


async def serve_index(request: web.Request) -> Response:
    """Serve Mini App index page."""
    try:
        with open("webapp/index.html", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(text=content, content_type="text/html")
    except FileNotFoundError:
        return Response(
            text="<h1>Mini App not found</h1>",
            status=404,
            content_type="text/html"
        )


async def serve_static(request: web.Request) -> Response:
    """Serve static files (CSS, JS)."""
    file_path = request.match_info.get('file', '')
    file_type = request.match_info.get('type', '')
    
    if not file_path or not file_type:
        return Response(status=404)
    
    try:
        file_ext = {
            'css': 'text/css',
            'js': 'application/javascript'
        }.get(file_type, 'text/plain')
        
        with open(f"webapp/static/{file_type}/{file_path}", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(text=content, content_type=file_ext)
    except FileNotFoundError:
        return Response(status=404)


async def get_faq(request: web.Request) -> Response:
    """Get FAQ questions and answers."""
    try:
        from personality.faq import FAQ_QUESTIONS_ANSWERS
        return web.json_response({
            "success": True,
            "faq": FAQ_QUESTIONS_ANSWERS
        })
    except Exception as e:
        logger.error("Ошибка получения FAQ: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


async def search_products_api(request: web.Request) -> Response:
    """Search products by query."""
    try:
        query = request.query.get('q', '').strip()
        if not query:
            return web.json_response(
                {"success": False, "error": "Query required"},
                status=400
            )
        
        with sqlite3.connect("cache.db") as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT content FROM products_cache WHERE key = 'products'")
            row = c.fetchone()
            if not row:
                return web.json_response(
                    {"success": False, "error": "Products not found"},
                    status=404
                )
            
            products = json.loads(row['content'])
            query_lower = query.lower()
            
            # Простой поиск по названию и описанию
            matched = []
            for product in products:
                name = product.get("name", "").lower()
                description = product.get("description", "").lower()
                if query_lower in name or query_lower in description:
                    matched.append(product)
            
            return web.json_response({
                "success": True,
                "products": matched,
                "count": len(matched)
            })
    except Exception as e:
        logger.error("Ошибка поиска товаров: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


async def ai_chat_api(request: web.Request) -> Response:
    """Handle AI chat messages."""
    try:
        data = await request.json()
        user_id = data.get('user_id')
        message = data.get('message', '').strip()
        
        if not user_id or not message:
            return web.json_response(
                {"success": False, "error": "user_id and message required"},
                status=400
            )
        
        # Получаем товары
        with sqlite3.connect("cache.db") as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT content FROM products_cache WHERE key = 'products'")
            row = c.fetchone()
            products = []
            if row:
                products = json.loads(row['content'])
        
        # Генерируем ответ через AI service
        import aiohttp
        from services.ai_service import generate_maxim_reply
        
        async with aiohttp.ClientSession() as session:
            reply_text, recommended_products, product_ids, order_buttons_mode = await generate_maxim_reply(
                message, session, products
            )
        
        return web.json_response({
            "success": True,
            "reply": reply_text,
            "recommended_products": recommended_products[:5],  # Ограничиваем до 5
            "product_ids": product_ids,
            "order_buttons_mode": order_buttons_mode
        })
    except Exception as e:
        logger.error("Ошибка AI чата: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


async def submit_wholesale_api(request: web.Request) -> Response:
    """Submit wholesale request."""
    try:
        data = await request.json()
        user_id = data.get('user_id')
        name = data.get('name')
        contact = data.get('contact')
        question = data.get('question')
        
        if not all([user_id, name, contact, question]):
            return web.json_response(
                {"success": False, "error": "All fields required"},
                status=400
            )
        
        from database.wholesale import save_wholesale_request
        from config.settings import TELEGRAM_BOT_TOKEN, OWNER_CHAT_ID
        
        request_id = save_wholesale_request(
            int(user_id), name, contact, question
        )
        
        # Отправляем уведомление админу
        try:
            async with aiohttp.ClientSession() as session:
                message = (
                    f"<b>📦 Новая оптовая заявка</b>\n"
                    f"ID: {request_id}\n"
                    f"Пользователь: {user_id}\n\n"
                    f"Имя: {name}\n"
                    f"Контакт: {contact}\n"
                    f"Вопрос: {question}"
                )
                await session.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={
                        "chat_id": OWNER_CHAT_ID,
                        "text": message,
                        "parse_mode": "HTML"
                    }
                )
        except Exception as e:
            logger.error("Ошибка отправки уведомления: %s", e)
        
        return web.json_response({
            "success": True,
            "request_id": request_id
        })
    except Exception as e:
        logger.error("Ошибка оптовой заявки: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


async def get_subscription_status(request: web.Request) -> Response:
    """Get user subscription status."""
    try:
        user_id = request.query.get('user_id')
        if not user_id:
            return web.json_response(
                {"success": False, "error": "user_id required"},
                status=400
            )
        
        from database.subscriptions import is_user_subscribed
        subscribed = is_user_subscribed(int(user_id))
        
        return web.json_response({
            "success": True,
            "subscribed": subscribed
        })
    except Exception as e:
        logger.error("Ошибка получения статуса подписки: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


async def toggle_subscription_api(request: web.Request) -> Response:
    """Toggle user subscription."""
    try:
        data = await request.json()
        user_id = data.get('user_id')
        chat_id = data.get('chat_id')
        username = data.get('username', '')
        
        if not user_id or not chat_id:
            return web.json_response(
                {"success": False, "error": "user_id and chat_id required"},
                status=400
            )
        
        from database.subscriptions import is_user_subscribed, subscribe_user, unsubscribe_user
        
        subscribed = is_user_subscribed(int(user_id))
        
        if subscribed:
            unsubscribe_user(int(user_id))
            new_status = False
        else:
            subscribe_user(int(user_id), int(chat_id), username)
            new_status = True
        
        return web.json_response({
            "success": True,
            "subscribed": new_status
        })
    except Exception as e:
        logger.error("Ошибка переключения подписки: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


async def get_user_orders_api(request: web.Request) -> Response:
    """Get user orders."""
    try:
        user_id = request.query.get('user_id')
        if not user_id:
            return web.json_response(
                {"success": False, "error": "user_id required"},
                status=400
            )
        
        from database.orders import get_user_orders
        orders = get_user_orders(int(user_id), limit=20)
        
        orders_list = []
        for order in orders:
            order_id, total_amount, status, created_at, order_data_json = order
            order_data = json.loads(order_data_json) if order_data_json else {}
            orders_list.append({
                "id": order_id,
                "total_amount": total_amount,
                "status": status,
                "created_at": created_at,
                "order_data": order_data
            })
        
        return web.json_response({
            "success": True,
            "orders": orders_list
        })
    except Exception as e:
        logger.error("Ошибка получения заказов: %s", e)
        return web.json_response(
            {"success": False, "error": str(e)},
            status=500
        )


def create_webapp_app() -> web.Application:
    """Create aiohttp application for Mini App."""
    app = web.Application()
    
    # API routes
    app.add_routes([
        web.get("/api/products", get_products),
        web.get("/api/categories", get_categories),
        web.get("/api/cart", get_cart),
        web.post("/api/cart/add", add_to_cart_api),
        web.post("/api/cart/remove", remove_from_cart_api),
        web.post("/api/cart/update", update_cart_quantity_api),
        web.post("/api/order", submit_order_api),
        web.get("/api/search", search_products_api),
        web.get("/api/faq", get_faq),
        web.post("/api/ai/chat", ai_chat_api),
        web.post("/api/wholesale", submit_wholesale_api),
        web.get("/api/subscription", get_subscription_status),
        web.post("/api/subscription/toggle", toggle_subscription_api),
        web.get("/api/orders", get_user_orders_api),
    ])
    
    # Static files
    app.add_routes([
        web.get("/static/{type}/{file}", serve_static),
    ])
    
    # Main page
    app.add_routes([
        web.get("/", serve_index),
    ])
    
    return app

