// Session storage key and expiry duration (24 hours)
const AUTH_KEY = 'maidan72_auth';
const AUTH_EXPIRY_HOURS = 24;

export interface AuthData {
  authenticated: boolean;
  expiry: number;
}

export const setAuthSession = (): void => {
  const expiryTime = new Date().getTime() + (AUTH_EXPIRY_HOURS * 60 * 60 * 1000);
  const authData: AuthData = {
    authenticated: true,
    expiry: expiryTime
  };
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(authData));
};

export const getAuthSession = (): boolean => {
  try {
    const authData = sessionStorage.getItem(AUTH_KEY);
    if (!authData) return false;
    
    const parsed: AuthData = JSON.parse(authData);
    const now = new Date().getTime();
    
    // Check if session has expired
    if (now > parsed.expiry) {
      sessionStorage.removeItem(AUTH_KEY);
      return false;
    }
    
    return parsed.authenticated === true;
  } catch (error) {
    console.error('Error reading auth session:', error);
    sessionStorage.removeItem(AUTH_KEY);
    return false;
  }
};

export const clearAuthSession = (): void => {
  sessionStorage.removeItem(AUTH_KEY);
};

export const getRemainingSessionTime = (): number => {
  try {
    const authData = sessionStorage.getItem(AUTH_KEY);
    if (!authData) return 0;
    
    const parsed: AuthData = JSON.parse(authData);
    const now = new Date().getTime();
    
    return Math.max(0, parsed.expiry - now);
  } catch (error) {
    return 0;
  }
};
