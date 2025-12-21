import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth, registerAuthRoutes, setupCredentialAuth } from "./replit_integrations/auth";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Serve static files from public directory
app.use(express.static("public"));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Sync database with Git
  try {
    const { syncDatabaseWithGit } = await import("./db-sync");
    await syncDatabaseWithGit();
  } catch (error) {
    console.error("[DB-SYNC] Error:", error);
  }

  // Initialize SQLite database (for local auth fallback)
  try {
    const { initializeDatabase } = await import("./sqlite-db");
    initializeDatabase();
    log("[SQLite] Database initialized");
  } catch (error) {
    console.error("[SQLite] Error initializing database:", error);
  }

  // Seed admin users from admin-seed.json
  try {
    const bcrypt = await import("bcrypt");
    const fs = await import("fs");
    const path = await import("path");
    const { db } = await import("./db");
    const { users } = await import("@shared/models/auth");
    const { eq } = await import("drizzle-orm");

    const seedFilePath = path.default.join(process.cwd(), "admin-seed.json");
    if (fs.default.existsSync(seedFilePath)) {
      const seedData = JSON.parse(fs.default.readFileSync(seedFilePath, "utf-8"));
      
      for (const seedUser of seedData) {
        const existingUser = await db
          .select()
          .from(users)
          .where(eq(users.email, seedUser.email));

        if (existingUser.length === 0) {
          const hashedPassword = await bcrypt.default.hash(seedUser.password, 10);
          await db.insert(users).values({
            id: seedUser.id,
            email: seedUser.email,
            username: seedUser.username,
            passwordHash: hashedPassword,
            profileImageUrl: seedUser.profileImageUrl,
            authProvider: "local",
          });
          log(`[Seed] Admin user "${seedUser.username}" created successfully`);
        } else {
          log(`[Seed] User "${seedUser.email}" already exists, skipping`);
        }
      }
    }
  } catch (error) {
    console.error("[Seed] Error seeding admin users:", error);
  }

  // await setupAuth(app);
  // setupCredentialAuth(app);
  // registerAuthRoutes(app);
  
  // Initialize wallets from database on startup
  try {
    const { storage } = await import("./storage");
    const allWallets = await storage.getWallets();
    if (allWallets.length > 0) {
      const { setWallets } = await import("./services/debankScraper");
      setWallets(allWallets.map(w => ({ id: w.id, name: w.name, link: w.link })));
      console.log(`[Init] Loaded ${allWallets.length} wallets from database`);
    }
  } catch (error) {
    console.error("[Init] Error loading wallets from database:", error);
  }
  
  // Start wallet monitoring (scraping every 60 minutes)
  try {
    const { startStepMonitor } = await import("./services/debankScraper");
    startStepMonitor(60 * 60 * 1000); // 60 minutes
    console.log(`[Init] Wallet monitoring started`);
  } catch (error) {
    console.error("[Init] Error starting wallet monitoring:", error);
  }
  
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
