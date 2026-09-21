const MOCK_DELIVERY_RESULT = Object.freeze({
  accepted: [],
  rejected: [],
  messageId: 'mock-message-id',
  response: 'mock-delivery',
});

export function createMockProvider() {
  const send = async () => ({ ...MOCK_DELIVERY_RESULT });

  return {
    verify: async () => true,
    send,
    sendMail: send,
    close: () => {},
  };
}
