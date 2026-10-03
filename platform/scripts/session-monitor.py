#!/usr/bin/env python3
"""
User Session Monitor - Tracks issues in user sessions and system logs
Shows which system/project has issues being updated
"""

import json
import os
import datetime
from pathlib import Path
from collections import defaultdict

HERMES_HOME = Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes")))
LOG_DIR = HERMES_HOME / "logs"
SESSION_DIR = HERMES_HOME / "sessions"

# System mapping for log entries
SYSTEM_MAP = {
    "agency-platform": ["agency-platform", "localhost:3400", "nextjs", "next.js"],
    "intellicash-mobile": ["intellicash", "mobile", "flutter", "android", "neon"],
    "intellicash-admin": ["intellicash_admin", "admin", "dashboard", "web"],
    "backend-api": ["api", "server", "node", "express"],
    "database": ["postgres", "database", "pg", "sql", "connection"],
    "telegram": ["telegram", "bot", "telegram.org"],
    "hermes": ["hermes", "gateway", "agent"],
}

def identify_system(message: str) -> str:
    """Identify which system a log entry belongs to"""
    msg_lower = message.lower()
    for system, keywords in SYSTEM_MAP.items():
        if any(kw in msg_lower for kw in keywords):
            return system
    return "other"

def parse_session_file(session_path: Path) -> list:
    """Parse session JSONL file for activity"""
    activities = []
    try:
        with open(session_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        for line in lines[-50:]:  # Last 50 entries
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                tool = data.get('tool', data.get('tool_call', {}).get('name', ''))
                if tool:
                    activities.append({
                        'timestamp': data.get('timestamp', data.get('time', '')),
                        'tool': tool,
                        'session': session_path.name,
                        'status': 'error' if data.get('error') else 'success'
                    })
            except:
                pass
    except Exception as e:
        activities.append({'error': str(e), 'session': session_path.name})
    return activities

def get_recent_issues(log_file: Path, hours: int = 2) -> dict:
    """Get issues from log file grouped by system"""
    issues_by_system = defaultdict(list)
    cutoff = datetime.datetime.now() - datetime.timedelta(hours=hours)
    
    try:
        with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f.readlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    # Try to parse timestamp
                    ts_str = line[:19]
                    ts = datetime.datetime.strptime(ts_str, '%Y-%m-%d %H:%M:%S')
                    if ts < cutoff:
                        continue
                except:
                    continue
                
                system = identify_system(line)
                if 'error' in line.lower() or 'failed' in line.lower() or 'timeout' in line.lower() or 'exception' in line.lower():
                    issues_by_system[system].append(line)
    except:
        pass
    
    return dict(issues_by_system)

def generate_report() -> str:
    """Generate the monitoring report"""
    now = datetime.datetime.now()
    report_lines = []
    
    report_lines.append("🔍 <b>User Session & System Monitor</b>")
    report_lines.append(f"🕐 <b>Last checked:</b> {now.strftime('%Y-%m-%d %H:%M:%S EAT')}\n")
    
    # Section 1: User Sessions
    report_lines.append("👥 <b>ACTIVE USER SESSIONS</b>")
    report_lines.append("─" * 50)
    
    if SESSION_DIR.exists():
        sessions = list(SESSION_DIR.glob("*.jsonl"))
        report_lines.append(f"📊 Total sessions: <b>{len(sessions)}</b>\n")
        
        if sessions:
            report_lines.append("📝 <b>Recent session activity:</b>\n")
            for session_file in sorted(sessions, key=lambda x: x.stat().st_mtime, reverse=True)[:5]:
                activities = parse_session_file(session_file)
                if activities:
                    errors = [a for a in activities if a.get('status') == 'error']
                    report_lines.append(f"  🔹 <b>{session_file.name}</b>")
                    report_lines.append(f"     Last activity: {activities[0].get('timestamp', 'N/A')}")
                    report_lines.append(f"     Tools used: {len(activities)}")
                    if errors:
                        report_lines.append(f"     ⚠️ Errors: {len(errors)}")
                        for err in errors[:3]:
                            report_lines.append(f"        🔴 {err.get('tool', 'unknown')} error")
                    else:
                        report_lines.append(f"     ✅ All operations successful")
                    report_lines.append("")
    else:
        report_lines.append("  ℹ️ No session files found\n")
    
    # Section 2: Issues by System (last 2 hours)
    report_lines.append("\n⚠️ <b>ISSUES BY SYSTEM (Last 2 Hours)</b>")
    report_lines.append("─" * 50)
    
    systems = ["agency-platform", "intellicash-mobile", "intellicash-admin", "database", "telegram", "hermes"]
    total_errors = 0
    
    for system in systems:
        # Check errors.log
        errors = []
        error_file = LOG_DIR / "errors.log"
        if error_file.exists():
            system_errors = get_recent_issues(error_file, hours=2)
            errors = system_errors.get(system, [])[:5]
        
        report_lines.append(f"\n  🔹 <b>{system.upper().replace('-', ' ')}</b>")
        if errors:
            total_errors += len(errors)
            report_lines.append(f"     🔴 <b>{len(errors)} issue(s) found:</b>")
            for err in errors:
                # Truncate long messages
                msg = err[:150] + ("..." if len(err) > 150 else "")
                report_lines.append(f"        • {msg}")
        else:
            report_lines.append("     ✅ No issues")
    
    # Section 3: Recent Critical Issues
    report_lines.append("\n\n🚨 <b>CRITICAL ISSUES (All Systems)</b>")
    report_lines.append("─" * 50)
    
    critical = []
    error_file = LOG_DIR / "errors.log"
    if error_file.exists():
        try:
            with open(error_file, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()[-100:]
            for line in reversed(lines):
                line = line.strip()
                if 'critical' in line.lower() or 'fatal' in line.lower() or 'crash' in line.lower():
                    system = identify_system(line)
                    critical.append(f"  [{system}] {line[:120]}")
                if len(critical) >= 5:
                    break
        except:
            pass
    
    if critical:
        for c in critical:
            report_lines.append(c)
    else:
        report_lines.append("  ✅ No critical issues found")
    
    # Section 4: System Health Summary
    report_lines.append("\n\n📊 <b>SYSTEM HEALTH SUMMARY</b>")
    report_lines.append("─" * 50)
    
    for system in ["agency-platform", "intellicash-mobile", "intellicash-admin", "database", "telegram", "hermes"]:
        issues = []
        error_file = LOG_DIR / "errors.log"
        if error_file.exists():
            system_issues = get_recent_issues(error_file, hours=24)
            issues = system_issues.get(system, [])
        
        if issues:
            status = f"⚠️ {len(issues)} issue(s) in last 24h"
        else:
            status = "✅ Healthy"
        report_lines.append(f"  • {system.upper().replace('-', ' '):{25}} {status}")
    
    report_lines.append("")
    report_lines.append(f"⏰ Next check: {now + datetime.timedelta(hours=2):%Y-%m-%d %H:%M}")
    
    return "\n".join(report_lines)

if __name__ == "__main__":
    print(generate_report())
