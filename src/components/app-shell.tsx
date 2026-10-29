"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  FileText,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Truck,
  X,
} from "lucide-react";
import { Brand, Failure, Loading } from "./common";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useResource, refreshResources } from "@/hooks/use-resource";
import { send } from "@/lib/api";
import { safeReturn } from "@/lib/domain";
import type { User } from "@/lib/types";

export type AppConfig = {
  currency: "USD" | "BDT";
  timeZone: string;
  businessDate: string;
  demoMode: boolean;
};
const SessionContext = createContext<{ user: User; config: AppConfig } | null>(
  null,
);
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session context is missing");
  return value;
}
const navigation = [
  {
    href: "/dashboard/",
    label: "Dashboard",
    icon: LayoutDashboard,
    owner: true,
  },
  { href: "/equipment/", label: "Equipment", icon: Truck },
  {
    href: "/maintenance/",
    label: "Maintenance",
    icon: ClipboardList,
    owner: true,
  },
  { href: "/history/", label: "History", icon: Clock3, owner: true },
  { href: "/reports/", label: "Cost reports", icon: FileText, owner: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [exitError, setExitError] = useState<Error | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const session = useResource<{ user: User }>("/api/auth/session");
  const config = useResource<AppConfig>("/api/config");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const listener = (event: Event) =>
      setNotice((event as CustomEvent<string>).detail);
    window.addEventListener("vanlog:notice", listener);
    return () => window.removeEventListener("vanlog:notice", listener);
  }, []);
  useEffect(() => {
    if (session.error?.status === 401) {
      const next = safeReturn(
        window.location.pathname + window.location.search,
      );
      router.replace("/login/?next=" + encodeURIComponent(next));
    }
  }, [session.error, router]);
  useEffect(() => {
    if (
      session.data?.user.role === "staff" &&
      navigation.some((n) => n.owner && n.href === pathname)
    )
      router.replace("/equipment/");
  }, [session.data, pathname, router]);
  if (session.loading || config.loading || session.error?.status === 401)
    return <Loading />;
  if ((session.error && !session.data) || (config.error && !config.data))
    return (
      <main id="main" className="standalone-error">
        <Brand />
        <Failure
          error={session.error || config.error}
          retry={() => {
            session.reload();
            config.reload();
          }}
        />
      </main>
    );
  if (!session.data || !config.data) return null;
  const { user } = session.data;
  const links = (
    <nav aria-label="Workspace navigation">
      {navigation
        .filter((n) => !n.owner || user.role === "owner")
        .map((n) => (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setMenu(false)}
            className={
              pathname.startsWith(n.href) ? "nav-link active" : "nav-link"
            }
            aria-current={pathname.startsWith(n.href) ? "page" : undefined}
          >
            <n.icon aria-hidden="true" />
            {n.label}
          </Link>
        ))}
    </nav>
  );
  async function logout() {
    setSigningOut(true);
    setExitError(null);
    try {
      await send("/api/auth/session", "DELETE");
      router.replace("/");
    } catch (error) {
      setExitError(error as Error);
      setSigningOut(false);
    }
  }
  return (
    <SessionContext.Provider value={{ user, config: config.data }}>
      <div className="app-layout">
        <aside className="sidebar">
          <Brand />
          {links}
          <div className="sidebar-bottom">
            <a
              href="https://consolelog.studio/"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink aria-hidden="true" />A ConsoleLog Studio project
            </a>
            <div className="account">
              <span className="avatar">
                {user.displayName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <div>
                <strong>{user.displayName}</strong>
                <span>{user.role === "owner" ? "Owner" : "Staff"}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                disabled={signingOut}
                onClick={logout}
              >
                <LogOut />
              </Button>
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="workspace-header">
            <div className="mobile-brand">
              <Brand />
              <Sheet open={menu} onOpenChange={setMenu}>
                <SheetTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Open navigation"
                  >
                    <Menu />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left">
                  <SheetHeader>
                    <SheetTitle>VanLog navigation</SheetTitle>
                    <SheetDescription>
                      Your maintenance workspace
                    </SheetDescription>
                  </SheetHeader>
                  {links}
                  <Button variant="outline" onClick={logout}>
                    Sign out
                  </Button>
                </SheetContent>
              </Sheet>
            </div>
            <div className="breadcrumb">
              Workspace<span>/</span>
              <strong>
                {navigation.find((n) => pathname.startsWith(n.href))?.label ||
                  "Equipment details"}
              </strong>
            </div>
            <div className="header-actions">
              <span>
                {config.data.businessDate} · {config.data.timeZone}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Refresh workspace"
                onClick={refreshResources}
              >
                <RefreshCw />
              </Button>
              <span className="avatar small">{user.displayName[0]}</span>
            </div>
          </header>
          <main id="main" className="workspace-main">
            {config.data.demoMode && (
              <Alert variant="demo" className="demo-banner">
                <Info aria-hidden="true" />
                <AlertDescription>
                  <strong>Shared demo</strong> · Fictional data. Changes are
                  visible to everyone.
                </AlertDescription>
              </Alert>
            )}
            <Failure error={exitError} />
            <Failure error={session.error || config.error} />
            {notice && (
              <Alert role="status" className="success-banner">
                <CheckCircle2 aria-hidden="true" />
                <AlertDescription>{notice}</AlertDescription>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Dismiss notification"
                  onClick={() => setNotice("")}
                >
                  <X />
                </Button>
              </Alert>
            )}
            {children}
          </main>
        </div>
      </div>
    </SessionContext.Provider>
  );
}
