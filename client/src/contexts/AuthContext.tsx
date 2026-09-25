import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setStoredToken } from '../lib/api';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF' | 'CASHIER' | 'VIEWER';
  lastLoginAt?: string;
}

export interface ReceiptSettings {
  headerTitleSize?: number;
  headerTitleColor?: string;
  headerSubtitleText?: string;
  headerSubtitleSize?: number;
  headerSubtitleColor?: string;
  badgeText?: string;
  headerLogoSize?: number;
  headerLogoPosition?: 'inline' | 'stacked';
  showWatermark?: boolean;
  watermarkCustomUrl?: string;
  watermarkSize?: number;
  watermarkOpacity?: number;
  watermarkRotation?: number;
  watermarkGrayscale?: boolean;
  bodyFontSize?: number;
  primaryColor?: string;
  textColor?: string;
  secondaryTextColor?: string;
  cardBgColor?: string;
  cardBgOpacity?: number;
  cardBorderColor?: string;
  sectionBgColor?: string;
  tableBorderColor?: string;
  footerNotes?: string;
  signatoryLabel?: string;
  showSignatoryLine?: boolean;
}

export interface InstitutionProfile {
  id: string;
  name: string;
  code: string;
  timezone?: string;
  logoUrl?: string;
  receiptSettings?: ReceiptSettings;
}


interface AuthContextType {
  user: UserProfile | null;
  institution: InstitutionProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSetupRequired: boolean;
  dbError: string | null;
  login: (email: string, password: string, captchaToken?: string) => Promise<any>;
  verifyLoginOtp: (email: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  checkSetupStatus: () => Promise<boolean>;
  setInstitution: React.Dispatch<React.SetStateAction<InstitutionProfile | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [institution, setInstitution] = useState<InstitutionProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSetupRequired, setIsSetupRequired] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);

  const checkSetupStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await api.getSetupStatus();
      setIsSetupRequired(Boolean(res?.setupRequired));
      setDbError(null);
      return Boolean(res?.setupRequired);
    } catch (err: any) {
      if (err?.code === 'DATABASE_UNAVAILABLE' || err?.status === 503) {
        setDbError(err?.message || 'Database connection failed. Please ensure MONGODB_URI is set in Vercel Environment Variables.');
      }
      return false;
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const data = await api.getMe();
      if (data && data.user) {
        setUser(data.user);
        setInstitution(data.institution || null);
        setIsSetupRequired(false);
        setDbError(null);
      } else {
        setUser(null);
        setInstitution(null);
        await checkSetupStatus();
      }
    } catch (err: any) {
      setUser(null);
      setInstitution(null);
      if (err?.code === 'DATABASE_UNAVAILABLE' || err?.status === 503) {
        setDbError(err?.message || 'Database connection failed. Please ensure MONGODB_URI is set in Vercel Environment Variables.');
      } else {
        await checkSetupStatus();
      }
    } finally {
      setIsLoading(false);
    }
  }, [checkSetupStatus]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        setStoredToken(urlToken);
        params.delete('token');
        params.delete('role');
        const remaining = params.toString();
        const newUrl = `${window.location.pathname}${remaining ? `?${remaining}` : ''}`;
        window.history.replaceState({}, document.title, newUrl);
      }
    } catch {}
    refreshAuth();
  }, [refreshAuth]);

  const login = async (email: string, password: string, captchaToken?: string): Promise<any> => {
    const data = await api.login(email, password, captchaToken);
    if (data?.requiresOtp) {
      return data;
    }
    if (data && data.user) {
      setUser(data.user);
      setInstitution(data.institution || null);
      setIsSetupRequired(false);
    }
    return data;
  };

  const verifyLoginOtp = async (email: string, otp: string): Promise<void> => {
    const data = await api.verifyLoginOtp(email, otp);
    if (data && data.user) {
      setUser(data.user);
      setInstitution(data.institution || null);
      setIsSetupRequired(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      console.warn('Logout error:', err);
    } finally {
      setUser(null);
      setInstitution(null);
      // Recheck setup status in case needed
      await checkSetupStatus();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        institution,
        isAuthenticated: !!user,
        isLoading,
        isSetupRequired,
        dbError,
        login,
        verifyLoginOtp,
        logout,
        refreshAuth,
        checkSetupStatus,
        setInstitution,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
