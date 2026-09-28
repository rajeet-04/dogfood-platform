export const MAX_SAVED_ACCOUNTS = 5;

export type SavedAccount = {
  token: string;
  email: string;
  displayName: string;
};

export function parseAccounts(raw: string | undefined): SavedAccount[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is SavedAccount =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as SavedAccount).token === "string" &&
          typeof (item as SavedAccount).email === "string" &&
          typeof (item as SavedAccount).displayName === "string",
      )
      .slice(0, MAX_SAVED_ACCOUNTS);
  } catch {
    return [];
  }
}

export function serializeAccounts(accounts: SavedAccount[]): string {
  return JSON.stringify(accounts.slice(0, MAX_SAVED_ACCOUNTS));
}

export function upsertAccount(
  accounts: SavedAccount[],
  account: SavedAccount,
): SavedAccount[] {
  const withoutSameToken = accounts.filter(
    (item) => item.token !== account.token,
  );
  return [account, ...withoutSameToken].slice(0, MAX_SAVED_ACCOUNTS);
}

export function removeAccount(
  accounts: SavedAccount[],
  token: string,
): SavedAccount[] {
  return accounts.filter((item) => item.token !== token);
}
