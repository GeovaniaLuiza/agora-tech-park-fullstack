import { describe,expect,it,vi } from 'vitest';
import { validateForm,validateQuestion } from '../src/middlewares/validate.js';
import { validateRegisterRequest } from '../src/middlewares/authValidation.js';
const run=(middleware,body)=>{const res={status:vi.fn().mockReturnThis(),json:vi.fn()};const next=vi.fn();middleware({body},res,next);return {res,next};};
describe('validação de payload',()=>{it('bloqueia período invertido',()=>{const {res,next}=run(validateForm,{startDate:'2026-04-01',endDate:'2026-03-01'});expect(res.status).toHaveBeenCalledWith(422);expect(next).not.toHaveBeenCalled();});it('bloqueia tipo de pergunta desconhecido',()=>{const {res,next}=run(validateQuestion,{label:'Receita',type:'SQL'});expect(res.status).toHaveBeenCalledWith(422);expect(next).not.toHaveBeenCalled();});
  it.each(['role','perfil','status','permissions','approvedBy','approvedAt','organizationId','organizations','emailVerifiedAt'])('rejeita campo administrativo %s no cadastro público',(field)=>{
    const body={name:'Pessoa Teste',email:'pessoa@test.com',password:'Senha123',confirmPassword:'Senha123',cnpj:'11222333000181',companyName:'Startup',acceptedTerms:true,[field]:'tentativa'};
    const {res,next}=run(validateRegisterRequest,body);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });
});
