-- Permite armazenar uma foto de perfil pequena e validada para cada usuário.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_data TEXT;

COMMENT ON COLUMN users.avatar_data IS 'Imagem de perfil em data URL (JPEG, PNG ou WebP), limitada pela API.';
