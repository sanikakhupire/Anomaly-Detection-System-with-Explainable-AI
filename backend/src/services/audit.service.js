const AuditLog = require('../models/AuditLog');

/**
 * Creates an audit log entry.
 * Non-blocking to avoid interrupting user flows if audit write encounters issues.
 */
const logAudit = async ({ user = null, action, entity, entityId = null, metadata = {}, req = null }) => {
  try {
    const ip = req ? req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress : null;
    const userAgent = req ? req.headers['user-agent'] : null;

    const auditEntry = new AuditLog({
      user: user?._id || user || null,
      action,
      entity,
      entityId: entityId ? String(entityId) : null,
      metadata,
      ip,
      userAgent,
    });

    await auditEntry.save();
    return auditEntry;
  } catch (error) {
    console.error(`[AuditLog Error] Failed to record audit log: ${error.message}`);
    return null;
  }
};

module.exports = {
  logAudit,
};
