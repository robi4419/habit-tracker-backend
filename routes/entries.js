import express from "express";
import { nanoid } from "nanoid";
import { db } from "../utils/db.js";
import AppError from "../utils/AppError.js";
import { validateDates } from "../utils/validators.js";

const router = express.Router();

router.get("/entries", async (req, res) => {
  const { date, today } = req.query;
  const user_id = req.user.id;

  validateDates(date, today);

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const dayOfWeek = new Date(date)
      .toLocaleDateString("en-US", { weekday: "short" })
      .slice(0, 2);

    // Fetch eligible habits
    const { rows: habits } = await client.query(
      `SELECT id, frequency, days_of_week FROM public."Habits"
       WHERE user_id = $1 AND created_at::date <= $2 AND is_active = True`,
      [user_id, date],
    );

    for (const habit of habits) {
      if (habit.frequency === "daily") {
        if (!habit.days_of_week?.includes(dayOfWeek)) continue;
      } else if (habit.frequency === "weekly") {
        const { rows } = await client.query(
          `SELECT 1 FROM public."HabitEntries"
           WHERE habit_id = $1
           AND date >= date_trunc('week', $2::date)
           AND date < date_trunc('week', $2::date) + interval '7 days'`,
          [habit.id, date],
        );
        if (rows.length > 0) continue;
      }

      await client.query(
        `INSERT INTO public."HabitEntries" (id, habit_id, date, completed, value, created_at)
         VALUES ($1, $2, $3, false, 0, $4)
         ON CONFLICT (habit_id, date) DO NOTHING`,
        [nanoid(), habit.id, date, today],
      );
    }

    await client.query("COMMIT");

    const { rows: dailyEntries } = await client.query(
      `SELECT * FROM public."HabitEntries" WHERE habit_id IN (
         SELECT id FROM public."Habits" WHERE user_id = $1 AND frequency = 'daily'
       ) AND date = $2 ORDER BY habit_id`,
      [user_id, date],
    );

    const { rows: weeklyEntries } = await client.query(
      `SELECT * FROM public."HabitEntries"
           WHERE habit_id IN (
         SELECT id FROM public."Habits" WHERE user_id = $1 AND frequency = 'weekly'
       )
           AND date >= date_trunc('week', $2::date)
           AND date < date_trunc('week', $2::date) + interval '7 days'`,
      [user_id, date],
    );

    res.json({ daily: dailyEntries, weekly: weeklyEntries });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.put("/entries/:id", async (req, res) => {
  const { id } = req.params;
  const { value, completed } = req.body;
  const user_id = req.user.id;

  await db.query(
    `UPDATE public."HabitEntries" SET value = $1, completed = $2 
     WHERE id = $3 AND habit_id IN (
       SELECT id FROM public."Habits" WHERE user_id = $4
     )`,
    [value, completed, id, user_id],
  );

  res.sendStatus(200);
});

export default router;
