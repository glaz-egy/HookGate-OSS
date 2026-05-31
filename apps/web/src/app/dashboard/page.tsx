import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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
        <DashboardClient />
      </main>
    </div>
  );
}
