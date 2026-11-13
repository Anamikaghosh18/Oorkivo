const configuredApiUrl = import.meta.env.VITE_API_URL
  || `${window.location.protocol}//${window.location.hostname}:8000/api`;
const apiUrl = new URL(configuredApiUrl, window.location.origin);
const websocketOrigin = import.meta.env.VITE_WS_URL
  || `${apiUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${apiUrl.host}`;

export function connectWebSocket(path, onMessage, { onOpen } = {}) {
  let socket;
  let reconnectTimer;
  let reconnectAttempts = 0;
  let disconnected = false;

  const connect = () => {
    const token = localStorage.getItem('access_token');
    if (!token || disconnected) return;

    socket = new WebSocket(new URL(path, websocketOrigin), [
      'oorkivo',
      `jwt.${token}`,
    ]);

    socket.onopen = () => {
      reconnectAttempts = 0;
      onOpen?.();
    };

    socket.onmessage = ({ data: rawData }) => {
      let message;
      try {
        message = JSON.parse(rawData);
      } catch (error) {
        console.error('Could not process a WebSocket message.', error);
        return;
      }
      onMessage(message);
    };

    socket.onclose = ({ code }) => {
      if (disconnected || code === 4401 || code === 4403) return;
      const delay = Math.min(1000 * (2 ** reconnectAttempts), 30000);
      reconnectAttempts += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    };
  };

  connect();

  return () => {
    disconnected = true;
    window.clearTimeout(reconnectTimer);
    socket?.close(1000, 'Subscription closed');
  };
}

export function connectChatWebSocket(conversationId, onMessage, { onOpen } = {}) {
  return connectWebSocket(`/ws/chat/${conversationId}/`, onMessage, { onOpen });
}
