/**
 * User Session Monitor - Check for issues in user sessions
 * Runs as a cron script to monitor what's happening in user sessions
 */

export async function checkUserSessions() {
  const fs = await import('fs');
  const path = await import('path');
  
  const sessionDir = path.join(process.env.HERMES_HOME || '', 'sessions');
  const logDir = path.join(process.env.HERMES_HOME || '', 'logs');
  
  const result = {
    timestamp: new Date().toISOString(),
    sessions: [],
    issues: [],
    summary: {
      totalSessions: 0,
      activeSessions: 0,
      issuesFound: 0,
      warnings: 0
    }
  };
  
  try {
    // Check session files
    if (fs.existsSync(sessionDir)) {
      const sessions = fs.readdirSync(sessionDir);
      result.summary.totalSessions = sessions.length;
      
      // Look at last few sessions
      const recentSessions = sessions.slice(-5);
      for (const sessionFile of recentSessions) {
        try {
          const sessionPath = path.join(sessionDir, sessionFile);
          const content = fs.readFileSync(sessionPath, 'utf-8');
          const lines = content.split('\n').filter(l => l.trim()).slice(-10);
          
          for (const line of lines) {
            try {
              const data = JSON.parse(line);
              if (data.tool_call || data.tool_use) {
                result.issues.push({
                  type: 'session_activity',
                  session: sessionFile,
                  tool: data.tool_call?.name || data.tool_use?.name,
                  timestamp: data.timestamp || data.time
                });
              }
              if (data.error) {
                result.issues.push({
                  type: 'session_error',
                  session: sessionFile,
                  error: data.error.message || JSON.stringify(data.error),
                  timestamp: data.timestamp || data.time
                });
                result.summary.issuesFound++;
              }
              if (data.warning) {
                result.issues.push({
                  type: 'session_warning', 
                  session: sessionFile,
                  warning: data.warning,
                  timestamp: data.timestamp || data.time
                });
                result.summary.warnings++;
              }
            } catch (e) {
              // Skip parse errors
            }
          }
        } catch (e) {
          // Skip files that can't be read
        }
      }
    }
    
    // Check logs for issues
    const logFiles = ['agent.log', 'errors.log', 'gateway.log', 'desktop.log'];
    
    for (const logFile of logFiles) {
      const logPath = path.join(logDir, logFile);
      if (fs.existsSync(logPath)) {
        try {
          const content = fs.readFileSync(logPath, 'utf-8');
          const lines = content.split('\n').slice(-200);
          
          for (const line of lines) {
            if (line.includes('ERROR') || line.includes('error')) {
              result.issues.push({
                type: 'log_error',
                source: logFile,
                message: line.trim(),
                timestamp: line.substring(0, 19) || new Date().toISOString()
              });
              result.summary.issuesFound++;
            }
            if (line.includes('FAILED') || line.includes('failed')) {
              result.issues.push({
                type: 'log_failure',
                source: logFile,
                message: line.trim(),
                timestamp: line.substring(0, 19) || new Date().toISOString()
              });
              result.summary.issuesFound++;
            }
          }
        } catch (e) {
          // Skip
        }
      }
    }
    
    // Generate summary
    result.summary.activeSessions = sessions.filter(s => s.endsWith('.jsonl')).length;
    
  } catch (e) {
    result.issues.push({
      type: 'monitor_error',
      message: `Error checking sessions: ${e.message}`
    });
  }
  
  return result;
}

// Export for use as cron script
module.exports = { checkUserSessions };
