import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Origin of the API (without the trailing /api) — used for OAuth redirects, which are
// full-page navigations rather than axios calls. With VITE_API_URL=/api this is "" so the
// links become relative (/api/auth/google) and go through the Vercel proxy.
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    if (status === 401 && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    // File downloads use responseType "blob", so a JSON `{ error }` body arrives as a Blob.
    const data = error?.response?.data;
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      try {
        error.response.data = JSON.parse(await data.text());
      } catch {
        // Not JSON — leave as is; getErrorMessage falls back to a generic message.
      }
    }
    return Promise.reject(error);
  }
);

/** Always returns a Vietnamese message: the backend's `{ error }` if present, else the fallback. */
export function getErrorMessage(err: unknown, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data && typeof data === 'object' && typeof data.error === 'string' && data.error) return data.error;
    if (!err.response) return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại.';
    return fallback;
  }
  return fallback;
}

export default api;
