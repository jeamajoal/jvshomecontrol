import { io } from 'socket.io-client';

export const API_HOST = `http://${window.location.hostname}:3000`;

// Shared singleton socket for the client app.
export const socket = io(API_HOST);
