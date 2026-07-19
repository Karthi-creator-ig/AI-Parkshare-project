'use client';

import { useEffect, useState } from 'react';
import { 
  Query, 
  onSnapshot, 
  QuerySnapshot, 
  DocumentData,
  CollectionReference 
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export function useCollection<T = DocumentData>(query: Query<T> | null) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!query) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      query,
      (snapshot: QuerySnapshot<T>) => {
        const items = snapshot.docs.map((doc) => ({
          ...doc.data(),
          id: doc.id,
        } as T & { id: string }));
        setData(items);
        setLoading(false);
      },
      async (err) => {
        // Attempt to extract the path for a better error message in the overlay
        let path = 'unknown collection';
        if (query instanceof CollectionReference) {
          path = query.path;
        } else if ((query as any)._query?.path) {
          // Internal path access for better developer experience
          path = (query as any)._query.path.toString();
        }

        const permissionError = new FirestorePermissionError({
          path: path,
          operation: 'list',
        });
        
        // Emit the error to the global listener for visual reporting
        errorEmitter.emit('permission-error', permissionError);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [query]);

  return { data, loading, error };
}