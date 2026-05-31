"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { apiFetch } from "@/lib/api/client";

type Organization = {
  id: string;
  name: string;
  slug: string;
  is_enabled: boolean;
  role: string;
};

type Project = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  is_enabled: boolean;
};

type Endpoint = {
  id: string;
  organization_id: string;
  project_id: string;
  name: string;
  service_type: "discord" | "slack";
  is_enabled: boolean;
  timeout_seconds: number;
  retry_enabled: boolean;
  allow_query_api_key: boolean;
  rate_limit_per_minute: number;
};

type ApiKey = {
  id: string;
  endpoint_id: string;
  is_active: boolean;
  last_used_at: string | null;
  last_used_ip: string | null;
  use_count: number;
  created_at: string;
  revoked_at: string | null;
  plaintext?: string;
};

type WebhookLog = {
  id: string;
  request_id: string;
  organization_id: string;
  project_id: string;
  endpoint_id: string;
  status: string;
  service_type: string;
  http_status: number | null;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  duration_ms: number | null;
};

type DashboardData = {
  organizations: Organization[];
  projects: Project[];
  endpoints: Endpoint[];
  apiKeys: Record<string, ApiKey[]>;
  logs: WebhookLog[];
};

const emptyData: DashboardData = {
  organizations: [],
  projects: [],
  endpoints: [],
  apiKeys: {},
  logs: []
};

