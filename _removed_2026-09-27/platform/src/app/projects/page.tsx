"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { prismaProjects } from "@/lib/projects-db";

// Types
interface Project {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  baseUrl?: string;
  lastHealthStatus: string;
  lastHealthCheck?: string;
  _count: { issues: number };
  issues: Array<{
    id: string;
    issueNumber: string;
    title: string;
    type: string;
    priority: string;
    status: string;
    severity: string;
    createdAt: string;
  }>;
}

interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  totalIssues: number;
  openIssues: number;
  criticalIssues: number;
  resolvedThisMonth: number;
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    // Project statuses
    active: { label: "Active", className: "bg-green-100 text-green-800" },
    maintenance: { label: "Maintenance", className: "bg-yellow-100 text-yellow-800" },
    archived: { label: "Archived", className: "bg-gray-100 text-gray-600" },
    
    // Issue statuses
    open: { label: "Open", className: "bg-red-100 text-red-800" },
    in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-800" },
    in_review: { label: "In Review", className: "bg-purple-100 text-purple-800" },
    resolved: { label: "Resolved", className: "bg-green-100 text-green-800" },
    closed: { label: "Closed", className: "bg-gray-100 text-gray-600" },
    wont_fix: { label: "Won't Fix", className: "bg-gray-100 text-gray-600" },
    
    // Health statuses
    healthy: { label: "Healthy", className: "bg-green-100 text-green-800" },
    degraded: { label: "Degraded", className: "bg-yellow-100 text-yellow-800" },
    down: { label: "Down", className: "bg-red-100 text-red-800" },
    unknown: { label: "Unknown", className: "bg-gray-100 text-gray-600" },
  };

  const cfg = config[status] || { label: status, className: "bg-gray-100 text-gray-600" };
  
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

// Priority badge
function PriorityBadge({ priority }: { priority: string }) {
  const config: Record<string, string> = {
    urgent: "bg-red-600 text-white",
    critical: "bg-red-500 text-white",
    high: "bg-orange-500 text-white",
    medium: "bg-blue-500 text-white",
    low: "bg-gray-400 text-white",
  };
  
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${config[priority] || "bg-gray-400 text-white"}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  );
}

// Severity badge
function SeverityBadge({ severity }: { severity: string }) {
  const config: Record<string, string> = {
    blocker: "bg-red-700 text-white",
    critical: "bg-red-500 text-white",
    major: "bg-orange-500 text-white",
    minor: "bg-yellow-500 text-white",
    info: "bg-gray-500 text-white",
  };
  
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${config[severity] || "bg-gray-500 text-white"}`}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
}

// Type icon
function TypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    bug: "🐛",
    feature: "✨",
    improvement: "📈",
    task: "📋",
    incident: "🚨",
    web: "🌐",
    mobile: "📱",
    backend: "⚙️",
    infrastructure: "🏗️",
    other: "📁",
  };
  
  return (
    <span className="text-lg" title={type}>
      {icons[type] || icons.other}
    </span>
  );
}

// Dashboard Stats Card
function StatsCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: number | string;
  subtitle?: string;
  icon: string;
  color: string;
}) {
  return (
    <div className={`bg-white rounded-lg border p-4 ${color}`}>
      <div className="flex items-center gap-3">
        <div className="p-2 bg-white/80 rounded-lg">
          <span className="text-2xl">{icon}</span>
        </div>
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

// Project Card
function ProjectCard({ project }: { project: Project }) {
  const issueCount = project._count.issues;
  const openIssues = project.issues.filter(i => i.status !== "closed").length;

  return (
    <div className="bg-white rounded-lg border p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <TypeIcon type={project.type} />
          <div>
            <h3 className="font-semibold text-gray-900">{project.name}</h3>
            <p className="text-sm text-gray-500">{project.slug}</p>
          </div>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {/* Issue counts */}
      <div className="flex gap-4 text-sm text-gray-600 mb-3">
        <span>{issueCount} issues</span>
        <span>{openIssues} open</span>
      </div>

      {/* Project link */}
      {project.baseUrl && (
        <a 
          href={project.baseUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          Open →
        </a>
      )}

      {/* Health status */}
      {project.lastHealthStatus && project.lastHealthStatus !== "unknown" && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
          <span className="text-gray-500">Last health check:</span>
          <StatusBadge status={project.lastHealthStatus} />
        </div>
      )}

      {/* Recent issues */}
      {project.issues.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2">Recent issues:</p>
          <div className="space-y-1">
            {project.issues.slice(0, 3).map(issue => (
              <Link
                key={issue.id}
                href={`/projects/${project.slug}/issues/${issue.id}`}
                className="block text-sm text-gray-700 hover:text-blue-600 py-1"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{issue.issueNumber}</span>
                  <span className="truncate">{issue.title}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Main Dashboard Component
export default function ProjectsDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "archived">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await prismaProjects.getAllProjectsSummary();
        const statsData = await prismaProjects.getDashboardStats();
        setProjects(data);
        setStats(statsData);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const filteredProjects = projects.filter(p => {
    if (activeTab === "active") return p.status === "active";
    if (activeTab === "archived") return p.status === "archived";
    return true;
  }).filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || 
           p.slug.toLowerCase().includes(q) ||
           p.type.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="ml-3 text-gray-600">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Project Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage and monitor all your projects and their issues
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                + Add Project
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Dashboard Stats */}
        {stats && (
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatsCard
              title="Total Projects"
              value={stats.totalProjects}
              subtitle={`${stats.activeProjects} active`}
              icon="📊"
              color="border-l-4 border-l-blue-500"
            />
            <StatsCard
              title="Open Issues"
              value={stats.openIssues}
              subtitle={`of ${stats.totalIssues} total`}
              icon="📝"
              color="border-l-4 border-l-yellow-500"
            />
            <StatsCard
              title="Critical Issues"
              value={stats.criticalIssues}
              subtitle="Need attention"
              icon="🚨"
              color="border-l-4 border-l-red-500"
            />
            <StatsCard
              title="Resolved This Month"
              value={stats.resolvedThisMonth}
              icon="✅"
              color="border-l-4 border-l-green-500"
            />
          </section>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex bg-white rounded-lg border p-1">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "all"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All Projects
            </button>
            <button
              onClick={() => setActiveTab("active")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "active"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setActiveTab("archived")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === "archived"
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Archived
            </button>
          </div>

          <div className="relative">
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-64 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
          </div>
        </div>

        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border">
            <div className="text-6xl mb-4">📁</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No projects found</h3>
            <p className="text-gray-500 mb-4">
              {activeTab === "all"
                ? "Get started by adding your first project."
                : `No ${activeTab} projects found.`}
            </p>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              + Add Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map(project => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
