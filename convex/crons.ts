import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Clear expired reset material regularly; rows are already unusable after
// their timestamps, this only keeps the tables small.
crons.hourly(
  "prune password reset material",
  { minuteUTC: 17 },
  internal.passwordReset.prune,
);

crons.hourly(
  "prune invite email ledger",
  { minuteUTC: 23 },
  internal.inviteEmails.prune,
);

crons.hourly(
  "prune workspace invitations",
  { minuteUTC: 29 },
  internal.workspaceInvites.prune,
);

export default crons;
