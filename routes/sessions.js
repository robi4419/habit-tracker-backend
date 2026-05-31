import express from "express";
import { db } from "../utils/db.js";
import AppError from "../utils/AppError.js";

const router = express.Router();

const buildSessionsFromRows = (rows) => {
  const sessionsMap = new Map();
  const exercisesMap = new Map();

  for (const row of rows) {
    if (!sessionsMap.has(row.id)) {
      sessionsMap.set(row.id, {
        id: row.id,
        template_id: row.template_id,
        name: row.name,
        started_at: row.started_at,
        ended_at: row.ended_at,
        notes: row.notes,
        exercises: [],
      });
    }

    if (row.se_id === null) continue;

    if (!exercisesMap.has(row.se_id)) {
      const exercise = {
        id: row.se_id,
        order_index: row.order_index,
        exercise_id: row.exercise_id,
        created_by: row.created_by,
        name: row.e_name,
        muscle_group: row.muscle_group,
        equipment: row.equipment?.split(",").map((i) => i.trim()) || null,
        notes: row.e_notes,
        is_public: row.is_public,
        sets: [],
      };
      exercisesMap.set(row.se_id, exercise);
      sessionsMap.get(row.id).exercises.push(exercise);
    }

    if (row.es_id === null) continue;

    exercisesMap.get(row.se_id).sets.push({
      id: row.es_id,
      set_number: row.set_number,
      weight: row.weight,
      reps: row.reps,
      duration_secs: row.duration_secs,
      completed: row.completed,
    });
  }

  return Array.from(sessionsMap.values());
};

router.get("/sessions", async (req, res) => {
  const userId = req.user.id;
  const { from, to } = req.query;

  if (!from || !to) throw new AppError("from and to query params are required", 400);

  const result = await db.query(
    `SELECT ws.id, ws.template_id, ws.name, ws.started_at, ws.ended_at, ws.notes,
            se.id AS se_id, se.order_index,
            e.exercise_id, e.created_by, e.name AS e_name, e.muscle_group, e.equipment,
            e.notes AS e_notes, e.is_public,
            es.id AS es_id, es.set_number, es.weight, es.reps, es.duration_secs, es.completed
     FROM public."WorkoutSessions" ws
     LEFT JOIN public."SessionExercises" se ON se.session_id = ws.id
     LEFT JOIN public."ExerciseLibrary" e ON se.exercise_id = e.exercise_id
     LEFT JOIN public."ExerciseSets" es ON es.session_exercise_id = se.id
     WHERE ws.user_id = $1
       AND ws.started_at >= $2::date
       AND ws.started_at < ($3::date + interval '1 day')
     ORDER BY ws.started_at DESC, se.order_index, es.set_number`,
    [userId, from, to],
  );

  res.json(buildSessionsFromRows(result.rows));
});

router.get("/sessions/last-by-template/:templateId", async (req, res) => {
  const { templateId } = req.params;
  const userId = req.user.id;

  const sessionRow = await db.query(
    `SELECT id FROM public."WorkoutSessions"
     WHERE user_id = $1 AND template_id = $2 AND ended_at IS NOT NULL
     ORDER BY started_at DESC
     LIMIT 1`,
    [userId, templateId],
  );

  if (sessionRow.rows.length === 0) return res.json(null);

  const sessionId = sessionRow.rows[0].id;

  const result = await db.query(
    `SELECT ws.id, ws.template_id, ws.name, ws.started_at, ws.ended_at, ws.notes,
            se.id AS se_id, se.order_index,
            e.exercise_id, e.created_by, e.name AS e_name, e.muscle_group, e.equipment,
            e.notes AS e_notes, e.is_public,
            es.id AS es_id, es.set_number, es.weight, es.reps, es.duration_secs, es.completed
     FROM public."WorkoutSessions" ws
     LEFT JOIN public."SessionExercises" se ON se.session_id = ws.id
     LEFT JOIN public."ExerciseLibrary" e ON se.exercise_id = e.exercise_id
     LEFT JOIN public."ExerciseSets" es ON es.session_exercise_id = se.id
     WHERE ws.id = $1
     ORDER BY se.order_index, es.set_number`,
    [sessionId],
  );

  res.json(buildSessionsFromRows(result.rows)[0] ?? null);
});

