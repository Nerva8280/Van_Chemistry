import { Router } from "express";
import asyncHandler from "../utils/asyncHandler";
import { listClasses, createClass, updateClass, deleteClass } from "../controllers/classes.controller";

const router = Router();

router.get("/", asyncHandler(listClasses));
router.post("/", asyncHandler(createClass));
router.put("/:id", asyncHandler(updateClass));
router.delete("/:id", asyncHandler(deleteClass));

export default router;
