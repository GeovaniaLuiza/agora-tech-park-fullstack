import * as service from '../services/organizationService.js';

export const list = async (req, res, next) => { try { res.json(await service.list(req.user)); } catch (error) { next(error); } };
export const get = async (req, res, next) => { try { res.json(await service.get(req.params.id, req.user)); } catch (error) { next(error); } };
export const create = async (req, res, next) => { try { res.status(201).json(await service.create(req.body, req.user)); } catch (error) { next(error); } };
export const update = async (req, res, next) => { try { res.json(await service.update(req.params.id, req.body, req.user)); } catch (error) { next(error); } };
export const remove = async (req, res, next) => { try { await service.inactivate(req.params.id, req.user); res.sendStatus(204); } catch (error) { next(error); } };
