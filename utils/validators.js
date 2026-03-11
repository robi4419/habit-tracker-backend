import AppError from "./AppError.js";

export const isEmpty = (value) => value == null || value.trim() === "";

export const validateHabit = (habitData, isUpdate = false) => {
  if (isEmpty(habitData.title))
    throw new AppError("Title cannot be empty", 400);
  if (!["binary", "count"].includes(habitData.type) && !isUpdate)
    throw new AppError("Invalid habit progress type", 400);
  if (
    habitData.type == "count" &&
    (isEmpty(habitData.target) || Number(habitData.target) <= 0)
  )
    throw new AppError("Target number needs to be greater than 0", 400);
  if (!["daily", "weekly"].includes(habitData.frequency) && !isUpdate)
    throw new AppError("Invalid habit frequency type", 400);
  if (
    (!habitData.created_at ||
      !/^\d{4}-\d{2}-\d{2}$/.test(habitData.created_at)) &&
    !isUpdate
  )
    throw new AppError("Invalid created_at date", 400);
  if (habitData.title.length > 100)
    throw new AppError("Habit title is too long (max 100 characters)", 400);
};

export const validateEmail = (email) => {
  if (isEmpty(email)) throw new AppError("Email cannot be empty", 400);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) throw new AppError("Invalid email format", 400);
};

export const validatePassword = (password) => {
  if (isEmpty(password)) throw new AppError("Password cannot be empty", 400);
  if (password.length < 8)
    throw new AppError("Password must be at least 8 characters", 400);
  if (password.length > 128) throw new AppError("Password is too long", 400);
  if (!/[A-Z]/.test(password))
    throw new AppError(
      "Password must contain at least one uppercase letter",
      400,
    );
  if (!/[a-z]/.test(password))
    throw new AppError(
      "Password must contain at least one lowercase letter",
      400,
    );
  if (!/[0-9]/.test(password))
    throw new AppError("Password must contain at least one number", 400);
  if (!/[^A-Za-z0-9]/.test(password))
    throw new AppError("Password must contain at least one symbol", 400);
  if (/\s/.test(password))
    throw new AppError("Password cannot contain spaces", 400);
};

export const validateDates = (date, today) => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError("Invalid or missing date", 400);
  }

  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today))
    throw new AppError("Invalid or missing today date", 400);

  const serverUTCDate = new Date().toISOString().split("T")[0];
  const dayDiff =
    (new Date(today) - new Date(serverUTCDate)) / (1000 * 60 * 60 * 24);
  if (dayDiff > 1) throw new AppError("Invalid today date", 400);

  if (date > today)
    throw new AppError("Cannot generate entries for future dates", 400);
};
