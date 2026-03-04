"""Web server for Telegram Mini App."""
import json
import sqlite3
import aiohttp
from aiohttp import web
from aiohttp.web import Response
from config.settings import logger
from database.connection import get_db_connection


async def get_products(request: web.Request) -> Response:
    """Get all products for Mini App."""
    logger.info("Запрос товаров для Mini App от %s", request.remote)
    try:
        with get_db_connection() as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(
                "SELECT content FROM products_cache WHERE key = 'products'"
            )
            row = c.fetchone()
            if row and row['content']:
                try:
                    products = json.loads(row['content'])
                    logger.info(
                        "✅ Загружено %d товаров для Mini App", len(products)
                    )
                    return web.json_response({
                        "success": True,
                        "products": products,
                        "count": len(products)
                    })
                except json.JSONDecodeError as e:
                    logger.error("❌ Ошибка парсинга JSON товаров: %s", e)
                    return web.json_response(
                        {"success": False, "error": "Invalid products data"},
                        status=500
                    )
            logger.warning(
                "⚠️ Товары не найдены в кэше. "
                "Проверьте, что бот запущен и каталог загружен."
            )
            return web.json_response({
                "success": False,
                "error": (
                    "Products not found. Please wait for catalog to load."
                ),
                "products": [],
                "count": 0
            })
    except Exception as e:
        logger.error(
            "❌ Ошибка получения товаров для Mini App: %s",
            e, exc_info=True
        )
        return web.json_response(
            {"success": False, "error": str(e), "products": [], "count": 0},
            status=500
        )


