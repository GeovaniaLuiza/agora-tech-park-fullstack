import * as service from '../services/responseService.js';

export async function create(req, res, next) { try { res.status(201).json(await service.submit(req.params.id, req.body, req.user)); } catch (error) { next(error); } }
export async function draft(req, res, next) { try { res.json(await service.saveDraft(req.params.id, req.body, req.user)); } catch (error) { next(error); } }
export async function listHistory(req, res, next) { try { res.json(await service.history(req.params.id, req.user)); } catch (error) { next(error); } }
export async function getResponse(req, res, next) { try { res.json(await service.get(req.params.formId, req.params.organizationId, req.user)); } catch (error) { next(error); } }
export async function reopen(req, res, next) { try { res.json(await service.reopen(req.params.id, req.user)); } catch (error) { next(error); } }
