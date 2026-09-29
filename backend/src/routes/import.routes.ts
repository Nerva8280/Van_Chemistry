import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import upload from "../middleware/upload";
import { importTuition, downloadTemplate } from "../controllers/import.controller";

const router = Router();

router.get("/tuition/template", asyncHandler(downloadTemplate));
router.post("/tuition", upload.single("file"), asyncHandler(importTuition));

export default router;
