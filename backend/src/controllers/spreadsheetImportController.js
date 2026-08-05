import * as service from '../services/spreadsheetImportService.js';

export const validate = async (_req, res, next) => {
  try { res.json(await service.validateSource()); } catch (error) { next(error); }
};

export const importSpreadsheet = async (req, res, next) => {
  try { res.status(201).json(await service.importSource(req.user, { reprocess: req.body?.reprocess === true })); }
  catch (error) { next(error); }
};
