import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

django_asgi_app = get_asgi_application()

try:
    from channels.auth import AuthMiddlewareStack
    from channels.routing import ProtocolTypeRouter, URLRouter
    from backend.routing import websocket_urlpatterns
    from backend.websocket_auth import JWTAuthMiddleware

    application = ProtocolTypeRouter({
        'http': django_asgi_app,
        'websocket': AuthMiddlewareStack(
            JWTAuthMiddleware(URLRouter(websocket_urlpatterns))
        ),
    })
except ImportError:
    application = django_asgi_app
