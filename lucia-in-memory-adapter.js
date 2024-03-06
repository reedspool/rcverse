// Ad-hoc in-memory adapter (no database) for Lucia

export function Adapter() {
  this.sessions = {};
}

Adapter.prototype.deleteExpiredSessions = async function () {
  const now = Date.now();
  Object.entries(this.sessions).forEach(([id, session]) => {
    if (session.expiresAtMillis > now) {
      this.deleteSession(id);
    }
  });
};

Adapter.prototype.deleteSession = async function (sessionId) {
  this.sessions[sessionId] = null;
};
Adapter.prototype.deleteUserSessions = async function (userId) {
  this.getUserSessions(userId).forEach((session) => {
    this.deleteSession(session.id);
  });
};

Adapter.prototype.getSessionAndUser = async function (sessionId) {
  const session = this.sessions[sessionId];
  return [session, { userId: session?.userId }];
};
Adapter.prototype.getUserSessions = async function (userId) {
  return Object.values(this.sessions).filter(
    (session) => session.userId === userId,
  );
};

Adapter.prototype.setSession = async function (session) {
  this.sessions[session.id] = session;
};
Adapter.prototype.updateSessionExpiration = async function (
  sessionId,
  expiresAtDate,
) {
  this.sessions[sessionId].expiresAtMillis = expiresAtDate.getTime();
};
