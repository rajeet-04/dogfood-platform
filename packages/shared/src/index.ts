// Domain-agnostic shared types.

export type EntityId = string;
export type IsoDateTime = string;
export type Cursor = string | null;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type Actor = {
  userId: string;
  isPlatformAdmin: boolean;
};