from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

from communication.models import Message
from communication.services import user_can_access_project
from projects.models import Project


class ChatConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get('user', AnonymousUser())
        if not user.is_authenticated:
            await self.close(code=4401)
            return

        self.conversation_id = self.scope['url_route']['kwargs']['conversation_id']
        self.group_name = f'chat_conversation_{self.conversation_id}'
        
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept(subprotocol='oorkivo')

    async def disconnect(self, close_code):
        group_name = getattr(self, 'group_name', None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        user = self.scope.get('user', AnonymousUser())
        if not user.is_authenticated:
            await self.close(code=4401)
            return

        if content.get('type') == 'message':
            message = await database_sync_to_async(Message.objects.create)(
                conversation_id=self.conversation_id,
                content=content.get('content', ''),
                author=user,
            )
            await self.channel_layer.group_send(
                self.group_name,
                {
                    'type': 'chat_message',
                    'message': {
                        'id': message.id,
                        'content': message.content,
                        'author': {
                            'id': user.id,
                            'email': user.email,
                            'first_name': user.first_name,
                            'last_name': user.last_name,
                        },
                        'created_at': message.created_at.isoformat(),
                    },
                }
            )

    async def chat_message(self, event):
        await self.send_json({
            'type': 'message',
            'message': event['message'],
        })


class BoardConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get('user', AnonymousUser())
        self.project_id = self.scope['url_route']['kwargs']['project_id']
        if not user.is_authenticated or not await self._can_access_project(user):
            await self.close(code=4403 if user.is_authenticated else 4401)
            return

        self.group_name = f'board_project_{self.project_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept(subprotocol='oorkivo')

    async def disconnect(self, close_code):
        group_name = getattr(self, 'group_name', None)
        if group_name:
            await self.channel_layer.group_discard(group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        await self.close(code=1008)

    @database_sync_to_async
    def _can_access_project(self, user):
        project = Project.objects.filter(pk=self.project_id).first()
        return project is not None and user_can_access_project(user, project)

    async def board_update(self, event):
        await self.send_json({
            'type': 'board.update',
            'project_id': event['project_id'],
            'task_id': event['task_id'],
            'action': event['action'],
        })
