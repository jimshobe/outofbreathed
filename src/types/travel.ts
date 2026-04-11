import type { Timestamp } from 'firebase/firestore';

export interface Trip {
  id: string;
  name: string;
  description: string;
  startDate: Timestamp;
  endDate: Timestamp;
  published: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TripStop {
  id: string;
  tripId: string;
  name: string;
  lat: number;
  lng: number;
  date: Timestamp;
  order: number;
  notes: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TripMedia {
  id: string;
  stopId: string;
  tripId: string;
  storagePath: string;
  url: string;
  kind: 'image' | 'video';
  alt: string;
  order: number;
  createdAt: Timestamp;
}

export interface StandaloneLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  date: Timestamp;
  notes: string | null;
  createdAt: Timestamp;
}

export interface SocialLink {
  id: string;
  platform: 'bluesky' | 'mastodon';
  postUri: string;
  tripId: string | null;
  stopId: string | null;
  locationId: string | null;
  categories: string[];
  createdAt: Timestamp;
}

// JSON-safe versions (Timestamps serialized to ISO strings) for passing to React islands
export interface TripJSON {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  published: boolean;
}

export interface TripStopJSON {
  id: string;
  tripId: string;
  name: string;
  lat: number;
  lng: number;
  date: string;
  order: number;
  notes: string | null;
}

export interface RouteCoord {
  lat: number;
  lng: number;
}

export interface Route {
  id: string;
  name: string;
  gpxStoragePath: string;
  coordinates: RouteCoord[];
  pointCount: number;
  createdAt: Timestamp;
}

export interface RouteJSON {
  id: string;
  name: string;
  coordinates: RouteCoord[];
}
