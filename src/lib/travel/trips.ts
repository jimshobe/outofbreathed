import {
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, updateDoc,
  query, orderBy, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Trip, TripStop, TripMedia, StandaloneLocation, SocialLink, Route } from '../../types/travel';

// ── Trips ────────────────────────────────────────────────────────────────────

export async function getPublishedTrips(): Promise<Trip[]> {
  const snap = await getDocs(query(collection(db, 'trips'), orderBy('startDate', 'desc')));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Trip))
    .filter((t) => t.published);
}

export async function getAllTrips(): Promise<Trip[]> {
  const snap = await getDocs(query(collection(db, 'trips'), orderBy('startDate', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Trip));
}

export async function saveTrip(tripId: string, data: Partial<Trip>, isNew: boolean): Promise<void> {
  const payload: Record<string, any> = { ...data, updatedAt: serverTimestamp() };
  if (isNew) payload.createdAt = serverTimestamp();
  await setDoc(doc(db, 'trips', tripId), payload, { merge: true });
}

export async function deleteTrip(tripId: string): Promise<void> {
  await deleteDoc(doc(db, 'trips', tripId));
}

// ── Stops ────────────────────────────────────────────────────────────────────

export async function getTripStops(tripId: string): Promise<TripStop[]> {
  const snap = await getDocs(
    query(collection(db, 'trips', tripId, 'stops'), orderBy('order', 'asc'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TripStop));
}

export async function saveStop(
  tripId: string,
  stopId: string,
  data: Partial<TripStop>,
  isNew: boolean
): Promise<void> {
  const payload: Record<string, any> = { ...data, tripId, updatedAt: serverTimestamp() };
  if (isNew) payload.createdAt = serverTimestamp();
  await setDoc(doc(db, 'trips', tripId, 'stops', stopId), payload, { merge: true });
}

export async function deleteStop(tripId: string, stopId: string): Promise<void> {
  await deleteDoc(doc(db, 'trips', tripId, 'stops', stopId));
}

// ── Media ────────────────────────────────────────────────────────────────────

export async function getStopMedia(tripId: string, stopId: string): Promise<TripMedia[]> {
  const snap = await getDocs(
    query(collection(db, 'trips', tripId, 'stops', stopId, 'media'), orderBy('order', 'asc'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TripMedia));
}

export async function saveMedia(
  tripId: string,
  stopId: string,
  mediaId: string,
  data: Omit<TripMedia, 'id'>
): Promise<void> {
  await setDoc(doc(db, 'trips', tripId, 'stops', stopId, 'media', mediaId), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function deleteMedia(tripId: string, stopId: string, mediaId: string): Promise<void> {
  await deleteDoc(doc(db, 'trips', tripId, 'stops', stopId, 'media', mediaId));
}

// ── Standalone Locations ─────────────────────────────────────────────────────

export async function getStandaloneLocations(): Promise<StandaloneLocation[]> {
  const snap = await getDocs(query(collection(db, 'standalone_locations'), orderBy('date', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as StandaloneLocation));
}

// ── Social Links ─────────────────────────────────────────────────────────────

export async function getSocialLinks(): Promise<SocialLink[]> {
  const snap = await getDocs(collection(db, 'social_links'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SocialLink));
}

export async function saveSocialLink(
  id: string,
  data: Partial<SocialLink>,
  isNew: boolean
): Promise<void> {
  const payload: Record<string, any> = { ...data };
  if (isNew) payload.createdAt = serverTimestamp();
  await setDoc(doc(db, 'social_links', id), payload, { merge: true });
}

export async function deleteSocialLink(id: string): Promise<void> {
  await deleteDoc(doc(db, 'social_links', id));
}

// ── Routes ───────────────────────────────────────────────────────────────────

export async function getRoutes(): Promise<Route[]> {
  const snap = await getDocs(query(collection(db, 'routes'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Route));
}

export async function saveRoute(routeId: string, data: Omit<Route, 'id' | 'createdAt'>): Promise<void> {
  await setDoc(doc(db, 'routes', routeId), { ...data, createdAt: serverTimestamp() });
}

export async function deleteRoute(routeId: string): Promise<void> {
  await deleteDoc(doc(db, 'routes', routeId));
}

export function newRouteId(): string {
  return doc(collection(db, 'routes')).id;
}
