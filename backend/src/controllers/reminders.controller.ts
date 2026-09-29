import { Request, Response } from "express";
import { runReminderSweep } from "../jobs/reminder.job";

export async function runNow(_req: Request, res: Response) {
  const result = await runReminderSweep();
  res.json(result);
}

export default { runNow };
