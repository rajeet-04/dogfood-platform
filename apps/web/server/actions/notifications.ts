"use server";

import { revalidatePath } from "next/cache";

import { markAllRead, markRead } from "@dogfood/notifications";

import type { FormState } from "../../lib/form-state";
import { requireActor } from "../session";
import { runAction } from "./common";

export async function markNotificationsReadAction(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const notificationId = formData.get("notificationId");
  return runAction(async () => {
    if (typeof notificationId === "string" && notificationId) {
      await markRead(actor, notificationId);
    } else {
      await markAllRead(actor);
    }
    revalidatePath("/", "layout");
  });
}
