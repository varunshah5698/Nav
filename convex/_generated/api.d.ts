/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as inviteEmails from "../inviteEmails.js";
import type * as passwordPolicy from "../passwordPolicy.js";
import type * as passwordReset from "../passwordReset.js";
import type * as snapshots from "../snapshots.js";
import type * as users from "../users.js";
import type * as workspaceInvites from "../workspaceInvites.js";
import type * as workspaceSync from "../workspaceSync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  attachments: typeof attachments;
  auth: typeof auth;
  crons: typeof crons;
  http: typeof http;
  inviteEmails: typeof inviteEmails;
  passwordPolicy: typeof passwordPolicy;
  passwordReset: typeof passwordReset;
  snapshots: typeof snapshots;
  users: typeof users;
  workspaceInvites: typeof workspaceInvites;
  workspaceSync: typeof workspaceSync;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
