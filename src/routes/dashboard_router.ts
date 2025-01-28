import { Router } from "express";
import { getDashboardStatsHandler } from "../controllers/dashboard_controller";
import { authMiddleware } from "../middleware/middleware";


const dashboardRouter = Router()

dashboardRouter.get("/dashboard-stats",authMiddleware, getDashboardStatsHandler)

export default dashboardRouter