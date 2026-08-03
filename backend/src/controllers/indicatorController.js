import * as service from '../services/indicatorService.js';

export const list = async (req, res, next) => { try { res.json(await service.list(req.query)); } catch (error) { next(error); } };
export const history = async (_req, res, next) => { try { res.json(await service.history()); } catch (error) { next(error); } };
export const dashboard = async (_req, res, next) => { try { res.json(await service.dashboard()); } catch (error) { next(error); } };
export const refresh = async (req, res, next) => { try { await service.refresh(req.body.period, req.user); res.sendStatus(204); } catch (error) { next(error); } };
export const exportReport = async (req, res, next) => {
  try {
    const report = await service.exportReport(req.params.format, req.query, req.user);
    res.set('Content-Type', report.contentType);
    res.set('Content-Disposition', `attachment; filename="indicadores.${report.extension}"`);
    res.send(report.body);
  } catch (error) { next(error); }
};