router.post("/sessions", async (req, res) => {
  const userId = req.user.id;
  const { template_id, name, started_at, ended_at, notes, exercises = [] } = req.body;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const sessionResult = await client.query(
      `INSERT INTO public."WorkoutSessions" (user_id, template_id, name, started_at, ended_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [userId, template_id || null, name, started_at, ended_at || null, notes || null],
    );
    const sessionId = sessionResult.rows[0].id;

    for (const ex of exercises) {
      await client.query(
        `INSERT INTO public."SessionExercises" (id, session_id, exercise_id, order_index)
         VALUES ($1, $2, $3, $4)`,
        [ex.id, sessionId, ex.exercise_id, ex.order_index],
      );

      for (const set of ex.sets ?? []) {
        await client.query(
          `INSERT INTO public."ExerciseSets" (id, session_exercise_id, set_number, weight, reps, duration_secs, completed)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [set.id, ex.id, set.set_number, set.weight ?? null, set.reps ?? null, set.duration_secs ?? null, set.completed],
        );
      }
    }

    await client.query("COMMIT");

    res.status(201).json({
      id: sessionId,
      template_id: template_id || null,
      name,
      started_at,
      ended_at: ended_at || null,
      notes: notes || null,
      exercises,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.put("/sessions/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { template_id, name, started_at, ended_at, notes, exercises = [] } = req.body;

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE public."WorkoutSessions"
       SET template_id = $1, name = $2, started_at = $3, ended_at = $4, notes = $5
       WHERE id = $6 AND user_id = $7`,
      [template_id || null, name, started_at, ended_at || null, notes || null, id, userId],
    );
    if (result.rowCount === 0) throw new AppError("Session not found", 404);

    // Delete exercises removed from payload (DB cascades to their sets)
    const exerciseIds = exercises.map((e) => e.id);
    if (exerciseIds.length > 0) {
      await client.query(
        `DELETE FROM public."SessionExercises" WHERE session_id = $1 AND id <> ALL($2::uuid[])`,
        [id, exerciseIds],
      );
    } else {
      await client.query(
        `DELETE FROM public."SessionExercises" WHERE session_id = $1`,
        [id],
      );
    }

    for (const ex of exercises) {
      await client.query(
        `INSERT INTO public."SessionExercises" (id, session_id, exercise_id, order_index)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET exercise_id = $3, order_index = $4`,
        [ex.id, id, ex.exercise_id, ex.order_index],
      );

      // Delete sets removed from payload for this exercise
      const setIds = (ex.sets ?? []).map((s) => s.id);
      if (setIds.length > 0) {
        await client.query(
          `DELETE FROM public."ExerciseSets" WHERE session_exercise_id = $1 AND id <> ALL($2::uuid[])`,
          [ex.id, setIds],
        );
      } else {
        await client.query(
          `DELETE FROM public."ExerciseSets" WHERE session_exercise_id = $1`,
          [ex.id],
        );
      }

      for (const set of ex.sets ?? []) {
        await client.query(
          `INSERT INTO public."ExerciseSets" (id, session_exercise_id, set_number, weight, reps, duration_secs, completed)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE
             SET set_number = $3, weight = $4, reps = $5, duration_secs = $6, completed = $7`,
          [set.id, ex.id, set.set_number, set.weight ?? null, set.reps ?? null, set.duration_secs ?? null, set.completed],
        );
      }
    }

    await client.query("COMMIT");
    res.sendStatus(204);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.delete("/sessions/:id", async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  const result = await db.query(
    `DELETE FROM public."WorkoutSessions" WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if (result.rowCount === 0) throw new AppError("Session not found", 404);

  res.sendStatus(204);
});

export default router;
