from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class JWTAuthMiddleware:
    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        scope = dict(scope)
        token = self._get_token(scope)
        if token:
            scope['user'] = await sync_to_async(
                self._authenticate, thread_sensitive=True
            )(token)
        return await self.inner(scope, receive, send)

    @staticmethod
    def _get_token(scope):
        for protocol in scope.get('subprotocols', []):
            if protocol.startswith('jwt.'):
                return protocol[4:]
        query = parse_qs(scope.get('query_string', b'').decode('utf-8'))
        return query.get('token', [None])[0]

    @staticmethod
    def _authenticate(raw_token):
        try:
            authentication = JWTAuthentication()
            validated_token = authentication.get_validated_token(raw_token.encode())
            return authentication.get_user(validated_token)
        except (AuthenticationFailed, InvalidToken):
            return AnonymousUser()