export function DashboardClient() {
  const [data, setData] = useState<DashboardData>(emptyData);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [plainApiKey, setPlainApiKey] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectedOrg = data.organizations.find((organization) => organization.id === selectedOrgId);
  const selectedProject = data.projects.find((project) => project.id === selectedProjectId);

  const metrics = useMemo(() => {
    return {
      organizations: data.organizations.length,
      succeeded: data.logs.filter((log) => log.status === "succeeded").length,
      failed: data.logs.filter((log) => log.status === "failed").length,
      queued: data.logs.filter((log) => ["queued", "retrying"].includes(log.status)).length
    };
  }, [data.logs, data.organizations.length]);

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh(nextOrgId = selectedOrgId, nextProjectId = selectedProjectId) {
    setError("");
    const organizationsResult = await apiFetch<{ organizations: Organization[] }>("/api/v1/management/organizations");
    const organizations = organizationsResult.organizations;
    const organizationId = nextOrgId || organizations[0]?.id || "";

    let projects: Project[] = [];
    let projectId = nextProjectId;
    let endpoints: Endpoint[] = [];
    let logs: WebhookLog[] = [];
    const apiKeys: Record<string, ApiKey[]> = {};

    if (organizationId) {
      const [projectsResult, logsResult] = await Promise.all([
        apiFetch<{ projects: Project[] }>(`/api/v1/management/projects?organization_id=${organizationId}`),
        apiFetch<{ logs: WebhookLog[] }>(`/api/v1/management/logs?organization_id=${organizationId}`)
      ]);
      projects = projectsResult.projects;
      logs = logsResult.logs;
      projectId = projects.some((project) => project.id === projectId) ? projectId : projects[0]?.id || "";

      const endpointsResult = await apiFetch<{ endpoints: Endpoint[] }>(
        `/api/v1/management/endpoints?organization_id=${organizationId}`
      );
      endpoints = endpointsResult.endpoints;
      await Promise.all(
        endpoints.map(async (endpoint) => {
          const keysResult = await apiFetch<{ api_keys: ApiKey[] }>(`/api/v1/management/endpoints/${endpoint.id}/api-keys`);
          apiKeys[endpoint.id] = keysResult.api_keys;
        })
      );
    }

    setSelectedOrgId(organizationId);
    setSelectedProjectId(projectId);
    setData({ organizations, projects, endpoints, apiKeys, logs });
  }

  function run(action: () => Promise<void>, successMessage?: string) {
    setMessage("");
    setError("");
    startTransition(() => {
      action()
        .then(() => {
          if (successMessage) {
            setMessage(successMessage);
          }
        })
        .catch((caught) => {
          setError(caught instanceof Error ? caught.message : "Operation failed.");
        });
    });
  }

  function createOrganization(formData: FormData) {
    run(async () => {
      const result = await apiFetch<{ organization: Organization }>("/api/v1/management/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: formData.get("name")
        })
      });
      await refresh(result.organization.id, "");
    }, "Organization created.");
  }

  function updateOrganization(formData: FormData) {
    if (!selectedOrgId) return;
    run(async () => {
      await apiFetch(`/api/v1/management/organizations/${selectedOrgId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: formData.get("name"),
          is_enabled: formData.get("is_enabled") === "on"
        })
      });
      await refresh(selectedOrgId, selectedProjectId);
    }, "Organization updated.");
  }

  function deleteOrganization() {
    if (!selectedOrgId || !confirm("Delete this organization and all related projects/endpoints?")) return;
    run(async () => {
      await apiFetch(`/api/v1/management/organizations/${selectedOrgId}`, { method: "DELETE" });
      await refresh("", "");
    }, "Organization deleted.");
  }

  function createProject(formData: FormData) {
    if (!selectedOrgId) return;
    run(async () => {
      const result = await apiFetch<{ project: Project }>("/api/v1/management/projects", {
        method: "POST",
        body: JSON.stringify({
          organization_id: selectedOrgId,
          name: formData.get("name")
        })
      });
      await refresh(selectedOrgId, result.project.id);
    }, "Project created.");
  }

  function updateProject(project: Project, formData: FormData) {
    run(async () => {
      await apiFetch(`/api/v1/management/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: formData.get("name"),
          is_enabled: formData.get("is_enabled") === "on"
        })
      });
      await refresh(selectedOrgId, project.id);
    }, "Project updated.");
  }

  function deleteProject(project: Project) {
    if (!confirm(`Delete project "${project.name}"?`)) return;
    run(async () => {
      await apiFetch(`/api/v1/management/projects/${project.id}`, { method: "DELETE" });
      await refresh(selectedOrgId, "");
    }, "Project deleted.");
  }

  function createEndpoint(formData: FormData) {
    if (!selectedProjectId) return;
    run(async () => {
      await apiFetch<{ endpoint: Endpoint }>("/api/v1/management/endpoints", {
        method: "POST",
        body: JSON.stringify({
          project_id: selectedProjectId,
          name: formData.get("name"),
          service_type: formData.get("service_type"),
          webhook_url: formData.get("webhook_url"),
          is_enabled: formData.get("is_enabled") === "on",
          retry_enabled: formData.get("retry_enabled") === "on",
          allow_query_api_key: formData.get("allow_query_api_key") === "on",
          timeout_seconds: Number(formData.get("timeout_seconds")),
          rate_limit_per_minute: Number(formData.get("rate_limit_per_minute"))
        })
      });
      await refresh(selectedOrgId, selectedProjectId);
    }, "Endpoint created.");
  }

  function updateEndpoint(endpoint: Endpoint, formData: FormData) {
    const webhookUrl = String(formData.get("webhook_url") || "").trim();
    run(async () => {
      await apiFetch(`/api/v1/management/endpoints/${endpoint.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: formData.get("name"),
          webhook_url: webhookUrl || undefined,
          is_enabled: formData.get("is_enabled") === "on",
          retry_enabled: formData.get("retry_enabled") === "on",
          allow_query_api_key: formData.get("allow_query_api_key") === "on",
          timeout_seconds: Number(formData.get("timeout_seconds")),
          rate_limit_per_minute: Number(formData.get("rate_limit_per_minute"))
        })
      });
      await refresh(selectedOrgId, selectedProjectId);
    }, "Endpoint updated.");
  }

  function deleteEndpoint(endpoint: Endpoint) {
    if (!confirm(`Delete endpoint "${endpoint.name}"?`)) return;
    run(async () => {
      await apiFetch(`/api/v1/management/endpoints/${endpoint.id}`, { method: "DELETE" });
      await refresh(selectedOrgId, selectedProjectId);
    }, "Endpoint deleted.");
  }

  function createApiKey(endpoint: Endpoint) {
    run(async () => {
      const result = await apiFetch<{ api_key: ApiKey }>(`/api/v1/management/endpoints/${endpoint.id}/api-key`, {
        method: "POST",
        body: JSON.stringify({})
      });
      setPlainApiKey(result.api_key.plaintext || "");
      await refresh(selectedOrgId, selectedProjectId);
    }, "API key created. Copy it now; it will not be shown again.");
  }

  function revokeApiKey(apiKey: ApiKey) {
    run(async () => {
      await apiFetch(`/api/v1/management/api-keys/${apiKey.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false })
      });
      await refresh(selectedOrgId, selectedProjectId);
    }, "API key revoked.");
  }

  function deleteApiKey(apiKey: ApiKey) {
    if (!confirm("Delete this API key record?")) return;
    run(async () => {
      await apiFetch(`/api/v1/management/api-keys/${apiKey.id}`, { method: "DELETE" });
      await refresh(selectedOrgId, selectedProjectId);
    }, "API key deleted.");
  }

  function resendLog(log: WebhookLog) {
    run(async () => {
      const result = await apiFetch<{ request_id: string }>(`/api/v1/management/logs/${log.request_id}/resend`, {
        method: "POST",
        body: JSON.stringify({})
      });
      await refresh(selectedOrgId, selectedProjectId);
      setMessage(`Resend queued as ${result.request_id}.`);
    });
  }

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Dashboard</h1>
          <p>Manage organizations, projects, endpoints, API keys, delivery logs, and resends.</p>
        </div>
        <button className="secondary" type="button" onClick={() => run(() => refresh(), "Reloaded.")} disabled={isPending}>
          Refresh
        </button>
      </header>

      {message ? <p className="status">{message}</p> : null}
      {error ? <p className="status error">{error}</p> : null}
      {plainApiKey ? (
        <div className="status secret-box">
          <strong>New API key, shown once:</strong>
          <code>{plainApiKey}</code>
          <button type="button" className="secondary" onClick={() => setPlainApiKey("")}>
            Hide
          </button>
        </div>
      ) : null}

      <section className="metrics" aria-label="Delivery metrics">
        <article>
          <span>Organizations</span>
          <strong>{metrics.organizations}</strong>
        </article>
        <article>
          <span>Succeeded</span>
          <strong>{metrics.succeeded}</strong>
        </article>
        <article>
          <span>Failed</span>
          <strong>{metrics.failed}</strong>
        </article>
        <article>
          <span>Queued</span>
          <strong>{metrics.queued}</strong>
        </article>
      </section>

      <section className="management-grid">
        <div className="panel">
          <div className="panel-header">
            <h2>Organizations</h2>
            <span className="muted">{data.organizations.length} loaded</span>
          </div>
          <div className="panel-body">
            <form className="compact-form" action={createOrganization}>
              <input name="name" placeholder="Organization name" required />
              <button type="submit" disabled={isPending}>Add</button>
            </form>

            <label className="field">
              <span>Selected organization</span>
              <select value={selectedOrgId} onChange={(event) => void refresh(event.target.value, "")}>
                <option value="">No organization</option>
                {data.organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name} ({organization.role})
                  </option>
                ))}
              </select>
            </label>

            {selectedOrg ? (
              <form className="edit-form" action={updateOrganization}>
                <input name="name" defaultValue={selectedOrg.name} required />
                <p className="muted">Slug: {selectedOrg.slug}</p>
                <label className="check-row">
                  <input type="checkbox" name="is_enabled" defaultChecked={selectedOrg.is_enabled} />
                  Enabled
                </label>
                <div className="button-row">
                  <button type="submit" disabled={isPending}>Save</button>
                  <button type="button" className="danger" onClick={deleteOrganization} disabled={isPending}>
                    Delete
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Projects</h2>
            <span className="muted">{data.projects.length} loaded</span>
          </div>
          <div className="panel-body">
            <form className="compact-form" action={createProject}>
              <input name="name" placeholder="Project name" required disabled={!selectedOrgId} />
              <button type="submit" disabled={isPending || !selectedOrgId}>Add</button>
            </form>
            <label className="field">
              <span>Selected project</span>
              <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                <option value="">No project</option>
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="stack">
              {data.projects.map((project) => (
                <form key={project.id} className="edit-form" action={(formData) => updateProject(project, formData)}>
                  <input name="name" defaultValue={project.name} required />
                  <p className="muted">Slug: {project.slug}</p>
                  <label className="check-row">
                    <input type="checkbox" name="is_enabled" defaultChecked={project.is_enabled} />
                    Enabled
                  </label>
                  <div className="button-row">
                    <button type="submit" disabled={isPending}>Save</button>
                    <button type="button" className="danger" onClick={() => deleteProject(project)} disabled={isPending}>
                      Delete
                    </button>
                  </div>
                </form>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel section-panel">
        <div className="panel-header">
          <h2>Endpoints</h2>
          <span className="muted">{data.endpoints.length} loaded</span>
        </div>
        <div className="panel-body">
          <form className="endpoint-form" action={createEndpoint}>
            <input name="name" placeholder="Endpoint name" required disabled={!selectedProjectId} />
            <select name="service_type" defaultValue="discord" disabled={!selectedProjectId}>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
            </select>
            <input name="webhook_url" placeholder="Webhook URL" required disabled={!selectedProjectId} />
            <input name="timeout_seconds" type="number" min="1" max="30" defaultValue="10" disabled={!selectedProjectId} />
            <input name="rate_limit_per_minute" type="number" min="1" defaultValue="60" disabled={!selectedProjectId} />
            <label className="check-row">
              <input type="checkbox" name="is_enabled" defaultChecked disabled={!selectedProjectId} />
              Enabled
            </label>
            <label className="check-row">
              <input type="checkbox" name="retry_enabled" defaultChecked disabled={!selectedProjectId} />
              Retry
            </label>
            <label className="check-row">
              <input type="checkbox" name="allow_query_api_key" disabled={!selectedProjectId} />
              Query API key
            </label>
            <button type="submit" disabled={isPending || !selectedProjectId}>Add endpoint</button>
          </form>

          <div className="endpoint-list">
            {data.endpoints.map((endpoint) => (
              <article key={endpoint.id} className="endpoint-card">
                <form className="endpoint-edit" action={(formData) => updateEndpoint(endpoint, formData)}>
                  <input name="name" defaultValue={endpoint.name} required />
                  <strong>{endpoint.service_type}</strong>
                  <input name="webhook_url" placeholder="New webhook URL, optional" />
                  <input name="timeout_seconds" type="number" min="1" max="30" defaultValue={endpoint.timeout_seconds} />
                  <input name="rate_limit_per_minute" type="number" min="1" defaultValue={endpoint.rate_limit_per_minute} />
                  <label className="check-row">
                    <input type="checkbox" name="is_enabled" defaultChecked={endpoint.is_enabled} />
                    Enabled
                  </label>
                  <label className="check-row">
                    <input type="checkbox" name="retry_enabled" defaultChecked={endpoint.retry_enabled} />
                    Retry
                  </label>
                  <label className="check-row">
                    <input type="checkbox" name="allow_query_api_key" defaultChecked={endpoint.allow_query_api_key} />
                    Query API key
                  </label>
                  <div className="button-row">
                    <button type="submit" disabled={isPending}>Save</button>
                    <button type="button" className="secondary" onClick={() => createApiKey(endpoint)} disabled={isPending}>
                      New API key
                    </button>
                    <button type="button" className="danger" onClick={() => deleteEndpoint(endpoint)} disabled={isPending}>
                      Delete
                    </button>
                  </div>
                </form>
                <div className="key-list">
                  {(data.apiKeys[endpoint.id] || []).map((apiKey) => (
                    <div key={apiKey.id} className="key-row">
                      <span>{apiKey.is_active ? "active" : "revoked"}</span>
                      <span>{apiKey.use_count} uses</span>
                      <span>{apiKey.last_used_at ? new Date(apiKey.last_used_at).toLocaleString() : "never used"}</span>
                      <button type="button" className="secondary" onClick={() => revokeApiKey(apiKey)} disabled={isPending || !apiKey.is_active}>
                        Revoke
                      </button>
                      <button type="button" className="danger" onClick={() => deleteApiKey(apiKey)} disabled={isPending}>
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel section-panel">
        <div className="panel-header">
          <h2>Delivery Logs</h2>
          <span className="muted">{data.logs.length} loaded</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Request</th>
              <th>Status</th>
              <th>Service</th>
              <th>HTTP</th>
              <th>Error</th>
              <th>Created</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.logs.length ? (
              data.logs.map((log) => (
                <tr key={log.id}>
                  <td><code>{log.request_id}</code></td>
                  <td>{log.status}</td>
                  <td>{log.service_type}</td>
                  <td>{log.http_status || "-"}</td>
                  <td>{log.error_message || "-"}</td>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td>
                    <button type="button" className="secondary" onClick={() => resendLog(log)} disabled={isPending}>
                      Resend
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>No logs visible for this organization.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
