import { describe, expect, it } from "vitest";

import { resetDb } from "../fixtures/db";
import { GET as getHealth } from "../../apps/web/app/api/health/route";
import { GET as getReady } from "../../apps/web/app/api/ready/route";

describe("operational endpoints", () => {
  it("reports liveness from /api/health", async () => {
    const response = await getHealth();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("reports readiness from /api/ready when the database and migrations are present", async () => {
    await resetDb();
    const response = await getReady();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: "ready",
      database: "ok",
      migrations: "applied",
    });
  });
});