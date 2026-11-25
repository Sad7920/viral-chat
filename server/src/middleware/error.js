export function errorMiddleware(err, _req, res, next) {
  console.error(err);
  if (res.headersSent) {
    next(err);
    return;
  }
  const status = typeof err.status === "number" ? err.status : 500;
  const error = status >= 500 ? "Internal server error" : err.message;
  res.status(status).json({ error });
}
