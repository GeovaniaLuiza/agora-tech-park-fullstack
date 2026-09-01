import * as service from '../services/dashboardService.js';

const respond = (operation) => async (req, res, next) => {
  try { res.json(await operation(req.query, req.user)); } catch (error) { next(error); }
};

export const operational = respond(service.operationalSummary);
export const institutional = respond(service.institutionalSummary);
export const companies = respond(service.companies);
export const financial = respond(service.financial);
export const projects = respond(service.projects);
export const engagement = respond(service.engagement);

export const exportSpreadsheet = async (req, res, next) => {
  try {
    const file = await service.exportIndicatorSpreadsheet(req.query, req.user);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.set('X-Indicator-Rows', String(file.rows));
    res.send(file.body);
  } catch (error) { next(error); }
};
