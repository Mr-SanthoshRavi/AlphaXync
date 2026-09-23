import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

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

  const checkSetupStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await api.getSetupStatus();
      setIsSetupRequired(Boolean(res?.setupRequired));
      return Boolean(res?.setupRequired);
    } catch {
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
      } else {
        setUser(null);
        setInstitution(null);
        await checkSetupStatus();
      }
    } catch {
      setUser(null);
      setInstitution(null);
      await checkSetupStatus();
    } finally {
      setIsLoading(false);
    }
  }, [checkSetupStatus]);

  useEffect(() => {
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
