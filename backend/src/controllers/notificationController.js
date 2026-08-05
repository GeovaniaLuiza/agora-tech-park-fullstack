import * as service from '../services/notificationService.js';

export const list = async (req, res, next) => {
  try { res.json(await service.list(req.user)); } catch (error) { next(error); }
};

export const markRead = async (req, res, next) => {
  try { res.json(await service.markRead(req.params.id, req.user)); } catch (error) { next(error); }
};
