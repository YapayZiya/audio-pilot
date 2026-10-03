import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Destination, RouteInfo, RoutePoint } from '../models/types';
import { OsmMapBackground } from '../components/OsmMapBackground';
import { RouteService, haversineDistance } from '../services/routeService';

interface RouteSelectScreenProps {
  startPosition: RoutePoint;
  onReady: (route: RouteInfo | null, destination: Destination | null) => void;
}

export const RouteSelectScreen: React.FC<RouteSelectScreenProps> = ({ startPosition, onReady }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Destination[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Destination | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RouteInfo | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const formatDistance = (meters: number): string => {
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)} m`;
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.max(1, Math.round(seconds / 60));
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h} sa ${m} dk`;
    }
    return `${mins} dk`;
  };

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const found = await RouteService.searchDestinations(trimmed, 20);
      const sorted = found
        .map((d) => ({
          ...d,
          distanceFromUser: haversineDistance(startPosition.latitude, startPosition.longitude, d.latitude, d.longitude),
        }))
        .sort((a, b) => a.distanceFromUser - b.distanceFromUser);
      setResults(sorted);
      if (sorted.length === 0) setSearchError('Sonuç bulunamadı.');
    } catch (error) {
      console.error('Destination search failed:', error);
      setSearchError('Arama başarısız oldu. Bağlantınızı kontrol edin.');
    } finally {
      setSearching(false);
    }
  }, [startPosition.latitude, startPosition.longitude]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(query);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const selectDestination = async (destination: Destination) => {
    setSelected(destination);
    setRouteError(null);
    setPreview(null);
    setRouteLoading(true);
    try {
      const route = await RouteService.fetchRoute(startPosition, destination);
      setPreview(route);
    } catch (error) {
      console.error('Route preview failed:', error);
      setRouteError('Rota önizlemesi alınamadı.');
    } finally {
      setRouteLoading(false);
    }
  };

  const handleMapTap = async (lat: number, lon: number) => {
    const point: Destination = {
      id: `map_point_${Date.now()}`,
      name: 'Haritadaki nokta',
      latitude: lat,
      longitude: lon,
      kind: 'point',
    };
    setSelected(point);
    setRouteError(null);
    setPreview(null);
    setRouteLoading(true);
    try {
      const route = await RouteService.fetchRoute(startPosition, point);
      setPreview(route);
    } catch (error) {
      console.error('Route preview failed:', error);
      setRouteError('Rota önizlemesi alınamadı.');
    } finally {
      setRouteLoading(false);
    }
  };

  const start = async () => {
    if (!selected || routeLoading) return;
    setRouteLoading(true);
    setRouteError(null);
    try {
      const route = await RouteService.fetchRoute(startPosition, selected);
      onReady(route, selected);
    } catch (error) {
      console.error('Route fetch failed:', error);
      setRouteError('Rota alınamadı. Tekrar deneyin veya hedefsiz sürüşe başlayın.');
      setRouteLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <OsmMapBackground
        latitude={startPosition.latitude}
        longitude={startPosition.longitude}
        opacity={0.9}
        marker={selected}
        onMapTap={handleMapTap}
        route={preview?.coordinates ?? undefined}
      />

      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>VARIŞ NOKTASI</Text>
          <Text style={styles.headerSubtitle}>Arama yapın veya haritaya dokunun</Text>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Varış noktası ara (cadde, yer, şehir)"
            placeholderTextColor="#888"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={() => runSearch(query)}
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.searchButton} onPress={() => runSearch(query)} disabled={searching}>
            {searching ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={styles.searchButtonText}>ARA</Text>}
          </TouchableOpacity>
        </View>

        {searchError ? (
          <Text style={styles.errorText}>{searchError}</Text>
        ) : results.length > 0 ? (
          <ScrollView style={styles.resultsList} showsVerticalScrollIndicator={false}>
            {results.map((result) => (
              <TouchableOpacity
                key={result.id}
                style={[styles.resultRow, selected?.id === result.id && styles.resultRowSelected]}
                onPress={() => selectDestination(result)}
              >
                <View style={styles.resultInfo}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {result.name}
                  </Text>
                  <View style={styles.resultMetaRow}>
                    {result.kind ? <Text style={styles.resultKind}>{result.kind}</Text> : null}
                    <Text style={styles.resultDistance}>
                      {(result as unknown as { distanceFromUser?: number }).distanceFromUser !== undefined
                        ? formatDistance((result as unknown as { distanceFromUser: number }).distanceFromUser)
                        : ''}
                    </Text>
                  </View>
                </View>
                {selected?.id === result.id ? <Text style={styles.resultCheck}>✓</Text> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.footer}>
          {selected ? (
            <Text style={styles.selectedName} numberOfLines={1}>
              ⚑ {selected.name}
            </Text>
          ) : null}

          {preview ? (
            <View style={styles.routePreview}>
              <View style={styles.routePreviewRow}>
                <Text style={styles.routePreviewLabel}>Mesafe</Text>
                <Text style={styles.routePreviewValue}>{formatDistance(preview.totalDistance)}</Text>
              </View>
              <View style={styles.routePreviewDivider} />
              <View style={styles.routePreviewRow}>
                <Text style={styles.routePreviewLabel}>Tahmini Süre</Text>
                <Text style={styles.routePreviewValue}>{formatDuration(preview.totalDuration)}</Text>
              </View>
            </View>
          ) : null}

          {routeLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#FFF" />
              <Text style={styles.loadingText}>Rota hesaplanıyor...</Text>
            </View>
          ) : null}

          {routeError ? <Text style={styles.errorText}>{routeError}</Text> : null}

          <TouchableOpacity
            style={[styles.startButton, (!selected || routeLoading) && styles.startButtonDisabled]}
            onPress={start}
            disabled={!selected || routeLoading}
          >
            <Text style={styles.startButtonText}>YOLA ÇIK</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={() => onReady(null, null)}>
            <Text style={styles.skipButtonText}>Hedef seçmeden sür (geçici viraj izleme)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 30,
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 2,
  },
  headerSubtitle: {
    color: '#AAA',
    fontSize: 13,
    marginTop: 4,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    borderRadius: 14,
    paddingHorizontal: 16,
    color: '#FFF',
    fontSize: 15,
    height: 48,
  },
  searchButton: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  searchButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  resultsList: {
    marginTop: 10,
    maxHeight: 240,
  },
  resultRow: {
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultRowSelected: {
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  resultInfo: {
    flex: 1,
  },
  resultMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  resultName: {
    color: '#FFF',
    fontSize: 14,
  },
  resultKind: {
    color: '#888',
    fontSize: 11,
  },
  resultDistance: {
    color: '#007AFF',
    fontSize: 11,
    fontWeight: '600',
  },
  resultCheck: {
    color: '#007AFF',
    fontSize: 18,
    fontWeight: '700',
  },
  errorText: {
    color: '#FF6B5E',
    fontSize: 13,
    marginTop: 10,
  },
  routePreview: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  routePreviewRow: {
    alignItems: 'center',
  },
  routePreviewLabel: {
    color: '#888',
    fontSize: 11,
  },
  routePreviewValue: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  routePreviewDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    width: '100%',
  },
  selectedName: {
    color: '#FFCC00',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  loadingText: {
    color: '#CCC',
    fontSize: 14,
  },
  startButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 60,
    borderRadius: 30,
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },
  skipButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  skipButtonText: {
    color: '#AAA',
    fontSize: 13,
  },
});
