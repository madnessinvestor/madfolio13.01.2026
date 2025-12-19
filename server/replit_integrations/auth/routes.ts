import type { Express, RequestHandler } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";

// Middleware for both Passport and credential-based auth
const authMiddleware: RequestHandler = async (req: any, res, next) => {
  // Try Passport auth first (Replit Auth)
  if (req.isAuthenticated() && req.user?.claims?.sub) {
    return next();
  }
  
  // Try session-based auth (credential login)
  if (req.session?.userId) {
    return next();
  }
  
  return res.status(401).json({ message: "Unauthorized" });
};

// Register auth-specific routes
export function registerAuthRoutes(app: Express): void {
  // Get current authenticated user
  app.get("/api/auth/user", authMiddleware, async (req: any, res) => {
    try {
      // Support both auth methods
      const userId = req.user?.claims?.sub || req.session?.userId;
      const user = await authStorage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
}
