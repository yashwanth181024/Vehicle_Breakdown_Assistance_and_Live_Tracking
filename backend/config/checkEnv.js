/**
 * Startup configuration check.
 * Inspects process.env and prints a clear summary of configured integration channels.
 * Never prints, logs, or exposes secret values.
 * Must never crash the server.
 */
function checkEnv() {
  try {
    const lines = [];

    // Database
    const dbOk = Boolean(process.env.MONGO_URI && process.env.MONGO_URI.trim());
    lines.push(`[config] Database ........ ${dbOk ? 'OK' : 'MISSING (set MONGO_URI)'}`);

    // JWT Secret
    const jwt = (process.env.JWT_SECRET || '').trim();
    if (!jwt) {
      lines.push('[config] JWT secret ...... MISSING (set JWT_SECRET)');
    } else if (jwt.length < 32) {
      lines.push('[config] JWT secret ...... WEAK (shorter than 32 characters)');
    } else {
      lines.push('[config] JWT secret ...... OK');
    }

    console.log(lines.join('\n'));
  } catch (err) {
    console.error('[config] checkEnv encountered an error:', err.message);
  }
}

module.exports = checkEnv;