async def get_categories(request: web.Request) -> Response:
    """Get all categories for Mini App."""
    try:
        with get_db_connection() as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(
                "SELECT content FROM categories_cache WHERE key = 'categories'"
            )
            row = c.fetchone()
            if row and row['content']:
                try:
                    categories = json.loads(row['content'])
                    logger.info(
                        "Загружено %d категорий для Mini App",
                        len(categories)
                    )
                    return web.json_response({
                        "success": True,
                        "categories": categories,
                        "count": len(categories)
                    })
                except json.JSONDecodeError as e:
                    logger.error("Ошибка парсинга JSON категорий: %s", e)
                    return web.json_response(
                        {"success": False, "error": "Invalid categories data"},
                        status=500
                    )
            logger.warning("Категории не найдены в кэше")
            return web.json_response({
                "success": False,
                "error": (
                    "Categories not found. Please wait for catalog to load."
                ),
                "categories": [],
                "count": 0
            })
    except Exception as e:
        logger.error(
            "Ошибка получения категорий для Mini App: %s",
            e, exc_info=True
        )
        return web.json_response(
            {"success": False, "error": str(e), "categories": [], "count": 0},
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

        with get_db_connection() as conn:
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
            c.execute(
                "SELECT content FROM products_cache WHERE key = 'products'"
            )
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
                {
                    "success": False,
                    "error": "user_id, product_id and quantity required"
                },
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
        with get_db_connection() as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(
                "SELECT content FROM products_cache WHERE key = 'products'"
            )
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
    # НЕ обрабатываем API запросы как главную страницу
    if request.path.startswith('/api/'):
        raise web.HTTPNotFound()

    try:
        import os
        file_path = "webapp/index.html"
        if not os.path.exists(file_path):
            logger.error(
                "Файл index.html не найден: %s",
                os.path.abspath(file_path)
            )
            return Response(
                text=(
                    "<h1>Mini App not found</h1><p>File: " +
                    file_path + "</p>"
                ),
                status=404,
                content_type="text/html"
            )
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Вставляем базовый URL для API в HTML для JavaScript
        from config.settings import API_BASE_URL
        # Убираем trailing slash если есть
        base_url = API_BASE_URL.rstrip('/')
        
        # Всегда добавляем скрипт с API_BASE_URL перед закрывающим тегом head
        # Это гарантирует, что window.API_BASE_URL будет установлен до загрузки app.js
        script_tag = (
            f'<script>window.API_BASE_URL = "{base_url}";</script>'
        )
        
        # Вставляем скрипт перед закрывающим тегом head
        if '</head>' in content:
            content = content.replace('</head>', f'{script_tag}</head>')
        elif '</body>' in content:
            # Если нет </head>, вставляем перед </body>
            content = content.replace('</body>', f'{script_tag}</body>')
        else:
            # Если нет ни того, ни другого, добавляем в конец
            content = content + script_tag

        logger.info(
            "✅ Отправка index.html с базовым URL для API: %s", base_url
        )
        return Response(text=content, content_type="text/html")
    except Exception as e:
        logger.error("Ошибка загрузки index.html: %s", e, exc_info=True)
        return Response(
            text=f"<h1>Error loading Mini App</h1><p>{str(e)}</p>",
            status=500,
            content_type="text/html"
        )


async def serve_static(request: web.Request) -> Response:
    """Serve static files (CSS, JS)."""
    # НЕ обрабатываем API запросы как статические файлы
    if request.path.startswith('/api/'):
        raise web.HTTPNotFound()

    file_path = request.match_info.get('file', '')
    file_type = request.match_info.get('type', '')

    if not file_path or not file_type:
        return Response(status=404)

    try:
        file_ext = {
            'css': 'text/css',
            'js': 'application/javascript'
        }.get(file_type, 'text/plain')

        file_full_path = f"webapp/static/{file_type}/{file_path}"
        with open(file_full_path, "r", encoding="utf-8") as f:
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

        with get_db_connection() as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(
                "SELECT content FROM products_cache WHERE key = 'products'"
            )
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
    logger.info(
        "✅ Запрос AI чата получен! От %s, метод: %s, путь: %s",
        request.remote,
        request.method,
        request.path
    )
    try:
        data = await request.json()
        user_id = data.get('user_id')
        message = data.get('message', '').strip()

        if not user_id or not message:
            logger.warning("⚠️ AI чат: отсутствует user_id или message")
            return web.json_response(
                {"success": False, "error": "user_id and message required"},
                status=400
            )

        logger.info("AI чат: user_id=%s, message=%s", user_id, message[:50])

        # Получаем товары
        with get_db_connection() as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(
                "SELECT content FROM products_cache WHERE key = 'products'"
            )
            row = c.fetchone()
            products = []
            if row:
                products = json.loads(row['content'])

        logger.info("AI чат: загружено %d товаров", len(products))

        if not products:
            logger.warning("⚠️ AI чат: товары не найдены в кэше")
            return web.json_response({
                "success": True,
                "reply": (
                    "Извините, каталог товаров еще не загружен. "
                    "Попробуйте позже."
                ),
                "recommended_products": [],
                "product_ids": [],
                "order_buttons_mode": False
            })

        # Генерируем ответ через AI service
        import aiohttp
        from services.ai_service import generate_maxim_reply

        logger.info("AI чат: генерация ответа через AI service...")
        try:
            async with aiohttp.ClientSession() as session:
                (
                    reply_text, recommended_products, product_ids,
                    order_buttons_mode
                ) = await generate_maxim_reply(
                    message, session, products
                )
            logger.info(
                "✅ AI чат: ответ сгенерирован, рекомендовано товаров: %d",
                len(recommended_products) if recommended_products else 0
            )
        except Exception as ai_error:
            logger.error(
                "❌ Ошибка генерации ответа ИИ: %s",
                ai_error, exc_info=True
            )
            error_msg = str(ai_error)
            # Более понятное сообщение для пользователя
            user_friendly_msg = (
                "Извините, произошла ошибка при генерации ответа. "
                "Попробуйте позже или переформулируйте вопрос."
            )
            if (
                "timeout" in error_msg.lower() or
                "timed out" in error_msg.lower()
            ):
                user_friendly_msg = (
                    "Извините, ответ занимает слишком много времени. "
                    "Попробуйте задать вопрос короче или позже."
                )
            elif "api" in error_msg.lower() or "key" in error_msg.lower():
                user_friendly_msg = (
                    "Извините, временные проблемы с сервисом. "
                    "Попробуйте позже."
                )

            return web.json_response({
                "success": False,
                "error": error_msg,
                "reply": user_friendly_msg,
                "recommended_products": [],
                "product_ids": [],
                "order_buttons_mode": False
            }, status=500)

        # Преобразуем recommended_products в список словарей для JSON
        recommended_list = []
        if recommended_products:
            for product in recommended_products[:5]:  # Ограничиваем до 5
                if isinstance(product, dict):
                    recommended_list.append({
                        "id": product.get("id", ""),
                        "name": product.get("name", ""),
                        "price": product.get("price", ""),
                        "description": product.get("description", ""),
                        "pictures": product.get("pictures", [])
                    })

        return web.json_response({
            "success": True,
            "reply": reply_text,
            "recommended_products": recommended_list,
            "product_ids": product_ids if product_ids else [],
            "order_buttons_mode": order_buttons_mode
        })
    except Exception as e:
        logger.error("Ошибка AI чата: %s", e, exc_info=True)
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
                    (
                        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"
                        "/sendMessage"
                    ),
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

        from database.subscriptions import (
            is_user_subscribed, subscribe_user, unsubscribe_user
        )

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
    logger.info(
        "✅ Запрос заказов получен! От %s, метод: %s, путь: %s, user_id: %s",
        request.remote,
        request.method,
        request.path,
        request.query.get('user_id')
    )
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


@web.middleware
async def error_middleware(request: web.Request, handler):
    """Middleware для обработки ошибок и добавления CORS заголовков."""
    # Обработка OPTIONS запросов для CORS
    if request.method == 'OPTIONS':
        return web.Response(
            headers={
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '3600'
            }
        )

    # Логируем запросы к API
    if request.path.startswith('/api/'):
        logger.info(
            "📥 API запрос: %s %s от %s",
            request.method, request.path, request.remote
        )
        # Дополнительная диагностика для проблемных endpoints
        if '/api/ai/chat' in request.path:
            logger.info(
                "🔍 Детали запроса AI чата: method=%s, path=%s, query=%s",
                request.method, request.path, dict(request.query)
            )
        if '/api/orders' in request.path:
            logger.info(
                "🔍 Детали запроса заказов: method=%s, path=%s, query=%s",
                request.method, request.path, dict(request.query)
            )

    try:
        response = await handler(request)
        # Логируем успешные ответы
        if request.path.startswith('/api/'):
            logger.info(
                "✅ API ответ: %s %s -> %d",
                request.method, request.path, response.status
            )
        # Добавляем CORS заголовки
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'

        # Убеждаемся, что API endpoints всегда возвращают JSON
        if request.path.startswith('/api/'):
            content_type = response.headers.get('Content-Type', '')
            if 'application/json' not in content_type:
                logger.warning(
                    "API endpoint %s вернул не-JSON ответ "
                    "(content-type: %s), принудительно устанавливаем JSON",
                    request.path, content_type
                )
                # Принудительно устанавливаем JSON content-type
                response.headers['Content-Type'] = (
                    'application/json; charset=utf-8'
                )

        return response
    except web.HTTPException as ex:
        # Для HTTP исключений возвращаем JSON для API запросов
        if request.path.startswith('/api/'):
            logger.error(
                "❌ HTTP %d для API endpoint: %s %s",
                ex.status, request.method, request.path
            )
            logger.error("   Причина: %s", ex.reason)
            # Логируем все зарегистрированные маршруты для диагностики
            if ex.status == 404:
                logger.error("   🔍 Зарегистрированные API маршруты:")
                ai_chat_exists = False
                for route in request.app.router.routes():
                    route_str = str(route.resource)
                    method = getattr(route, 'method', 'ANY')
                    if '/api/' in route_str:
                        logger.error(
                            "     %s %s", method, route_str[:80]
                        )
                        if '/api/ai/chat' in route_str:
                            ai_chat_exists = True
                            logger.error(
                                "     ✅ Маршрут /api/ai/chat найден, "
                                "но запрос %s %s не совпадает",
                                request.method, request.path
                            )
                # Дополнительная диагностика для AI чата
                if '/api/ai/chat' in request.path:
                    if not ai_chat_exists:
                        logger.error(
                            "   ❌ Маршрут /api/ai/chat НЕ ЗАРЕГИСТРИРОВАН!"
                        )
                    else:
                        logger.error(
                            "   ⚠️ Запрос к /api/ai/chat не найден! "
                            "Проверьте метод запроса (должен быть POST)"
                        )
                
                # Дополнительная диагностика для заказов
                orders_exists = False
                if '/api/orders' in request.path:
                    for route in request.app.router.routes():
                        route_str = str(route.resource)
                        if '/api/orders' in route_str:
                            orders_exists = True
                            logger.error(
                                "     ✅ Маршрут /api/orders найден, "
                                "но запрос %s %s не совпадает",
                                request.method, request.path
                            )
                            break
                    if not orders_exists:
                        logger.error(
                            "   ❌ Маршрут /api/orders НЕ ЗАРЕГИСТРИРОВАН!"
                        )
                    else:
                        logger.error(
                            "   ⚠️ Запрос к /api/orders не найден! "
                            "Проверьте метод запроса (должен быть GET)"
                        )
            error_msg = (
                ex.reason or
                f"Endpoint not found: {request.method} {request.path}"
            )
            if ex.status == 404:
                error_msg = (
                    f"API endpoint not found: {request.method} "
                    f"{request.path}. Проверьте, что сервер запущен."
                )
            return web.json_response({
                "success": False,
                "error": error_msg
            }, status=ex.status)
        raise
    except Exception as ex:
        logger.error("Необработанная ошибка: %s", ex, exc_info=True)
        # Для API запросов возвращаем JSON
        if request.path.startswith('/api/'):
            return web.json_response({
                "success": False,
                "error": str(ex)
            }, status=500)
        raise


def create_webapp_app() -> web.Application:
    """Create aiohttp application for Mini App."""
    app = web.Application(middlewares=[error_middleware])

    # API routes (должны быть первыми!)
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
    
    # Логируем зарегистрированные маршруты при запуске
    logger.info("📋 Зарегистрированные API маршруты:")
    ai_chat_found = False
    orders_found = False
    for route in app.router.routes():
        route_str = str(route.resource)
        method = getattr(route, 'method', 'ANY')
        if '/api/' in route_str:
            logger.info("   %s %s", method, route_str)
            if '/api/ai/chat' in route_str:
                ai_chat_found = True
            if '/api/orders' in route_str:
                orders_found = True
    
    if not ai_chat_found:
        logger.error("❌ КРИТИЧНО: Маршрут /api/ai/chat НЕ ЗАРЕГИСТРИРОВАН!")
    else:
        logger.info("✅ Маршрут /api/ai/chat успешно зарегистрирован")
    
    if not orders_found:
        logger.error("❌ КРИТИЧНО: Маршрут /api/orders НЕ ЗАРЕГИСТРИРОВАН!")
    else:
        logger.info("✅ Маршрут /api/orders успешно зарегистрирован")

    # Static files
    app.add_routes([
        web.get("/static/{type}/{file}", serve_static),
    ])

    # Main page (должен быть последним!)
    app.add_routes([
        web.get("/", serve_index),
    ])

    return app
