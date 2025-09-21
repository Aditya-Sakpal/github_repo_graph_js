// Utility functions to transform API data into component-specific formats
import { ApiDataItem } from "@/services/api";

// Type definitions for component data
export interface Entry {
  id: string;
  name: string;
  phone: string;
  city: string;
  status: "Registered" | "Verified" | "Pending" | "Rejected";
  date: string;
  email?: string;
  code?: string;
  isWinner?: boolean;
}

export interface Winner {
  id: string;
  name: string;
  phone: string;
  city: string;
  email?: string;
}

export interface ChartData {
  daily: { date: string; count: number }[];
  city: { name: string; value: number }[];
  performance: { contest: string; value: number }[];
}

export interface StatsData {
  registrations: number;
  codeScansToday: number;
  winnersSelected: Winner[];
}

// Transform API data to Entry format for RecentActivityTable
export const transformToEntries = (apiData: ApiDataItem[]): Entry[] => {
  console.log('Transforming entries, input data:', apiData);
  const result = apiData.map((item) => ({
    id: item._id,
    name: item.name,
    phone: item.phone.toString(),
    city: item.city,
    status: item.user_registered === "yes" ? "Registered" : "Pending",
    date: new Date(item.sysLocDate).toLocaleDateString(),
    email: item.email,
    code: item.code,
    isWinner: false, // Default to false, can be updated based on business logic
  }));
  console.log('Transformed entries result:', result);
  return result;
};

// Transform API data to chart data
export const transformToChartData = (apiData: ApiDataItem[]): ChartData => {
  console.log('Transforming chart data, input data:', apiData);
  
  // Daily registrations chart
  const dailyMap = new Map<string, number>();
  apiData.forEach((item) => {
    const date = new Date(item.sysLocDate).toLocaleDateString();
    dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
  });
  
  const daily = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // City-wise participation chart
  const cityMap = new Map<string, number>();
  apiData.forEach((item) => {
    cityMap.set(item.city, (cityMap.get(item.city) || 0) + 1);
  });
  
  const city = Array.from(cityMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10); // Top 10 cities

  // Contest performance (mock data based on codes)
  const codeMap = new Map<string, number>();
  apiData.forEach((item) => {
    const code = item.code.toUpperCase();
    codeMap.set(code, (codeMap.get(code) || 0) + 1);
  });
  
  const performance = Array.from(codeMap.entries())
    .map(([contest, value]) => ({ contest, value }))
    .sort((a, b) => b.value - a.value);

  const result = { daily, city, performance };
  console.log('Transformed chart data result:', result);
  return result;
};

// Transform API data to stats data
export const transformToStatsData = (apiData: ApiDataItem[], winners: Winner[] = []): StatsData => {
  console.log('Transforming stats data, input data:', apiData, 'winners:', winners);
  
  const registrations = apiData.filter(item => item.user_registered === "yes").length;
  
  // Calculate code scans today (registrations that happened today)
  const today = new Date();
  const todayDateString = today.toDateString(); // Gets "Wed Sep 10 2025" format
  
  const codeScansToday = apiData.filter(item => {
    const itemDate = new Date(item.sysLocDate);
    return itemDate.toDateString() === todayDateString;
  }).length;

  const result = {
    registrations,
    codeScansToday,
    winnersSelected: winners,
  };
  
  console.log('Transformed stats data result:', result);
  return result;
};

// Get unique cities from API data
export const getUniqueCities = (apiData: ApiDataItem[]): string[] => {
  const cities = new Set(apiData.map(item => item.city));
  return Array.from(cities).sort();
};

// Get registration count by status
export const getRegistrationStats = (apiData: ApiDataItem[]) => {
  const stats = {
    total: apiData.length,
    registered: 0,
    pending: 0,
  };

  apiData.forEach(item => {
    if (item.user_registered === "yes") {
      stats.registered++;
    } else {
      stats.pending++;
    }
  });

  return stats;
};
