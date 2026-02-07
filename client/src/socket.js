import { io } from 'socket.io-client';

import { API_HOST } from './apiHost';

// Shared singleton socket for the client app.
// Configured for kiosk resilience — reconnects aggressively on flaky
// tablet WiFi, with exponential backoff to avoid hammering the server.
export const socket = io(API_HOST, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
  timeout: 20000,
  transports: ['websocket', 'polling'],
});
