import type { Express, RequestHandler } from "express";
import bcrypt from "bcrypt";
import { db } from "../../db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";

const registerSchema = z.object({
  username: z.string().min(3, "Usuário deve ter pelo menos 3 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
  profileImage: z.string().optional(),
});

const loginSchema = z.object({
  credential: z.string().min(1, "Email ou usuário é obrigatório"),
  password: z.string().min(1, "Senha é obrigatória"),
});

export function setupCredentialAuth(app: Express) {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validated = registerSchema.parse(req.body);
      
      const existingUser = await db.select().from(users).where(eq(users.email, validated.email));
      if (existingUser.length > 0) {
        return res.status(400).json({ message: "Email já cadastrado" });
      }

      const existingUsername = await db.select().from(users).where(eq(users.username, validated.username));
      if (existingUsername.length > 0) {
        return res.status(400).json({ message: "Usuário já cadastrado" });
      }

      const passwordHash = await bcrypt.hash(validated.password, 10);
      
      const [newUser] = await db.insert(users).values({
        username: validated.username,
        email: validated.email,
        passwordHash,
        authProvider: "local",
        profileImageUrl: validated.profileImage || null,
      }).returning();

      // Store user info directly in session
      (req as any).session.userId = newUser.id;
      (req as any).session.userEmail = newUser.email;
      
      (req as any).session.save((err: any) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Erro ao criar sessão" });
        }
        res.status(201).json({
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          profileImageUrl: newUser.profileImageUrl,
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Register error:", error);
      res.status(500).json({ message: "Erro ao criar conta" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validated = loginSchema.parse(req.body);
      
      // Try to find user by email or username
      let user;
      const emailResult = await db.select().from(users).where(eq(users.email, validated.credential));
      if (emailResult.length > 0) {
        user = emailResult[0];
      } else {
        const usernameResult = await db.select().from(users).where(eq(users.username, validated.credential));
        if (usernameResult.length > 0) {
          user = usernameResult[0];
        }
      }
      
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Email, usuário ou senha incorretos" });
      }

      const validPassword = await bcrypt.compare(validated.password, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ message: "Email, usuário ou senha incorretos" });
      }

      // Store user info directly in session
      (req as any).session.userId = user.id;
      (req as any).session.userEmail = user.email;
      
      (req as any).session.save((err: any) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Erro ao fazer login" });
        }
        res.json({
          id: user.id,
          username: user.username,
          email: user.email,
          profileImageUrl: user.profileImageUrl,
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Erro ao fazer login" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ message: "Logout realizado com sucesso" });
    });
  });
}
