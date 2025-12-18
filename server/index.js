import express from "express";
import cors from "cors";
import { initializeDatabase, createDefaultAdmin, validateLogin } from "./db.js";

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

app.post("/login", (req, res) => {
  const { usernameOrEmail, password } = req.body;
  
  // Validate required fields
  if (!usernameOrEmail || !password) {
    return res.status(401).json({ 
      success: false, 
      message: "Username/Email and password are required" 
    });
  }
  
  // Validate credentials
  const result = validateLogin(usernameOrEmail, password);
  
  if (!result.success) {
    return res.status(401).json({ 
      success: false, 
      message: "Invalid credentials" 
    });
  }
  
  res.json({ 
    success: true, 
    user: result.user 
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
