// Centralized API service for fetching data from the single endpoint

export interface ApiDataItem {
  _id: string;
  name: string;
  phone: number;
  email: string;
  city: string;
  code: string;
  user_registered: string;
  sysLocDate: string;
  sysLocStatus: boolean;
  datasourceId: string;
  ratingAvg: number;
  ratingCount: number;
  sysLocMedia: any[];
  __v: number;
}

export interface ApiResponse {
  success: boolean;
  data: ApiDataItem[];
  fields: Array<{
    name: string;
    col_type: string;
  }>;
}

const API_ENDPOINT = 'https://cloud.botspice.com/api/datalake/fetchData/68bac092dbaf606a5e77594b';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjaGF0Ym90Ijp7ImlkIjoiNjhiYWIyYzBkYmFmNjA2YTVlNzZmNDgyIiwidXJsQm90Ijp0cnVlLCJsb2dpblJlcXVpcmVkIjpmYWxzZSwicHVibGlzaFR5cGUiOiJ1cmwiLCJjcmVhdGVkQnkiOiI2OGJhN2E1MWRiYWY2MDZhNWU3NTlmY2IiLCJudW0iOiI2OGJhN2E1MWRiYWY2MDZhNWU3NTlmYzYifSwic3ViIjoiNjhiYWIyYzBkYmFmNjA2YTVlNzZmNDgyIiwiaWF0IjoxNzU3NDQyOTgzLCJleHAiOjE3NjQzNTQ5ODN9.R-5_NAfMtSGt_hE47EIyOhsVs25tuTMKeIXlbmhNXPE';

export const fetchAllData = async (): Promise<ApiResponse> => {
  try {
    console.log('Starting API call to:', API_ENDPOINT);
    const response = await fetch(API_ENDPOINT, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    console.log("API Response status:", response.status, response.statusText);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: ApiResponse = await response.json();
    console.log("API Response data:", data);
    
    if (!data.success) {
      throw new Error('API returned success: false');
    }

    console.log("API call successful, returning data with", data.data.length, "items");
    return data;
  } catch (error) {
    console.error('Error fetching data from API:', error);
    throw error;
  }
};
