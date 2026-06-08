import { io } from 'socket.io-client';

// Replace with your backend URL
const SOCKET_URL = window.location.origin;
export const socket = io(SOCKET_URL, {
  autoConnect: false // Connect manually when needed
});