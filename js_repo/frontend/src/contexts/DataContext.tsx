// React context for managing centralized data across components
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { fetchAllData, ApiDataItem } from '@/services/api';
import { 
  transformToEntries, 
  transformToChartData, 
  transformToStatsData,
  Entry,
  ChartData,
  StatsData,
  Winner
} from '@/utils/dataTransforms';
import { getAuthSession } from '@/utils/auth';

interface DataContextType {
  // Raw API data
  rawData: ApiDataItem[];
  
  // Transformed data for components
  entries: Entry[];
  chartData: ChartData;
  statsData: StatsData;
  winners: Winner[];
  
  // Loading and error states
  loading: boolean;
  error: string | null;
  
  // Authentication state
  isAuthenticated: boolean;
  
  // Actions
  refreshData: (forceAuth?: boolean) => Promise<void>;
  setWinners: (winners: Winner[]) => void;
  updateEntry: (entryId: string, updates: Partial<Entry>) => void;
  deleteEntry: (entryId: string) => void;
  setAuthenticated: (authenticated: boolean) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

interface DataProviderProps {
  children: ReactNode;
}

export const DataProvider: React.FC<DataProviderProps> = ({ children }) => {
  const [rawData, setRawData] = useState<ApiDataItem[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [chartData, setChartData] = useState<ChartData>({
    daily: [],
    city: [],
    performance: []
  });
  const [statsData, setStatsData] = useState<StatsData>({
    registrations: 0,
    codeScansToday: 0,
    winnersSelected: []
  });
  const [winners, setWinnersState] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  const transformData = (data: ApiDataItem[]) => {
    const transformedEntries = transformToEntries(data);
    const transformedChartData = transformToChartData(data);
    const transformedStatsData = transformToStatsData(data, winners);

    setEntries(transformedEntries);
    setChartData(transformedChartData);
    setStatsData(transformedStatsData);
  };

  const refreshData = async (forceAuth: boolean = false) => {
    if (!forceAuth && !isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching data from API...');
      const response = await fetchAllData();
      console.log('API Response:', response);
      
      setRawData(response.data);
      transformData(response.data);
      console.log('Data transformed and set successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
      setError(errorMessage);
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const setAuthenticated = (authenticated: boolean) => {
    setIsAuthenticated(authenticated);
    if (authenticated) {
      // Fetch data immediately when authenticated, force auth bypass since state might not be updated yet
      refreshData(true);
    } else {
      // Clear data when not authenticated
      setRawData([]);
      setEntries([]);
      setChartData({ daily: [], city: [], performance: [] });
      setStatsData({ registrations: 0, codeScansToday: 0, winnersSelected: [] });
      setWinnersState([]);
    }
  };

  const setWinners = (newWinners: Winner[]) => {
    setWinnersState(newWinners);
    // Update stats data with new winners
    const updatedStatsData = transformToStatsData(rawData, newWinners);
    setStatsData(updatedStatsData);
  };

  const updateEntry = (entryId: string, updates: Partial<Entry>) => {
    setEntries(prevEntries => 
      prevEntries.map(entry => 
        entry.id === entryId ? { ...entry, ...updates } : entry
      )
    );
  };

  const deleteEntry = (entryId: string) => {
    // Remove from entries
    setEntries(prevEntries => prevEntries.filter(entry => entry.id !== entryId));
    
    // Remove from raw data
    const updatedRawData = rawData.filter(item => item._id !== entryId);
    setRawData(updatedRawData);
    
    // Re-transform data
    transformData(updatedRawData);
  };

  // Check authentication status on mount
  useEffect(() => {
    const authStatus = getAuthSession();
    setIsAuthenticated(authStatus);
    if (authStatus) {
      // Call refreshData with direct implementation to avoid circular dependency
      const fetchInitialData = async () => {
        try {
          setLoading(true);
          setError(null);
          
          console.log('Fetching initial data from API...');
          const response = await fetchAllData();
          console.log('Initial API Response:', response);
          
          setRawData(response.data);
          const transformedEntries = transformToEntries(response.data);
          const transformedChartData = transformToChartData(response.data);
          const transformedStatsData = transformToStatsData(response.data, []);
          
          setEntries(transformedEntries);
          setChartData(transformedChartData);
          setStatsData(transformedStatsData);
          console.log('Initial data transformed and set successfully');
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
          setError(errorMessage);
          console.error('Error fetching initial data:', err);
        } finally {
          setLoading(false);
        }
      };
      fetchInitialData();
    } else {
      setLoading(false);
    }
  }, []);

  // Update stats when winners change
  useEffect(() => {
    if (rawData.length > 0) {
      const updatedStatsData = transformToStatsData(rawData, winners);
      setStatsData(updatedStatsData);
    }
  }, [winners, rawData]);

  const contextValue: DataContextType = {
    rawData,
    entries,
    chartData,
    statsData,
    winners,
    loading,
    error,
    isAuthenticated,
    refreshData,
    setWinners,
    updateEntry,
    deleteEntry,
    setAuthenticated,
  };

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = (): DataContextType => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
