import express from "express";
import { db } from "../utils/db.js";
import AppError from "../utils/AppError.js";

const router = express.Router();

router.get("/exercises", async (req, res) => {
  const userId = req.user?.id || null;

  const result = await db.query(
    'SELECT * FROM public."ExerciseLibrary" WHERE is_public = true OR created_by = $1 ORDER BY name',
    [userId],
  );

  const exercises = result.rows.map((e) => {
    const eqList = e.equipment?.split(",").map((item) => item.trim()) || null;
    return { ...e, equipment: eqList };
  });

  res.json(exercises);
});

router.post("/exercises", async (req, res) => {
  const userId = req.user.id;
  const { name, muscle_group, equipmentArray, notes, is_public } = req.body;
  const equipment = equipmentArray.join(",");

  const result = await db.query(
    'Select 1 FROM public."ExerciseLibrary" WHERE name = $1',
    [name],
  );

  if (result.rows.length > 0) {
    throw new AppError("Exercise name is already taken", 403);
  }

  await db.query(
    'INSERT INTO public."ExerciseLibrary" (created_by, name, muscle_group, equipment, notes, is_public) VALUES ($1,$2,$3,$4,$5,$6)',
    [userId, name, muscle_group, equipment || null, notes || null, is_public],
  );

  console.log("Exercise added successfully.");
  res.sendStatus(201);
});

router.put("/exercises/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { name, muscle_group, equipmentArray, notes, is_public } = req.body;
  const equipment = equipmentArray.join(",");

  const result = await db.query(
    'Select 1 FROM public."ExerciseLibrary" WHERE name = $1',
    [name],
  );

  if (result.rows.length > 0) {
    throw new AppError("Exercise name is already taken", 403);
  }

  await db.query(
    'UPDATE public."ExerciseLibrary" SET name = $1, muscle_group = $2, equipment = $3, notes = $4, is_public = $5 WHERE id = $6 AND created_by = $7',
    [name, muscle_group, equipment, notes, is_public, id, userId],
  );

  console.log("Exercise updated successfully.");
  res.sendStatus(201);
});

router.delete("/exercises/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const result = await db.query(
    'DELETE from public."ExerciseLibrary" WHERE id = $1 AND created_by = $2 RETURNING *',
    [id, userId],
  );
  const deletedExercise = result.rows[0];

  console.log("Exercise deleted successfully.");
  res.json(deletedExercise);
});

export default router;
