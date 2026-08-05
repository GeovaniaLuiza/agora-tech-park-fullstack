const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem('token') || sessionStorage.getItem('token');
    } catch {
      return null;
    }
  },
  set: (token, remember) => {
    tokenStore.clear();
    try {
      (remember ? localStorage : sessionStorage).setItem('token', token);
    } catch {
      throw new ApiError('Não foi possível armazenar a sessão neste navegador.', 0, 'SESSION_STORAGE_UNAVAILABLE');
    }
  },
  clear: () => {
    try { localStorage.removeItem('token'); } catch { /* armazenamento indisponível */ }
    try { sessionStorage.removeItem('token'); } catch { /* armazenamento indisponível */ }
  },
};

export class ApiError extends Error {
  constructor(message, status, code, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, details);
  }
}

export async function apiRequest(path, options = {}) {
  const token = tokenStore.get();
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      'Não foi possível acessar o serviço. Verifique sua conexão e tente novamente.',
      0,
      'NETWORK_ERROR',
      { networkError: true },
    );
  }
  const rawBody = response.status === 204 ? '' : await response.text();
  let data = null;
  if (rawBody) {
    try { data = JSON.parse(rawBody); }
    catch { data = { message: rawBody }; }
  }
  if (!response.ok) {
    if (response.status === 401 && token) {
      tokenStore.clear();
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    const retryAfterSeconds = Number(
      data?.retryAfter ?? data?.retryAfterSeconds ?? response.headers.get('Retry-After'),
    ) || undefined;
    throw new ApiError(
      data?.message || 'Não foi possível concluir a operação',
      response.status,
      data?.code,
      {
        retryAfterSeconds,
        retryAfter: retryAfterSeconds,
        requestCreated: data?.requestCreated,
        notificationSent: data?.notificationSent,
        nextAction: data?.nextAction,
      },
    );
  }
  return data;
}

