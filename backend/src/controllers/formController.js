import * as service from '../services/formService.js';

export const list = async (req, res, next) => { try { res.json(await service.listForms(req.user)); } catch (error) { next(error); } };
export const get = async (req, res, next) => { try { res.json(await service.getForm(req.params.id, req.user)); } catch (error) { next(error); } };
export const create = async (req, res, next) => { try { res.status(201).json(await service.createForm(req.body, req.user)); } catch (error) { next(error); } };
export const update = async (req, res, next) => { try { res.json(await service.updateForm(req.params.id, req.body, req.user)); } catch (error) { next(error); } };
export const publish = async (req, res, next) => { try { res.json(await service.publishForm(req.params.id, req.body, req.user)); } catch (error) { next(error); } };
export const close = async (req, res, next) => { try { res.json(await service.closeForm(req.params.id, req.user)); } catch (error) { next(error); } };
export const archive = async (req, res, next) => { try { res.json(await service.archiveForm(req.params.id, req.user)); } catch (error) { next(error); } };
export const duplicate = async (req, res, next) => { try { res.status(201).json(await service.duplicateForm(req.params.id, req.user)); } catch (error) { next(error); } };
export const targets = async (req, res, next) => { try { res.json(await service.listTargets(req.params.id, req.user)); } catch (error) { next(error); } };
export const progress = async (req, res, next) => { try { res.json(await service.getProgress(req.params.id)); } catch (error) { next(error); } };
export const questions = async (req, res, next) => { try { res.json(await service.listQuestions(req.params.id, req.user)); } catch (error) { next(error); } };
export const addQuestion = async (req, res, next) => { try { res.status(201).json(await service.createQuestion(req.params.id, req.body, req.user)); } catch (error) { next(error); } };
export const updateQuestion = async (req, res, next) => { try { res.json(await service.editQuestion(req.params.id, req.params.questionId, req.body, req.user)); } catch (error) { next(error); } };
export const removeQuestion = async (req, res, next) => { try { await service.deleteQuestion(req.params.id, req.params.questionId, req.user); res.sendStatus(204); } catch (error) { next(error); } };
export const questionOptions = async (req, res, next) => { try { res.json(await service.listQuestionOptions(req.params.id, req.params.questionId, req.user)); } catch (error) { next(error); } };
export const addQuestionOption = async (req, res, next) => { try { res.status(201).json(await service.createQuestionOption(req.params.id, req.params.questionId, req.body, req.user)); } catch (error) { next(error); } };
