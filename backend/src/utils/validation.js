export const normalizeEmail = (value = '') => String(value).trim().toLowerCase();
export const normalizeCnpj = (value = '') => String(value).replace(/\D/g, '');

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function isStrongPassword(value) {
  return typeof value === 'string' && value.length >= 8
    && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}

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

export function serviceError(status, message, code, details = {}) {
  return Object.assign(new Error(message), { status, code, details });
}
