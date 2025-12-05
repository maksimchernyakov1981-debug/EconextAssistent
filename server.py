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
        from database.cart import clear_cart
        
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

