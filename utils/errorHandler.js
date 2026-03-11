import AppError from "./AppError.js";

const errorHandler = (err, req, res, next) => {
  // My Errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message });
  }

  // Known third-party errors
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ message: "Access token expired" });
  }

  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ message: "Invalid access token" });
  }

  if (err.name === "ValidationError") {
    return res.status(400).json({ message: err.message });
  }

  // PostgreSQL errors
  if (err.code === "23505") {
    return res.status(409).json({ message: "Resource already exists" });
  }

  if (err.code === "23503") {
    return res.status(400).json({ message: "Referenced resource not found" });
  }

  if (err.code === "23502") {
    return res.status(400).json({ message: "A required field is missing" });
  }

  if (err.code === "42P01") {
    return res.status(500).json({ message: "Database table not found" });
  }

  // Unknown/unexpected errors
  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
};

export default errorHandler;
