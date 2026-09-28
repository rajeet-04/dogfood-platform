import { describe, expect, it } from "vitest";

import {
  MAX_SAVED_ACCOUNTS,
  parseAccounts,
  removeAccount,
  serializeAccounts,
  upsertAccount,
  type SavedAccount,
} from "../../../apps/web/lib/accounts";

function account(email: string): SavedAccount {
  return { token: `token-${email}`, email, displayName: email };
}

describe("saved accounts cookie", () => {
  it("round-trips through serialize and parse", () => {
    const accounts = [account("a@example.com"), account("b@example.com")];
    expect(parseAccounts(serializeAccounts(accounts))).toEqual(accounts);
  });

  it("returns an empty list for missing or malformed cookies", () => {
    expect(parseAccounts(undefined)).toEqual([]);
    expect(parseAccounts("")).toEqual([]);
    expect(parseAccounts("not json")).toEqual([]);
    expect(parseAccounts('{"token":"x"}')).toEqual([]);
    expect(parseAccounts("[1,2,3]")).toEqual([]);
  });

  it("drops entries with missing fields", () => {
    const raw = JSON.stringify([
      { token: "t", email: "a@example.com", displayName: "A" },
      { token: "t2", email: "b@example.com" },
    ]);
    expect(parseAccounts(raw)).toEqual([
      { token: "t", email: "a@example.com", displayName: "A" },
    ]);
  });

  it("puts the newest account first and de-duplicates by token", () => {
    const first = account("a@example.com");
    const second = account("b@example.com");
    const withBoth = upsertAccount([first], second);
    expect(withBoth[0]).toEqual(second);
    expect(upsertAccount(withBoth, second)).toHaveLength(2);
  });

  it("caps the number of remembered accounts", () => {
    let accounts: SavedAccount[] = [];
    for (let i = 0; i < MAX_SAVED_ACCOUNTS + 3; i += 1) {
      accounts = upsertAccount(accounts, account(`user-${i}@example.com`));
    }
    expect(accounts).toHaveLength(MAX_SAVED_ACCOUNTS);
    expect(accounts[0]?.email).toBe(
      `user-${MAX_SAVED_ACCOUNTS + 2}@example.com`,
    );
  });

  it("removes only the requested account", () => {
    const accounts = [account("a@example.com"), account("b@example.com")];
    const remaining = removeAccount(accounts, accounts[0].token);
    expect(remaining).toEqual([accounts[1]]);
    expect(removeAccount(accounts, "unknown")).toEqual(accounts);
  });
});
