import * as service from '../services/indicatorManagementService.js';

export const centers = async (req, res, next) => { try { res.json(await service.listCenters(req.query.includeInactive === 'true')); } catch (error) { next(error); } };
export const createCenter = async (req, res, next) => { try { res.status(201).json(await service.saveCenter(null, req.body, req.user)); } catch (error) { next(error); } };
export const updateCenter = async (req, res, next) => { try { res.json(await service.saveCenter(req.params.id, req.body, req.user)); } catch (error) { next(error); } };
export const metadata = async (req, res, next) => { try { res.json(await service.metadata(req.query.centerId)); } catch (error) { next(error); } };
export const definitions = async (req, res, next) => { try { res.json(await service.listCatalogDefinitions(req.query.includeInactive === 'true', req.user)); } catch (error) { next(error); } };
export const createDefinition = async (req, res, next) => { try { res.status(201).json(await service.createCatalogDefinition(req.body, req.user)); } catch (error) { next(error); } };
export const updateDefinition = async (req, res, next) => { try { res.json(await service.updateCatalogDefinition(req.params.id, req.body, req.user)); } catch (error) { next(error); } };
export const removeDefinition = async (req, res, next) => { try { await service.removeCatalogDefinition(req.params.id, req.user); res.sendStatus(204); } catch (error) { next(error); } };
export const values = async (req, res, next) => { try { res.json(await service.values(req.query)); } catch (error) { next(error); } };
export const history = async (req, res, next) => { try { res.json(await service.history(req.query)); } catch (error) { next(error); } };
export const saveValue = async (req, res, next) => { try { res.status(200).json(await service.saveManualValue(req.body, req.user)); } catch (error) { next(error); } };
export const removeValue = async (req, res, next) => { try { await service.removeManualValue(req.params.id, req.user); res.sendStatus(204); } catch (error) { next(error); } };
export const records = async (req, res, next) => { try { res.json(await service.listRecords({ ...req.query, type: req.params.type })); } catch (error) { next(error); } };
export const createRecord = async (req, res, next) => { try { res.status(201).json(await service.saveRecord(null, req.params.type, req.body, req.user)); } catch (error) { next(error); } };
export const updateRecord = async (req, res, next) => { try { res.json(await service.saveRecord(req.params.id, req.params.type, req.body, req.user)); } catch (error) { next(error); } };
export const removeRecord = async (req, res, next) => { try { await service.removeRecord(req.params.id, req.params.type, req.user); res.sendStatus(204); } catch (error) { next(error); } };
export const applicability = async (req, res, next) => { try { res.json(await service.setApplicability({ ...req.body, indicatorId: req.params.indicatorId }, req.user)); } catch (error) { next(error); } };
