import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

export async function uploadTripMedia(
  tripId: string,
  stopId: string,
  file: File
): Promise<{ storagePath: string; url: string }> {
  const storagePath = `trips/${tripId}/${stopId}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, {
    cacheControl: 'public, max-age=31536000',
  });
  const url = await getDownloadURL(storageRef);
  return { storagePath, url };
}

export async function deleteTripMedia(storagePath: string): Promise<void> {
  const storageRef = ref(storage, storagePath);
  await deleteObject(storageRef);
}

export async function uploadGpx(routeId: string, file: File): Promise<{ storagePath: string }> {
  const storagePath = `routes/${routeId}/${file.name}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType: 'application/gpx+xml' });
  return { storagePath };
}
