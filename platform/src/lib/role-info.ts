import type { Role } from "./rbac";

/** What each role is for, in plain words, for the team screens. */
export const ROLE_INFO: Record<Exclude<Role, "SUPER_ADMIN">, { summary: string }> = {
  OWNER: { summary: "Everything: billing, members, settings, channels and all content. Needs two-factor to manage people." },
  BRAND_MANAGER: { summary: "Runs brands, campaigns and orders; approves content; sees reports. Cannot manage members or billing." },
  APPROVER: { summary: "Reviews and approves content before it is posted." },
  DESIGNER: { summary: "Works on the tasks assigned to them. Sees only their own work." },
  MARKETER: { summary: "Creates content, schedules posts, runs campaigns and the inbox." },
  ANALYST: { summary: "Read-only access to campaigns, reports and orders." },
};

/** Groups the permission list for the picker, with a readable name each. */
export const PERMISSION_GROUPS: Array<{ title: string; items: Array<{ key: string; label: string }> }> = [
  { title: "Team and brands", items: [
    { key: "org:read", label: "See team settings" }, { key: "org:write", label: "Change team settings" },
    { key: "member:read", label: "See members" }, { key: "member:write", label: "Invite and manage members" },
    { key: "audit:read", label: "Read the audit log" },
    { key: "brand:read", label: "See brands" }, { key: "brand:write", label: "Edit brands" },
    { key: "catalogue:read", label: "See the catalogue" }, { key: "catalogue:write", label: "Edit the catalogue" },
  ] },
  { title: "Content", items: [
    { key: "content:read", label: "See content" }, { key: "content:write", label: "Write content" },
    { key: "task:write", label: "Create tasks" }, { key: "task:work", label: "Work on tasks" },
    { key: "content:approve", label: "Approve content" },
  ] },
  { title: "Social and campaigns", items: [
    { key: "channel:read", label: "See channels" }, { key: "channel:connect", label: "Connect channels" },
    { key: "post:read", label: "See posts" }, { key: "post:schedule", label: "Schedule posts" },
    { key: "campaign:read", label: "See campaigns" }, { key: "campaign:write", label: "Edit campaigns" },
    { key: "link:write", label: "Create tracked links" }, { key: "report:read", label: "See reports" },
  ] },
  { title: "AI Studio", items: [
    { key: "ai:generate", label: "Generate with the Studio" }, { key: "ai:usage", label: "See AI usage" },
    { key: "asset:read", label: "See the media library" }, { key: "asset:write", label: "Manage media" },
    { key: "template:read", label: "Use templates" },
    { key: "character:read", label: "See characters" }, { key: "character:write", label: "Create characters" },
  ] },
  { title: "Orders and money", items: [
    { key: "order:read", label: "See orders" }, { key: "order:write", label: "Produce orders" },
    { key: "token:buy", label: "Buy credits" },
  ] },
  { title: "Inbox and leads", items: [
    { key: "inbox:read", label: "Read the inbox" }, { key: "inbox:reply", label: "Reply in the inbox" },
    { key: "automation:write", label: "Edit automations" },
    { key: "lead:read", label: "See leads" }, { key: "lead:write", label: "Edit leads" },
  ] },
];
