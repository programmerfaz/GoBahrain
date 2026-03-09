import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@gobahrain_saved_places';

const SavedPlacesContext = createContext(null);

export function SavedPlacesProvider({ children }) {
  const [saved, setSavedState] = useState([]);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const list = raw ? JSON.parse(raw) : [];
      setSavedState(Array.isArray(list) ? list : []);
    } catch {
      setSavedState([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (list) => {
    setSavedState(list);
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('[SavedPlaces] save failed', e?.message);
    }
  }, []);

  const add = useCallback((place) => {
    const id = place.client_a_uuid || place.id || `${place.name}-${place.lat}-${place.lng}`;
    const entry = {
      id,
      name: place.name || place.business_name || 'Spot',
      lat: place.lat,
      lng: place.lng ?? place.long,
      client_a_uuid: place.client_a_uuid || place.id,
    };
    setSavedState((prev) => {
      if (prev.some((p) => p.id === id)) return prev;
      const next = [...prev, entry];
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const remove = useCallback((id) => {
    setSavedState((prev) => {
      const next = prev.filter((p) => p.id !== id);
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const isSaved = useCallback(
    (place) => {
      const id = place?.client_a_uuid || place?.id || (place?.name && place?.lat ? `${place.name}-${place.lat}-${place.lng}` : null);
      return id ? saved.some((p) => p.id === id) : false;
    },
    [saved]
  );

  const toggle = useCallback(
    (place) => {
      const id = place?.client_a_uuid || place?.id || (place?.name && place?.lat ? `${place.name}-${place.lat}-${place.lng}` : null);
      if (!id) return;
      if (saved.some((p) => p.id === id)) remove(id);
      else add(place);
    },
    [saved, add, remove]
  );

  const savedIds = React.useMemo(() => new Set(saved.map((p) => p.id)), [saved]);

  return (
    <SavedPlacesContext.Provider
      value={{
        saved,
        savedIds,
        add,
        remove,
        isSaved,
        toggle,
        refresh: load,
      }}
    >
      {children}
    </SavedPlacesContext.Provider>
  );
}

export function useSavedPlaces() {
  const ctx = useContext(SavedPlacesContext);
  if (!ctx) return { saved: [], savedIds: new Set(), add: () => {}, remove: () => {}, isSaved: () => false, toggle: () => {}, refresh: () => {} };
  return ctx;
}
