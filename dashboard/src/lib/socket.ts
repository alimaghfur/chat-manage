import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
  }
  return socket;
}

export function joinSession(sessionId: string) {
  const s = getSocket();
  s.emit('join-session', sessionId);
}

export function leaveSession(sessionId: string) {
  const s = getSocket();
  s.emit('leave-session', sessionId);
}
