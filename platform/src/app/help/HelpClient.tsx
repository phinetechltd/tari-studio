"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { Search, Sparkles, BookOpen, UserPlus, ShieldCheck, Video, Image as ImageIcon, MessageCircle, BarChart3, Settings } from "lucide-react";

const sections = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: UserPlus,
    items: [
      { title: "Sign up for an account", slug: "sign-up", content: "Create a free account at /signup. Enter your work email, choose a password, and confirm your email via the link we send. New accounts start with a setup wizard." },
      { title: "Verify your email", slug: "verify-email", content: "Click the verification link in your inbox. If the link expired, use /verify to request a new one." },
      { title: "Accept an invitation", slug: "accept-invite", content: "Team owners send invites. Open /accept-invite/[token], set your password, and you’ll join the organisation." },
      { title: "Setup wizard", slug: "setup-wizard", content: "First login opens /setup. Add your first brand, connect a social channel, and set billing. Progress is saved as you go." },
      { title: "Log in and MFA", slug: "login-mfa", content: "Sign in at /login. Roles with publishing access must enable two-factor authentication in /security." },
    ]
  },
  {
    id: "account",
    title: "Account & Billing",
    icon: ShieldCheck,
    items: [
      { title: "Profile & security", slug: "profile-security", content: "Edit name, email, and password in /account. Manage MFA and sessions in /security." },
      { title: "Organisations", slug: "organisations", content: "Owners manage members, roles and permissions in /platform/orgs. Switch organisations from the top bar." },
      { title: "Plans & credits", slug: "plans-credits", content: "Choose a plan in /platform/subscriptions. Credits buy video and image generations. Credits never expire." },
      { title: "Payments", slug: "payments", content: "Pay by M-Pesa or card in /platform/payments. View invoices and top-ups." },
    ]
  },
  {
    id: "create",
    title: "Create Content",
    icon: Sparkles,
    items: [
      { title: "Studio – Video ads", slug: "studio-video", content: "Go to /content. Write a prompt, pick brand, aspect ratio and length. See credit cost before generation. Up to 10 seconds per step, with sound." },
      { title: "Studio – Image ads", slug: "studio-image", content: "Same Studio, select Image. Choose poster, product or square. 1 credit per image per plan." },
      { title: "Library", slug: "library", content: "All generated assets live in /content/assets. Filter by media type, brand, and status. Download or archive." },
      { title: "Brands", slug: "brands", content: "Create brands in /app/brands. Add logo, slogan and colours. Autopilot and Studio use these for consistent captions." },
      { title: "Templates", slug: "templates", content: "Save reusable prompts in /app/templates. Apply to Studio for fast variants." },
      { title: "Characters", slug: "characters", content: "Define spokespeople or mascots in /app/characters. Use them in Studio and Autopilot." },
    ]
  },
  {
    id: "grow",
    title: "Grow & Distribute",
    icon: BarChart3,
    items: [
      { title: "Campaigns", slug: "campaigns", content: "Create campaigns in /app/campaigns. Add tracked links with ref codes to attribute sales." },
      { title: "Social publishing", slug: "social", content: "Connect Facebook and Instagram in /app/social. Schedule posts from Library assets." },
      { title: "Inbox & WhatsApp", slug: "inbox", content: "Replies arrive in /app/inbox. Auto-reply rules in /app/automations answer instantly from your catalogue." },
      { title: "Leads", slug: "leads", content: "Contacts from links and WhatsApp are saved in /app/leads. Export or sync." },
      { title: "Autopilot", slug: "autopilot", content: "Plan recurring posts in /app/autopilot. Approve before publishing." },
    ]
  },
  {
    id: "business",
    title: "Business Operations",
    icon: Settings,
    items: [
      { title: "Products & catalogue", slug: "products", content: "Manage products in /app/products. Used for WhatsApp auto-replies and orders." },
      { title: "Orders", slug: "orders", content: "Client orders and done-for-you jobs in /app/orders. Track status and download files." },
      { title: "Teams", slug: "teams", content: "Invite members, assign roles in /app/team. Permissions control access." },
    ]
  }
];

export function HelpClient() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return sections;
    const q = query.toLowerCase();
    return sections.map(s => ({
      ...s,
      items: s.items.filter(i => 
        i.title.toLowerCase().includes(q) || 
        i.content.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q)
      )
    })).filter(s => s.items.length > 0);
  }, [query]);

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="border-b border-line bg-wash/5 sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-3">
          <BookOpen className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Help & User Manual</h1>
          <div className="ml-auto relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input 
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search help..." 
              className="input pl-9 w-[280px]" 
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 grid lg:grid-cols-[260px_1fr] gap-8">
        <aside className="space-y-6">
          <nav className="card p-3">
            <ul className="space-y-1">
              {sections.map(s => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-raised">{s.title}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="card p-4">
            <p className="text-sm font-semibold mb-2">AI Help</p>
            <p className="text-xs text-muted mb-3">Ask the assistant about any feature. Uses the default system AI from admin.</p>
            <Link href="/app/assistant" className="btn-primary w-full text-sm">Open Assistant</Link>
            <p className="text-[10px] text-muted mt-2">Powered by platform default assistant config</p>
          </div>
        </aside>

        <section className="space-y-10">
          {filtered.length === 0 ? (
            <div className="card p-8 text-center text-muted">No results for “{query}”</div>
          ) : filtered.map(section => (
            <div key={section.id} id={section.id} className="scroll-mt-20">
              <h2 className="flex items-center gap-2 text-2xl font-bold mb-4">
                <section.icon className="h-6 w-6 text-primary" />
                {section.title}
              </h2>
              <div className="grid gap-4">
                {section.items.map(item => (
                  <details key={item.slug} className="group card p-4 open:shadow">
                    <summary className="cursor-pointer list-none flex items-center justify-between">
                      <span className="font-medium">{item.title}</span>
                      <span className="text-xs text-muted">Click to expand</span>
                    </summary>
                    <p className="mt-3 text-sm text-muted">{item.content}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
