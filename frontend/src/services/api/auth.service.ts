import apiClient from './client';

export interface RegisterData {
  email: string;
  password: string;
  display_name: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  user_id: string;
  email: string;
  display_name: string;
  plan: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    display_name: string;
    plan: string;
    email_verified: boolean;
  };
}

export interface RefreshTokenResponse {
  access_token: string;
  token_type: string;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  plan: string;
  email_verified: boolean;
}

class AuthService {
  async register(data: RegisterData): Promise<RegisterResponse> {
    const response = await apiClient.post<RegisterResponse>('/auth/register', data);
    return response.data;
  }

  async login(data: LoginData): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/login', data);
    
    if (response.data.success) {
      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    
    return response.data;
  }

  async refreshToken(): Promise<RefreshTokenResponse | null> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return null;
    
    try {
      const response = await apiClient.post<RefreshTokenResponse>('/auth/refresh', {
        refresh_token: refreshToken,
      });
      
      localStorage.setItem('access_token', response.data.access_token);
      return response.data;
    } catch {
      this.logout();
      return null;
    }
  }

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await apiClient.post('/auth/logout', null, {
          params: { refresh_token: refreshToken },
        });
      } catch (error) {
        console.error('Logout API error:', error);
      }
    }
    
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  isAuthenticated(): boolean {
    const token = localStorage.getItem('access_token');
    if (!token) return false;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expired = payload.exp * 1000 < Date.now();
      return !expired;
    } catch {
      return false;
    }
  }

  getCurrentUser(): User | null {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr) as User;
    } catch {
      return null;
    }
  }

  updateStoredUser(user: User): void {
    localStorage.setItem('user', JSON.stringify(user));
  }
}

const authService = new AuthService();
export default authService;
