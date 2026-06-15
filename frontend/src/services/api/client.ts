

import axios from 'axios';


const apiClient = axios.create({
  baseURL: 'http://localhost:8000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});


apiClient.interceptors.request.use(
  (config) => {

    const token = localStorage.getItem('access_token');

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }


    if (import.meta.env.DEV) {
      console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.data);
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);


apiClient.interceptors.response.use(
  (response) => {

    if (import.meta.env.DEV) {
      console.log(`[API Response] ${response.config.url}`, response.data);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Refresh once on 401, then replay the original request.
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {

        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          const response = await axios.post(
            'http://localhost:8000/api/v1/auth/refresh',
            { refresh_token: refreshToken }
          );

          const newAccessToken = response.data.access_token;
          localStorage.setItem('access_token', newAccessToken);

          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return apiClient(originalRequest);
        }
      } catch {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }


    const message = error.response?.data?.detail || error.message || 'Network error';
    console.error('[API Error]', message);

    return Promise.reject(error);
  }
);

export default apiClient;
