import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserInfo } from '@shared/api';

interface AuthContextType {
  user: UserInfo | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (loginData: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored tokens on app load
    const storedAccessToken = localStorage.getItem('accessToken');
    const storedRefreshToken = localStorage.getItem('refreshToken');
    const storedUser = localStorage.getItem('user');

    if (storedAccessToken && storedUser) {
      setAccessToken(storedAccessToken);
      setRefreshToken(storedRefreshToken);
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (loginData: string, password: string): Promise<boolean> => {
    try {
      const formData = new URLSearchParams();
      formData.append('login', loginData);
      formData.append('password', password);

      console.log('Attempting login with:', { login: loginData });

      const response = await fetch('http://127.0.0.1:8096/login', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (response.ok) {
        const data = await response.json();
        console.log('Response data:', data);

        // Check if the response indicates success
        if (data.message === 'Login Successful' && data.user_info) {
          let token = response.headers.get('authorization')?.replace('Bearer ', '') || '';
          let refresh = response.headers.get('x-refresh-token') || '';

          // Fallback: try different header case variations
          if (!token) {
            token = response.headers.get('Authorization')?.replace('Bearer ', '') || '';
          }
          if (!refresh) {
            refresh = response.headers.get('X-Refresh-Token') || '';
          }

          console.log('Extracted tokens:', {
            token: token ? 'present' : 'missing',
            refresh: refresh ? 'present' : 'missing',
            allHeaders: Array.from(response.headers.entries())
          });

          setUser(data.user_info);
          setAccessToken(token);
          setRefreshToken(refresh);

          // Store in localStorage
          localStorage.setItem('user', JSON.stringify(data.user_info));
          if (token) localStorage.setItem('accessToken', token);
          if (refresh) localStorage.setItem('refreshToken', refresh);

          // Even if tokens are missing due to CORS, we can still proceed with the login
          // The tokens might be handled via cookies or other mechanisms
          return true;
        } else {
          console.error('Unexpected response format:', data);
          return false;
        }
      } else {
        const errorData = await response.text();
        console.error('Login failed with status:', response.status, errorData);
        return false;
      }
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        accessToken, 
        refreshToken, 
        login, 
        logout, 
        isLoading 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
