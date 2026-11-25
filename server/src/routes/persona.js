import { Router } from "express";
import { defaultModel, models } from "../allowlist.js";
import { agentName, companyName, greeting, suggestedPrompts } from "../persona.js";

export function personaRouter(env) {
  const router = Router();

  router.get("/persona", (_req, res) => {
    res.json({ agentName, companyName, greeting, suggestedPrompts });
  });

  router.get("/models", (_req, res) => {
    res.json({ models, defaultModel: defaultModel(env) });
  });

  return router;
}
