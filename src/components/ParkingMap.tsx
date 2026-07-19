'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ParkingSpot } from '@/lib/types';

/**
 * MapController handles programmatic camera movements.
 * We use map.stop() to ensure no overlapping animations cause AbortErrors
 * during rapid state updates.
 */
function MapController({ center }: { center: [number, number] }) {
  const map = useMap();
  const lastCenter = useRef<string>(JSON.stringify(center));

  useEffect(() => {
    const centerStr = JSON.stringify(center);
    if (map && centerStr !== lastCenter.current) {
      lastCenter.current = centerStr;
      // Stop current animations to prevent AbortErrors
      map.stop();
      map.setView(center, map.getZoom(), {
        animate: true,
        duration: 0.5
      });
    }
  }, [center, map]);
  
  return null;
}

interface ParkingMapProps {
  mapCenter: [number, number];
  userLocation: [number, number] | null;
  filteredSpots: ParkingSpot[];
  selectedSpotId: string | null;
  onSpotSelect: (spot: ParkingSpot) => void;
}

export default function ParkingMap({
  mapCenter,
  userLocation,
  filteredSpots,
  selectedSpotId,
  onSpotSelect,
}: ParkingMapProps) {
  const [isReady, setIsReady] = useState(false);
  
  const spotIcon = useMemo(() => {
    return new L.DivIcon({
      className: 'custom-div-icon',
      html: `
        <div class="w-10 h-10 flex items-center justify-center bg-primary rounded-full border-2 border-white shadow-[0_0_15px_rgba(128,123,255,0.6)] text-primary-foreground transform transition-all duration-300 hover:scale-125">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6">
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
            <circle cx="7" cy="17" r="2"/>
            <path d="M9 17h6"/>
            <circle cx="17" cy="17" r="2"/>
          </svg>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
  }, []);

  const userIcon = useMemo(() => {
    return new L.DivIcon({
      className: 'user-div-icon',
      html: `
        <div class="relative">
          <div class="absolute -inset-4 bg-primary/20 rounded-full animate-ping"></div>
          <div class="w-6 h-6 bg-white border-2 border-primary rounded-full shadow-2xl flex items-center justify-center relative z-10">
            <div class="w-3 h-3 bg-primary rounded-full"></div>
          </div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }, []);

  return (
    <div className="h-full w-full relative bg-[#05050a]">
      <MapContainer 
        center={mapCenter} 
        zoom={15} 
        scrollWheelZoom={true}
        zoomControl={false}
        className="h-full w-full"
        whenReady={() => setIsReady(true)}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapController center={mapCenter} />

        {isReady && (
          <>
            {userLocation && (
              <Marker 
                key="user-position"
                position={userLocation} 
                icon={userIcon} 
                zIndexOffset={1000}
              />
            )}

            {filteredSpots.map((spot) => (
              <Marker 
                key={`spot-${spot.id}`} 
                position={[spot.lat, spot.lng]} 
                icon={spotIcon}
                eventHandlers={{
                  click: () => onSpotSelect(spot),
                }}
              />
            ))}
          </>
        )}
      </MapContainer>
    </div>
  );
}