export const login = (email, password) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const registerRequest = (payload) => apiRequest('/auth/register-request', { method: 'POST', body: JSON.stringify(payload) });
export const verifyEmail = (token) => apiRequest('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
export const resendVerification = (email) => apiRequest('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) });
export const forgotPassword = (email) => apiRequest('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
export const resetPassword = (token, password, confirmPassword) => apiRequest('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password, confirmPassword }) });
export const logout = () => apiRequest('/auth/logout', { method: 'POST', body: '{}' });
export const getMe = () => apiRequest('/auth/me');
export const getForms = () => apiRequest('/forms');
export const getForm = (id) => apiRequest(`/forms/${id}`);
export const createForm = (payload) => apiRequest('/forms', { method: 'POST', body: JSON.stringify(payload) });
export const updateForm = (id, payload) => apiRequest(`/forms/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
export const publishForm = (id, organizationIds = [], recipientIds = []) => apiRequest(`/forms/${id}/publish`, { method: 'POST', body: JSON.stringify({ organizationIds, recipientIds }) });
export const getEligibleFormRecipients = (organizationIds = []) => {
  const params = new URLSearchParams();
  organizationIds.forEach((id) => params.append('organizationId', id));
  return apiRequest(`/forms/recipients/eligible?${params}`);
};
export const closeForm = (id) => apiRequest(`/forms/${id}/close`, { method: 'POST', body: '{}' });
export const duplicateForm = (id) => apiRequest(`/forms/${id}/duplicate`, { method: 'POST', body: '{}' });
export const archiveForm = (id) => apiRequest(`/forms/${id}/archive`, { method: 'PATCH', body: '{}' });
export const getFormProgress = (id) => apiRequest(`/forms/${id}/progress`);
export const getFormQuestions = (formId) => apiRequest(`/forms/${formId}/questions`);
export const addFormQuestion = (formId, payload) => apiRequest(`/forms/${formId}/questions`, { method: 'POST', body: JSON.stringify(payload) });
export const updateFormQuestion = (formId, questionId, payload) => apiRequest(`/forms/${formId}/questions/${questionId}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const deleteFormQuestion = (formId, questionId) => apiRequest(`/forms/${formId}/questions/${questionId}`, { method: 'DELETE' });
export const getQuestionOptions = (formId, questionId) => apiRequest(`/forms/${formId}/questions/${questionId}/options`);
export const addQuestionOption = (formId, questionId, value) => apiRequest(`/forms/${formId}/questions/${questionId}/options`, { method: 'POST', body: JSON.stringify({ value }) });
export const submitResponse = (formId, organizationId, answers) => apiRequest(`/forms/${formId}/responses`, { method: 'POST', body: JSON.stringify({ organizationId, answers }) });
export const saveResponseDraft = (formId, organizationId, answers) => apiRequest(`/forms/${formId}/responses/draft`, { method: 'PUT', body: JSON.stringify({ organizationId, answers }) });
export const getResponseHistory = (organizationId) => apiRequest(`/organizations/${organizationId}/responses`);
export const getFormResponse = (formId, organizationId) => apiRequest(`/forms/${formId}/organizations/${organizationId}/responses`);
export const reopenResponse = (id) => apiRequest(`/responses/${id}/reopen`, { method: 'PATCH', body: '{}' });
export const getOrganizations = () => apiRequest('/organizations');
export const createOrganization = (payload) => apiRequest('/organizations', { method: 'POST', body: JSON.stringify(payload) });
export const updateOrganization = (id, payload) => apiRequest(`/organizations/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
export const inactivateOrganization = (id) => apiRequest(`/organizations/${id}`, { method: 'DELETE' });
export const getAccessRequests = () => apiRequest('/admin/access-requests');
export const approveAccessRequest = (id, payload) => apiRequest(`/admin/access-requests/${id}/approve`, { method: 'POST', body: JSON.stringify(payload) });
export const getAccessRequest = (id) => apiRequest(`/admin/access-requests/${id}`);
export const rejectAccessRequest = (id, reason) => apiRequest(`/admin/access-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
export const getUsers = (filters = {}) => apiRequest(`/admin/users?${new URLSearchParams(filters)}`);
export const changeUserStatus = (id, status) => apiRequest(`/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const changeUserRole = (id, role) => apiRequest(`/admin/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
export const linkUserOrganization = (id, organizationId) => apiRequest(`/admin/users/${id}/organizations`, { method: 'POST', body: JSON.stringify({ organizationId }) });
export const unlinkUserOrganization = (id, organizationId) => apiRequest(`/admin/users/${id}/organizations/${organizationId}`, { method: 'DELETE' });
export const getAudit = (filters = {}) => apiRequest(`/admin/audit?${new URLSearchParams(filters)}`);
export const getIndicators = (filters = {}) => apiRequest(`/indicators?${new URLSearchParams(filters)}`);
export const getIndicatorHistory = () => apiRequest('/indicators/history');
export const getDashboard = () => apiRequest('/indicators/dashboard');
export const getOperationalDashboard = () => apiRequest('/dashboard/operational-summary');
export const getInstitutionalDashboard = (filters = {}) => apiRequest(`/dashboard/institutional-summary?${new URLSearchParams(filters)}`);
export const getDashboardCompanies = (filters = {}) => apiRequest(`/dashboard/companies?${new URLSearchParams(filters)}`);
export const getDashboardFinancial = (filters = {}) => apiRequest(`/dashboard/financial?${new URLSearchParams(filters)}`);
export const getDashboardProjects = (filters = {}) => apiRequest(`/dashboard/projects?${new URLSearchParams(filters)}`);
export const getDashboardEngagement = (filters = {}) => apiRequest(`/dashboard/engagement?${new URLSearchParams(filters)}`);
export const validateIndicatorSpreadsheet = () => apiRequest('/admin/spreadsheet-imports/validate', { method: 'POST', body: '{}' });
export const importIndicatorSpreadsheet = (reprocess = false) => apiRequest('/admin/spreadsheet-imports', { method: 'POST', body: JSON.stringify({ reprocess }) });
export const getNotifications = () => apiRequest('/notifications');
export const markNotificationRead = (id) => apiRequest(`/notifications/${id}/read`, { method: 'PATCH', body: '{}' });

export async function downloadIndicatorReport(format, filters = {}) {
  const token = tokenStore.get();
  const response = await fetch(`${BASE_URL}/indicators/export/${format}?${new URLSearchParams(filters)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch { /* resposta controlada abaixo */ }
    throw new ApiError(data.message || 'Não foi possível exportar o relatório', response.status, data.code);
  }
  return {
    blob: await response.blob(),
    filename: response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || `indicadores.${format === 'pdf' ? 'pdf' : format === 'csv' ? 'csv' : 'xls'}`,
  };
}

export async function downloadDashboardSpreadsheet() {
  const token = tokenStore.get();
  const response = await fetch(`${BASE_URL}/dashboard/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch { /* resposta controlada abaixo */ }
    throw new ApiError(data.message || 'Não foi possível exportar a planilha', response.status, data.code);
  }
  return {
    blob: await response.blob(),
    filename: response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'indicadores-joinville-2025.xlsx',
  };
}
