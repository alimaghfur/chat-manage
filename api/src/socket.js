/**
 * Socket.IO initialization and event handling
 * Manages real-time communication for WhatsApp session events
 */

/**
 * Initialize Socket.IO event handlers
 * @param {import('socket.io').Server} io - Socket.IO server instance
 */
function initializeSocket(io) {
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    /**
     * Join a session room to receive events for a specific WhatsApp session
     * @event join-session
     * @param {string} sessionId - The session ID to subscribe to
     */
    socket.on('join-session', (sessionId) => {
      if (!sessionId) {
        socket.emit('error', { message: 'Session ID is required' });
        return;
      }
      socket.join(`session:${sessionId}`);
      console.log(`Socket ${socket.id} joined session: ${sessionId}`);
      socket.emit('joined-session', { sessionId });
    });

    /**
     * Leave a session room to stop receiving events for a specific WhatsApp session
     * @event leave-session
     * @param {string} sessionId - The session ID to unsubscribe from
     */
    socket.on('leave-session', (sessionId) => {
      if (!sessionId) {
        socket.emit('error', { message: 'Session ID is required' });
        return;
      }
      socket.leave(`session:${sessionId}`);
      console.log(`Socket ${socket.id} left session: ${sessionId}`);
      socket.emit('left-session', { sessionId });
    });

    /**
     * Handle socket disconnection
     */
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
    });

    /**
     * Handle socket errors
     */
    socket.on('error', (err) => {
      console.error(`Socket error for ${socket.id}:`, err.message);
    });
  });
}

module.exports = { initializeSocket };
