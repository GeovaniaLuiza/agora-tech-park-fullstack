export function authRateLimit(error) {
  const value = Number(error.retryAfter ?? error.retryAfterSeconds);
  const seconds = Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0;
  return {
    seconds,
    message: seconds
      ? `Muitas tentativas. Aguarde ${seconds} segundo${seconds === 1 ? '' : 's'} antes de tentar novamente.`
      : 'Muitas tentativas. Aguarde alguns instantes e tente novamente.',
  };
}
