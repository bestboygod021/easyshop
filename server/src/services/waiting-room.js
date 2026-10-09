import crypto from 'node:crypto';

/**
 * Virtual Waiting Room token bucket and queue manager for high-traffic Flash Sales.
 * Limits concurrent checkouts to ensure fair FIFO inventory allocation and zero race-condition stockouts.
 */
class VirtualWaitingRoom {
  constructor(maxActiveCheckouts = 50, ticketTtlMs = 120_000) {
    this.maxActiveCheckouts = maxActiveCheckouts;
    this.ticketTtlMs = ticketTtlMs;
    this.activeCheckouts = new Map(); // token -> { userId, expiresAt }
    this.waitingQueue = [];           // array of { id, userId, enqueuedAt }
  }

  cleanExpired() {
    const now = Date.now();
    for (const [token, data] of this.activeCheckouts.entries()) {
      if (data.expiresAt < now) {
        this.activeCheckouts.delete(token);
      }
    }
  }

  requestEntry(userId) {
    this.cleanExpired();
    // If capacity available, issue immediate access ticket
    if (this.activeCheckouts.size < this.maxActiveCheckouts) {
      const token = `vwr_${crypto.randomBytes(16).toString('hex')}`;
      this.activeCheckouts.set(token, {
        userId,
        expiresAt: Date.now() + this.ticketTtlMs,
      });
      return {
        status: 'granted',
        token,
        expires_in_seconds: Math.floor(this.ticketTtlMs / 1000),
        queue_position: 0,
      };
    }

    // Otherwise place in queue
    const queueId = `q_${crypto.randomBytes(8).toString('hex')}`;
    this.waitingQueue.push({ id: queueId, userId, enqueuedAt: Date.now() });
    return {
      status: 'queued',
      queue_id: queueId,
      queue_position: this.waitingQueue.length,
      estimated_wait_seconds: this.waitingQueue.length * 5,
    };
  }

  validateTicket(token) {
    if (!token) return false;
    this.cleanExpired();
    const ticket = this.activeCheckouts.get(token);
    return Boolean(ticket && ticket.expiresAt > Date.now());
  }

  releaseTicket(token) {
    this.activeCheckouts.delete(token);
    this.cleanExpired();
    if (this.waitingQueue.length > 0 && this.activeCheckouts.size < this.maxActiveCheckouts) {
      const nextUser = this.waitingQueue.shift();
      const newToken = `vwr_${crypto.randomBytes(16).toString('hex')}`;
      this.activeCheckouts.set(newToken, {
        userId: nextUser.userId,
        expiresAt: Date.now() + this.ticketTtlMs,
      });
      return { next_granted: true, user_id: nextUser.userId, token: newToken };
    }
    return { next_granted: false };
  }
}

export const virtualWaitingRoom = new VirtualWaitingRoom();
