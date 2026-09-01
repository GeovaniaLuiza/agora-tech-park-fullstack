import * as service from '../services/indicatorImportService.js';
import { generateOfficialWorkbook, workbookStatus } from '../services/indicatorWorkbookExporter.js';

export const options = (_req, res) => res.json(service.importOptions());
export const preview = async (req, res, next) => {
  try {
    res.status(201).json(await service.preview({
      type: req.params.type, fileName: req.query.fileName, mimeType: req.get('Content-Type'), buffer: req.body,
      centerId: req.query.centerId, reprocess: req.query.reprocess === 'true',
    }, req.user));
  } catch (error) { next(error); }
};
export const batch = async (req, res, next) => { try { res.json(await service.getBatch(req.params.id, req.user)); } catch (error) { next(error); } };
export const draft = async (req, res, next) => { try { res.json(await service.getLatestDraft({ type: req.params.type, centerId: req.query.centerId }, req.user)); } catch (error) { next(error); } };
export const review = async (req, res, next) => { try { res.json(await service.saveReview(req.params.id, req.body, req.user)); } catch (error) { next(error); } };
export const groupEvents = async (req, res, next) => { try { res.json(await service.groupEvents(req.params.id, req.body, req.user)); } catch (error) { next(error); } };
export const confirm = async (req, res, next) => { try { res.json(await service.confirm(req.params.id, req.user)); } catch (error) { next(error); } };
export const exportStatus = async (req, res, next) => { try { res.json(await workbookStatus(req.query, req.user)); } catch (error) { next(error); } };
export const exportWorkbook = async (req, res, next) => {
  try {
    const file = await generateOfficialWorkbook(req.body, req.user);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    res.set('X-Import-Warnings', encodeURIComponent(JSON.stringify(file.warnings)));
    res.send(file.body);
  } catch (error) { next(error); }
};
