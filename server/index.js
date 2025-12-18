import express from "express";
import cors from "cors";
import { initializeDatabase, createDefaultAdmin } from "./db.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Initialize database and create default admin on startup
initializeDatabase();
createDefaultAdmin();

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
