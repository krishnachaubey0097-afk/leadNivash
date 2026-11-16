import { Router, type Request, type Response, type NextFunction } from 'express';
import { DashboardService } from './dashboard.service.js';
import { requireAuth } from '../../middleware/requireAuth.js';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

const getTodayHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!._id;
    const data = await DashboardService.getTodayData(userId);
    res.status(200).json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};

dashboardRouter.get('/today', getTodayHandler);
dashboardRouter.get('/', getTodayHandler);

