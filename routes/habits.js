import express from "express";
import { nanoid } from "nanoid";
import { db } from "../utils/db.js";
import AppError from "../utils/AppError.js";
import { validateHabit } from "../utils/validators.js";

const router = express.Router();

router.get("/habits", async (req, res) => {
  const user_id = req.user.id;

  const query =
    'SELECT id, title, description, type, target, unit, frequency, days_of_week, is_active FROM public."Habits" WHERE user_id = $1';
  const result = await db.query(query, [user_id]);
  const habits = result.rows;

  res.json(habits);
});

router.get("/habits/:id", async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  if (!id) throw new AppError("Id cannot be null", 400);

  const query =
    'SELECT id, title, description, type, target, unit, frequency, days_of_week, is_active FROM public."Habits" WHERE id = $1 AND user_id = $2';
  const values = [id, user_id];
  const result = await db.query(query, values);
  const habit = result.rows[0];

  if (!habit) throw new AppError("Habit not found", 404);

  res.json(habit);
});

router.post("/habits", async (req, res) => {
  const habitData = req.body;
  const user_id = req.user.id;

  const { rows } = await db.query(
    `SELECT COUNT(*) as count FROM public."Habits" WHERE user_id = $1`,
    [user_id],
  );

  if (parseInt(rows[0].count) >= 40) {
    throw new AppError(
      "Habit limit reached. Delete some habits to add more.",
      403,
    );
  }

  validateHabit(habitData);

  const query =
    'INSERT INTO public."Habits" (id, title, description, type, target, unit, frequency, days_of_week, user_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)';
  const values = [
    nanoid(),
    habitData.title,
    habitData.description || null,
    habitData.type,
    habitData.target || null,
    habitData.unit || null,
    habitData.frequency,
    habitData.days_of_week || null,
    user_id,
    habitData.created_at,
  ];

  await db.query(query, values);

  console.log("New habit added successfully");
  res.sendStatus(201);
});

router.put("/habits/:id/toggle-active", async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  const result = await db.query(
    'UPDATE public."Habits" SET is_active = NOT is_active WHERE id = $1 AND user_id = $2 RETURNING title, is_active',
    [id, user_id],
  );
  const updatedHabit = result.rows[0];

  res.json(updatedHabit);
});

router.put("/habits/:id", async (req, res) => {
  const { id } = req.params;
  const habitData = req.body;
  const user_id = req.user.id;

  validateHabit(habitData, true);

  const query =
    'UPDATE public."Habits" SET title = $2, description = $3, target = $4, unit = $5, days_of_week = $6 WHERE id = $1 AND user_id = $7';
  const values = [
    id,
    habitData.title,
    habitData.description || null,
    habitData.target || null,
    habitData.unit || null,
    habitData.days_of_week || null,
    user_id,
  ];

  const result = await db.query(query, values);
  if (result.rowCount === 0) throw new AppError("Habit not found", 404);

  console.log("Habit updated successfully");
  res.json({ id, ...habitData });
});

router.delete("/habits/:id", async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.id;

  const result = await db.query(
    'DELETE FROM public."Habits" WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, user_id],
  );
  const deletedHabit = result.rows[0];

  console.log("Habit deleted successfully");
  res.json(deletedHabit);
});

export default router;
