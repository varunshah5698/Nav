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

export default crons;
