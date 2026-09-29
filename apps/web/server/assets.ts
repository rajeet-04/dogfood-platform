import { readFile } from "node:fs/promises";

import { appendAuditEvent } from "@dogfood/audit";
import { and, db, eq, or, schema } from "@dogfood/db";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

import { deleteUpload, resolveUploadPath, saveProjectImage } from "../lib/uploads";

type Asset = typeof schema.assets.$inferSelect;

function invalidUpload(error: unknown): never {
  if (error instanceof Error) {
    const messages: Record<string, string> = {
      EMPTY_UPLOAD: "Choose an image with content.",
      UPLOAD_TOO_LARGE: "Images must be 5 MiB or smaller.",
      UPLOAD_TYPE_NOT_ALLOWED: "Choose a PNG or JPEG image.",
    };
    if (messages[error.message]) {
      throw new DogfoodError("VALIDATION_FAILED", messages[error.message], { file: messages[error.message] });
    }
  }
  throw error;
}

async function activeRole(actor: Actor, eventId: string) {
  const [membership] = await db
    .select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(and(
      eq(schema.eventMemberships.eventId, eventId),
      eq(schema.eventMemberships.userId, actor.userId),
      eq(schema.eventMemberships.isActive, true),
    ))
    .limit(1);
  return membership?.role;
}

export async function uploadProjectAsset(actor: Actor, eventId: string, file: File) {
  const [event] = await db.select({ id: schema.events.id }).from(schema.events)
    .where(eq(schema.events.id, eventId)).limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const role = await activeRole(actor, eventId);
  const organizer = role === "ORGANIZER" || actor.isPlatformAdmin;
  if (!organizer) {
    const [team] = await db.select({ userId: schema.teamMembers.userId })
      .from(schema.teamMembers)
      .where(and(eq(schema.teamMembers.eventId, eventId), eq(schema.teamMembers.userId, actor.userId)))
      .limit(1);
    if (role !== "PARTICIPANT" || !team) {
      throw new DogfoodError("FORBIDDEN", "Only an event organizer or team participant can upload project images");
    }
  }

  let stored;
  try {
    stored = await saveProjectImage(file, eventId);
  } catch (error) {
    invalidUpload(error);
  }

  try {
    return await db.transaction(async (tx) => {
      const [asset] = await tx.insert(schema.assets).values({
        eventId,
        uploadedBy: actor.userId,
        storageKey: stored.path,
        originalName: stored.name,
        mimeType: stored.contentType,
        byteSize: stored.size,
        sha256: stored.sha256,
      }).returning();
      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "asset.upload",
        resourceType: "asset",
        resourceId: asset.id,
        metadata: { mimeType: asset.mimeType, byteSize: asset.byteSize, sha256: asset.sha256 },
      });
      return asset;
    });
  } catch (error) {
    await deleteUpload(stored.path);
    throw error;
  }
}

async function linkedProject(assetId: string, eventId: string) {
  const rows = await db.select({
    teamId: schema.projects.teamId,
    state: schema.projects.state,
    eventState: schema.events.state,
  })
    .from(schema.projectRevisions)
    .leftJoin(schema.projectRevisionImages, eq(schema.projectRevisionImages.revisionId, schema.projectRevisions.id))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.projectRevisions.projectId))
    .innerJoin(schema.events, eq(schema.events.id, schema.projects.eventId))
    .where(and(
      or(
        eq(schema.projectRevisionImages.assetId, assetId),
        eq(schema.projectRevisions.thumbnailAssetId, assetId),
      ),
      eq(schema.projects.currentRevisionId, schema.projectRevisions.id),
      eq(schema.projects.eventId, eventId),
    ));
  return rows;
}

export async function readProjectAsset(assetId: string, actor: Actor | null): Promise<{ asset: Asset; bytes: Buffer }> {
  const [asset] = await db.select().from(schema.assets).where(eq(schema.assets.id, assetId)).limit(1);
  if (!asset) throw new DogfoodError("NOT_FOUND", "Image not found");

  const projects = await linkedProject(assetId, asset.eventId);
  const isPublic = projects.some((project) =>
    (project.state === "SUBMITTED" || project.state === "LOCKED") &&
    project.eventState !== "DRAFT" && project.eventState !== "ARCHIVED");

  let permitted = isPublic;
  if (actor && !permitted) {
    const role = await activeRole(actor, asset.eventId);
    if (actor.isPlatformAdmin || role === "ORGANIZER") {
      permitted = true;
    } else if (role === "PARTICIPANT") {
      const memberships = await db.select({ teamId: schema.teamMembers.teamId })
        .from(schema.teamMembers)
        .where(and(eq(schema.teamMembers.eventId, asset.eventId), eq(schema.teamMembers.userId, actor.userId)))
      permitted = memberships.some((membership) =>
        projects.length > 0
          ? projects.some((project) => project.teamId === membership.teamId)
          : actor.userId === asset.uploadedBy,
      );
    }
  }

  if (!permitted) throw new DogfoodError("NOT_FOUND", "Image not found");
  if (asset.mimeType !== "image/png" && asset.mimeType !== "image/jpeg") {
    throw new DogfoodError("NOT_FOUND", "Image not found");
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(resolveUploadPath(asset.storageKey));
  } catch {
    throw new DogfoodError("NOT_FOUND", "Image not found");
  }
  return { asset, bytes };
}
