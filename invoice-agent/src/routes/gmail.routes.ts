import { Router } from "express";

const router = Router();

// Milestone 1 uses `npm run read:gmail` — HTTP routes come later.
router.get("/poll", (_req, res) => {
  res.status(501).json({
    message: "Use npm run read:gmail for milestone 1",
  });
});

export default router;
