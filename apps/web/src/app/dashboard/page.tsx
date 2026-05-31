import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type WebhookEndpoint = {
  id: string;
  name: string;
  service_type: "discord" | "slack";
  is_enabled: boolean;
  rate_limit_per_minute: number;
};

type WebhookLog = {
  id: string;
  request_id: string;
  status: string;
  service_type: string;
  created_at: string;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [organizations, endpoints, logs] = await Promise.all([
    supabase.from("organizations").select("id,name,slug").order("created_at", { ascending: true }).limit(5),
    supabase
      .from("webhook_endpoints")
      .select("id,name,service_type,is_enabled,rate_limit_per_minute")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("webhook_logs")
      .select("id,request_id,status,service_type,created_at")
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  const endpointRows = (endpoints.data || []) as WebhookEndpoint[];
  const logRows = (logs.data || []) as WebhookLog[];
  const orgRows = (organizations.data || []) as Organization[];
  const succeeded = logRows.filter((log) => log.status === "succeeded").length;
  const failed = logRows.filter((log) => log.status === "failed").length;
  const queued = logRows.filter((log) => log.status === "queued" || log.status === "retrying").length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">HG</span>
          <div>
            <strong>HookGate OSS</strong>
            <span>{user.email}</span>
          </div>
        </div>
        <nav className="nav">
          <Link className="active" href="/dashboard">
            Dashboard
          </Link>
          <Link href="/dashboard">
            Endpoints
          </Link>
          <Link href="/dashboard">
            Logs
          </Link>
          <form action={signOut}>
            <button type="submit">Sign out</button>
          </form>
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>Dashboard</h1>
            <p>Supabase Auth protected console for Discord and Slack webhook delivery.</p>
          </div>
          <Link className="button" href="/dashboard">
            New Endpoint
          </Link>
        </header>

        <section className="metrics" aria-label="Delivery metrics">
          <article>
            <span>Organizations</span>
            <strong>{orgRows.length}</strong>
          </article>
          <article>
            <span>Succeeded</span>
            <strong>{succeeded}</strong>
          </article>
          <article>
            <span>Failed</span>
            <strong>{failed}</strong>
          </article>
          <article>
            <span>Queued</span>
            <strong>{queued}</strong>
          </article>
        </section>

        <section className="workspace">
          <div className="panel">
            <div className="panel-header">
              <h2>Endpoints</h2>
              <span className="muted">{endpointRows.length} loaded</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {endpointRows.length ? (
                  endpointRows.map((endpoint) => (
                    <tr key={endpoint.id}>
                      <td>{endpoint.name}</td>
                      <td>{endpoint.service_type}</td>
                      <td>{endpoint.is_enabled ? "enabled" : "disabled"}</td>
                      <td>{endpoint.rate_limit_per_minute}/min</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>No endpoints visible for this Supabase user.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Recent Deliveries</h2>
              <span className="muted">{logRows.length} loaded</span>
            </div>
            {logRows.length ? (
              <ol className="empty-list">
                {logRows.map((log) => (
                  <li key={log.id}>
                    {log.status} {log.service_type} {log.request_id}
                  </li>
                ))}
              </ol>
            ) : (
              <ol className="empty-list">
                <li>No delivery logs visible for this Supabase user.</li>
              </ol>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
