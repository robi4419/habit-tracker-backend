import express from "express";
import { db } from "../utils/db.js";
import AppError from "../utils/AppError.js";

const router = express.Router();

const TEMPLATE_QUERY = `
  SELECT t.id, t.name, t.description, t.created_at,
         te.id AS te_id, te.order_index, te.default_sets, te.default_weight, te.default_reps,
         e.exercise_id, e.created_by, e.name AS e_name, e.muscle_group, e.equipment,
         e.notes AS e_notes, e.is_public
  FROM public."WorkoutTemplates" t
  LEFT JOIN public."TemplateExercises" te ON te.template_id = t.id
  LEFT JOIN public."ExerciseLibrary" e ON te.exercise_id = e.exercise_id
`;

const buildTemplatesFromRows = (rows) => {
  const templatesMap = new Map();
  const exercisesMap = new Map();

  for (const row of rows) {
    if (!templatesMap.has(row.id)) {
      templatesMap.set(row.id, {
        id: row.id,
        name: row.name,
        description: row.description,
        created_at: row.created_at,
        exercises: [],
      });
    }

    if (row.te_id === null) continue;

    if (!exercisesMap.has(row.te_id)) {
      const exercise = {
        id: row.te_id,
        order_index: row.order_index,
        default_sets: row.default_sets,
        default_weight: row.default_weight,
        default_reps: row.default_reps,
        exercise_id: row.exercise_id,
        created_by: row.created_by,
        name: row.e_name,
        muscle_group: row.muscle_group,
        equipment: row.equipment?.split(",").map((i) => i.trim()) || null,
        notes: row.e_notes,
        is_public: row.is_public,
      };
      exercisesMap.set(row.te_id, exercise);
      templatesMap.get(row.id).exercises.push(exercise);
    }
  }

  return Array.from(templatesMap.values());
};

router.get("/templates", async (req, res) => {
  const userId = req.user.id;

  const result = await db.query(
    `${TEMPLATE_QUERY} WHERE t.user_id = $1 ORDER BY t.created_at DESC, te.order_index`,
    [userId],
  );

  res.json(buildTemplatesFromRows(result.rows));
});

router.post("/templates", async (req, res) => {
  const userId = req.user.id;
  const { name, description, exercises = [] } = req.body;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const templateResult = await client.query(
      `INSERT INTO public."WorkoutTemplates" (user_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, name, description || null],
    );
    const templateId = templateResult.rows[0].id;

    for (const ex of exercises) {
      await client.query(
        `INSERT INTO public."TemplateExercises" (id, template_id, exercise_id, order_index, default_sets, default_weight, default_reps)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [ex.id, templateId, ex.exercise_id, ex.order_index, ex.default_sets, ex.default_weight ?? null, ex.default_reps ?? null],
      );
    }

    const rows = await client.query(
      `${TEMPLATE_QUERY} WHERE t.id = $1 ORDER BY te.order_index`,
      [templateId],
    );

    await client.query("COMMIT");

    res.status(201).json(buildTemplatesFromRows(rows.rows)[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.put("/templates/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { name, description, exercises = [] } = req.body;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE public."WorkoutTemplates"
       SET name = $1, description = $2
       WHERE id = $3 AND user_id = $4`,
      [name, description || null, id, userId],
    );
    if (result.rowCount === 0) throw new AppError("Template not found", 404);

    // Delete exercises removed from payload
    const exerciseIds = exercises.map((e) => e.id);
    if (exerciseIds.length > 0) {
      await client.query(
        `DELETE FROM public."TemplateExercises" WHERE template_id = $1 AND id <> ALL($2::uuid[])`,
        [id, exerciseIds],
      );
    } else {
      await client.query(
        `DELETE FROM public."TemplateExercises" WHERE template_id = $1`,
        [id],
      );
    }

    for (const ex of exercises) {
      await client.query(
        `INSERT INTO public."TemplateExercises" (id, template_id, exercise_id, order_index, default_sets, default_weight, default_reps)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE
           SET exercise_id = $3, order_index = $4, default_sets = $5, default_weight = $6, default_reps = $7`,
        [ex.id, id, ex.exercise_id, ex.order_index, ex.default_sets, ex.default_weight ?? null, ex.default_reps ?? null],
      );
    }

    const rows = await client.query(
      `${TEMPLATE_QUERY} WHERE t.id = $1 ORDER BY te.order_index`,
      [id],
    );

    await client.query("COMMIT");

    res.json(buildTemplatesFromRows(rows.rows)[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.delete("/templates/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const result = await db.query(
    `DELETE FROM public."WorkoutTemplates" WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId],
  );
  if (result.rowCount === 0) throw new AppError("Template not found", 404);

  res.json({ id: result.rows[0].id });
});

export default router;
