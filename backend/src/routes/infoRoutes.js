import express from "express";
import { getVideoInfo } from "../controllers/infoController.js";

const router = express.Router();
router.post("/", getVideoInfo);

export default router;
