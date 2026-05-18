import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import authService, { User, LoginData, RegisterData } from '../services/api/auth.service';
import toast from 'react-hot-toast';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  login: (data: LoginData) => Promise<boolean>;
  register: (data: RegisterData) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (data: LoginData) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await authService.login(data);
          
          if (response.success) {
            set({
              user: response.user,
              isAuthenticated: true,
              isLoading: false,
            });
            toast.success(`Welcome back, ${response.user.display_name}!`);
            return true;
          } else {
            set({ isLoading: false, error: response.message || 'Login failed' });
            toast.error(response.message || 'Login failed');
            return false;
          }
        } catch (error: any) {
          const errorMessage = error.response?.data?.detail || 'Login failed. Please try again.';
          set({ isLoading: false, error: errorMessage });
          toast.error(errorMessage);
          return false;
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true, error: null });
        
        try {
          const response = await authService.register(data);
          
          if (response.success) {
            set({ isLoading: false });
            toast.success(response.message);
            return true;
          } else {
            set({ isLoading: false, error: response.message || 'Registration failed' });
            toast.error(response.message || 'Registration failed');
            return false;
          }
        } catch (error: any) {
          const errorMessage = error.response?.data?.detail || 'Registration failed. Please try again.';
          set({ isLoading: false, error: errorMessage });
          toast.error(errorMessage);
          return false;
        }
      },

      logout: async () => {
        await authService.logout();
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
        toast.success('Logged out successfully');
      },

      checkAuth: () => {
        const user = authService.getCurrentUser();
        const isAuthenticated = authService.isAuthenticated();
        
        if (isAuthenticated && user) {
          set({ user, isAuthenticated: true });
        } else {
          set({ user: null, isAuthenticated: false });
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
