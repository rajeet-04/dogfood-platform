import Link from "next/link";
import { cookies } from "next/headers";
import { LogIn, UserRound } from "lucide-react";

import { resolveSessionAccount } from "@dogfood/auth";

import { getActor, getSavedAccounts } from "../server/session";
import { getNotificationInbox } from "../server/read-models/notifications";
import { logoutAction } from "../server/actions/auth";
import { SESSION_COOKIE } from "../lib/session-cookie";
import { AccountSwitcher } from "./account-menu";
import { MobileNav } from "./mobile-nav";
import { NavLinks, type NavItem } from "./nav-links";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./ui/theme";
import { ButtonLink, SubmitButton } from "./ui/button";

const PUBLIC_NAV: NavItem[] = [
  { href: "/events", label: "Events" },
  { href: "/projects", label: "Projects" },
];
// "Profile" lives in the right-hand cluster rather than the primary nav, so it
// is only repeated in the small-screen drawer.
const MEMBER_DRAWER_NAV: NavItem[] = [
  { href: "/events", label: "Events" },
  { href: "/projects", label: "Projects" },
  { href: "/profile", label: "Profile" },
];

function Wordmark() {
  return (
    <Link
      href="/"
      className="group flex shrink-0 items-center gap-2 rounded-md"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        className="size-7 shrink-0 rounded-sm shadow-xs"
      >
        <rect width="32" height="32" fill="#FF3D6E" />
        <path
          fill="#0B1020"
          fillRule="evenodd"
          d="M6.5 4.5h9.8c5.9 0 9.7 4.7 9.7 11.5s-3.8 11.5-9.7 11.5H6.5zM14 11v10h2c2.5 0 4-1.9 4-5s-1.5-5-4-5z"
        />
      </svg>
      <span className="font-display text-subheading font-semibold tracking-tight text-fg">
        DOGFOOD
      </span>
      <span
        aria-hidden="true"
        className="tabular hidden text-micro text-fg-faint sm:inline"
      >
        /ledger
      </span>
    </Link>
  );
}

export async function Header() {
  const actor = await getActor();
  const accounts = await getSavedAccounts();
  const inbox = await getNotificationInbox();
  const currentToken = (await cookies()).get(SESSION_COOKIE)?.value;

  const switchable: Array<{
    token: string;
    email: string;
    displayName: string;
    isCurrent: boolean;
  }> = [];
  for (const account of accounts) {
    const resolved = await resolveSessionAccount(account.token);
    if (resolved) {
      switchable.push({
        token: resolved.token,
        email: resolved.email,
        displayName: resolved.displayName,
        isCurrent: resolved.token === currentToken,
      });
    }
  }

  const drawerExtras: NavItem[] = actor
    ? [{ href: "/events/new", label: "New event" }]
    : [
        { href: "/login", label: "Log in" },
        { href: "/register", label: "Register" },
      ];

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <MobileNav
          items={actor ? MEMBER_DRAWER_NAV : PUBLIC_NAV}
          extraLinks={drawerExtras}
        />

        <Wordmark />

        <NavLinks items={PUBLIC_NAV} className="ml-2 hidden lg:flex" />

        <div className="ml-auto flex items-center gap-1.5">
          {actor ? (
            <>
              <NotificationBell
                items={inbox.items}
                unreadCount={inbox.unreadCount}
              />
              {switchable.length > 1 ? (
                <AccountSwitcher accounts={switchable} />
              ) : null}
              <ThemeToggle className="hidden sm:inline-flex" />
              <Link
                href="/profile"
                aria-label="Profile"
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-small font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
              >
                <UserRound aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">Profile</span>
              </Link>
              <form action={logoutAction}>
                <SubmitButton variant="secondary" size="md">
                  Sign out
                </SubmitButton>
              </form>
            </>
          ) : (
            <>
              <ThemeToggle className="mr-1 hidden sm:inline-flex" />
              <ButtonLink href="/login" variant="ghost" size="md" aria-label="Log in">
                <LogIn aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">Log in</span>
              </ButtonLink>
              <ButtonLink href="/register" variant="primary" size="md">
                Register
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
