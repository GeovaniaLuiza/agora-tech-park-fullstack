export const normalizeCnpj = (value = '') => String(value).replace(/\D/g, '').slice(0, 14);
export const isValidEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export const isStrongPassword = (value = '') => value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);

export function isValidCnpj(value) {
  const cnpj = normalizeCnpj(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const digit = (length) => {
    let sum = 0;
    let weight = length - 7;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cnpj[index]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

export function validateLogin(form) {
  const errors = {};
  if (!isValidEmail(form.email)) errors.email = 'Informe um e-mail válido.';
  if (!form.password) errors.password = 'Informe sua senha.';
  return errors;
}

export function validateRegistration(form) {
  const errors = {};
  if (form.name.trim().length < 3) errors.name = 'Informe seu nome completo.';
  if (!isValidEmail(form.email)) errors.email = 'Informe um e-mail válido.';
  if (!isStrongPassword(form.password)) errors.password = 'Use 8 caracteres, maiúscula, minúscula e número.';
  if (form.password !== form.confirmPassword) errors.confirmPassword = 'As senhas não coincidem.';
  if (!isValidCnpj(form.cnpj)) errors.cnpj = 'Informe um CNPJ válido.';
  if (form.companyName.trim().length < 2) errors.companyName = 'Informe o nome da empresa.';
  if (!form.acceptedTerms) errors.acceptedTerms = 'Aceite os termos para continuar.';
  return errors;
}
