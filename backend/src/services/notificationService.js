import * as repository from '../repositories/notificationRepository.js';
import { serviceError } from '../utils/validation.js';

export const list = (user) => repository.findForUser(user.sub);

export async function markRead(id, user) {
  const notification = await repository.markRead(id, user.sub);
  if (!notification) throw serviceError(404, 'Notificação não encontrada', 'NOTIFICATION_NOT_FOUND');
  return notification;
}
