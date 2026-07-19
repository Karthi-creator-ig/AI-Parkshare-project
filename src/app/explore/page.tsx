"use client";

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  MapPin, 
  Loader2, 
  Menu,
  X,
  LocateFixed,
  PlusCircle,
  Car,
  Navigation,
  ArrowRight
} from "lucide-react";
import Link from 'next/link';
import Image from 'next/image';
import { ParkingSpot } from '@/lib/types';
import { calculateDistance } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useCollection, useFirestore, useAuth, useUser } from '@/firebase';
import { collection } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PlaceHolderImages } from '@/lib/placeholder-images';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ParkingMap = dynamic(() => import('@/components/ParkingMap'), { 
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center bg-[#05050a]"><Loader2 className="animate-spin text-primary w-12 h-12" /></div>
});

const TAMBARAM_COORDS: [number, number] = [12.9249, 80.1000];

export default function FindParkingPage() {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(TAMBARAM_COORDS);
  const [filterRadius, setFilterRadius] = useState<number | null>(null);
  const [showList, setShowList] = useState(true);
  const [isLocating, setIsLocating] = useState(false);
  
  const { toast } = useToast();
  const db = useFirestore();
  const auth = useAuth();
  const { user } = useUser();

  const fallbackImage = PlaceHolderImages[0].imageUrl;

  const spotsQuery = useMemo(() => collection(db, 'spots'), [db]);
  const { data: spots, loading: spotsLoading } = useCollection<ParkingSpot>(spotsQuery);

  useEffect(() => { setMounted(true); }, []);

  const handleSignOut = async () => { try { await signOut(auth); } catch (e) { console.error(e); } };

  const handleLocateMe = (targetRadius?: number) => {
    setIsLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const loc: [number, number] = [p.coords.latitude, p.coords.longitude];
          setUserLocation(loc);
          setMapCenter(loc);
          if (targetRadius) {
            setFilterRadius(targetRadius);
          }
          setIsLocating(false);
          toast({
            title: "Geolocation Sync Complete",
            description: targetRadius ? `Displaying assets within ${targetRadius}km.` : "Your position has been pinned on the grid.",
          });
        },
        () => { 
          setIsLocating(false); 
          toast({
            title: "GPS Error",
            description: "Please enable location services to use precision filters.",
            variant: "destructive"
          });
        }
      );
    } else { setIsLocating(false); }
  };

  const toggleRadiusFilter = (radius: number) => {
    if (filterRadius === radius) {
      setFilterRadius(null);
    } else if (userLocation) {
      setFilterRadius(radius);
    } else {
      handleLocateMe(radius);
    }
  };

  const filteredSpots = useMemo(() => {
    if (!spots) return [];
    return spots.filter(spot => {
      const matchesSearch = spot.name.toLowerCase().includes(searchQuery.toLowerCase()) || spot.address.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (filterRadius && userLocation) {
        return calculateDistance(userLocation[0], userLocation[1], spot.lat, spot.lng) <= filterRadius;
      }
      return true;
    });
  }, [spots, searchQuery, filterRadius, userLocation]);

  if (!mounted) return <div className="h-screen flex items-center justify-center bg-[#05050a]"><Loader2 className="animate-spin text-primary w-12 h-12" /></div>;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#05050a]">
      <div className="absolute inset-0 z-0">
        <ParkingMap 
          mapCenter={mapCenter} 
          userLocation={userLocation} 
          filteredSpots={filteredSpots} 
          selectedSpotId={selectedSpot?.id || null} 
          onSpotSelect={(s) => { 
            setSelectedSpot(s); 
            setMapCenter([s.lat, s.lng]); 
            if (window.innerWidth < 768) setShowList(false);
          }} 
        />
      </div>

      <nav className="absolute top-6 left-6 right-6 z-[1000] flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 glass-morphism px-5 py-3 rounded-2xl border-primary/30 shadow-2xl group transition-all">
            <Car className="text-primary w-6 h-6 group-hover:scale-110 transition-transform" strokeWidth={3} />
            <span className="font-headline font-black text-xl text-white hidden sm:block tracking-tighter uppercase">ParkShare</span>
          </Link>
          <div className="relative w-40 sm:w-80 md:w-[28rem] glass-morphism rounded-2xl border-white/10 overflow-hidden shadow-2xl transition-all focus-within:border-primary/50">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search Grid..." className="pl-12 h-12 sm:h-14 bg-transparent border-none text-white font-medium placeholder:text-muted-foreground/50 placeholder:font-black placeholder:uppercase placeholder:text-[10px] placeholder:tracking-widest" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <Button className="hidden md:flex h-14 px-8 bg-primary text-primary-foreground font-black rounded-2xl gap-3 shadow-[0_8px_30px_rgba(128,123,255,0.3)] active:scale-95 transition-all" asChild>
            <Link href="/host">
              <PlusCircle className="w-5 h-5" />
              Host Asset
            </Link>
          </Button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-12 sm:h-14 w-12 sm:w-14 rounded-2xl p-0 glass-morphism overflow-hidden border border-white/10 shadow-2xl group active:scale-95 transition-all">
                  <Avatar className="h-full w-full rounded-none">
                    <AvatarImage src={user.photoURL || ''} className="group-hover:scale-110 transition-transform duration-500" />
                    <AvatarFallback className="bg-primary/20 text-primary font-black">{user.displayName?.charAt(0)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-morphism text-white border-white/10 w-56 rounded-2xl mt-2 p-2">
                <DropdownMenuItem asChild className="md:hidden font-black text-[10px] uppercase tracking-widest"><Link href="/host">Host Asset</Link></DropdownMenuItem>
                <DropdownMenuItem asChild className="font-black text-[10px] uppercase tracking-widest"><Link href="/dashboard">Dashboard</Link></DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive font-black text-[10px] uppercase tracking-widest hover:bg-destructive/10">Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button className="h-12 sm:h-14 px-8 bg-primary text-primary-foreground font-black rounded-2xl shadow-2xl active:scale-95 transition-all" asChild><Link href="/login">Initialize</Link></Button>
          )}
        </div>
      </nav>

      <div className="absolute bottom-10 right-6 z-[1000] flex flex-col gap-5">
        <div className="flex flex-col gap-3">
           <Button 
            variant="secondary" 
            size="sm" 
            className={`glass-morphism h-12 w-14 rounded-xl text-[10px] font-black tracking-widest shadow-2xl transition-all active:scale-95 ${filterRadius === 2 ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_20px_rgba(128,123,255,0.4)]' : 'text-white border-white/10'}`}
            onClick={() => toggleRadiusFilter(2)}
           >
             2KM
           </Button>
           <Button 
            variant="secondary" 
            size="sm" 
            className={`glass-morphism h-12 w-14 rounded-xl text-[10px] font-black tracking-widest shadow-2xl transition-all active:scale-95 ${filterRadius === 5 ? 'bg-primary text-primary-foreground border-primary shadow-[0_0_20px_rgba(128,123,255,0.4)]' : 'text-white border-white/10'}`}
            onClick={() => toggleRadiusFilter(5)}
           >
             5KM
           </Button>
        </div>
        
        <Button variant="secondary" size="icon" className="glass-morphism h-14 w-14 rounded-2xl shadow-2xl border-white/10 active:scale-90 transition-all" onClick={() => handleLocateMe()}>
          {isLocating ? <Loader2 className="animate-spin text-primary w-6 h-6" /> : <LocateFixed className={`w-6 h-6 ${userLocation ? 'text-primary drop-shadow-[0_0_8px_rgba(128,123,255,0.6)]' : 'text-white'}`} />}
        </Button>
        <Button variant="secondary" size="icon" className={`glass-morphism h-14 w-14 rounded-2xl shadow-2xl active:scale-90 transition-all ${showList ? 'bg-primary border-primary text-primary-foreground' : 'text-white border-white/10'}`} onClick={() => setShowList(!showList)}>{showList ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}</Button>
      </div>

      {showList && (
        <div className="absolute top-24 sm:top-28 left-6 bottom-10 w-80 sm:w-96 hidden sm:flex flex-col gap-4 z-[1000] animate-in slide-in-from-left-6 duration-500">
          <Card className="glass-morphism border-white/10 flex-1 flex flex-col overflow-hidden rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
              <h2 className="text-[10px] font-black text-white uppercase tracking-[0.3em] opacity-80">Market Grid</h2>
              {filterRadius && <Badge className="bg-primary/20 text-primary border-primary/20 text-[8px] font-black tracking-widest">{filterRadius}KM RADIAL</Badge>}
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              {filteredSpots.length > 0 ? filteredSpots.map((spot) => (
                <div 
                  key={spot.id} 
                  onClick={() => { setSelectedSpot(spot); setMapCenter([spot.lat, spot.lng]); }} 
                  className={`p-4 rounded-[1.5rem] cursor-pointer border transition-all duration-300 group ${selectedSpot?.id === spot.id ? 'bg-primary/20 border-primary shadow-[0_0_20px_rgba(128,123,255,0.15)]' : 'bg-white/5 border-white/5 hover:border-white/20'}`}
                >
                  <div className="flex gap-4">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 relative border border-white/10 group-hover:scale-105 transition-transform">
                      <Image src={spot.imageUrls?.[0] || fallbackImage} alt={spot.name} fill className="object-cover" />
                      {spot.verified && <div className="absolute bottom-1 right-1 bg-primary p-1 rounded-md shadow-lg"><ShieldCheck className="w-2.5 h-2.5 text-white" /></div>}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
                      <div>
                        <h3 className="text-sm font-black text-white truncate tracking-tight">{spot.name}</h3>
                        <p className="text-[10px] text-muted-foreground font-bold truncate mt-1 leading-none uppercase tracking-tight"><MapPin className="w-2.5 h-2.5 inline mr-1 text-primary opacity-60" />{spot.address}</p>
                      </div>
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-xs font-black text-primary uppercase">₹{spot.carPricePerHour}<span className="text-[8px] opacity-60 ml-0.5">/HR</span></span>
                        {userLocation && (
                          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                            {calculateDistance(userLocation[0], userLocation[1], spot.lat, spot.lng).toFixed(1)}km
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="py-20 text-center flex flex-col items-center gap-4">
                   <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/5"><Search className="w-6 h-6 opacity-20" /></div>
                   <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest opacity-60">No active assets in area.</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {selectedSpot && (
        <div className="absolute bottom-28 left-6 right-24 sm:left-auto sm:right-28 sm:w-[28rem] z-[1000] animate-in slide-in-from-bottom-8 duration-500">
          <Card className="glass-morphism border-primary/40 rounded-[2rem] overflow-hidden shadow-[0_20px_80px_rgba(0,0,0,0.6)] group">
            <CardContent className="p-5 flex gap-5">
              <div className="relative w-32 h-32 rounded-[1.5rem] overflow-hidden shrink-0 border border-white/10 shadow-2xl group-hover:scale-[1.02] transition-transform duration-500">
                <Image src={selectedSpot.imageUrls?.[0] || fallbackImage} alt={selectedSpot.name} fill className="object-cover" />
                {selectedSpot.verified && <div className="absolute top-2 left-2 bg-primary px-2 py-0.5 rounded-lg shadow-2xl font-black text-[8px] text-white uppercase tracking-widest">Verified</div>}
              </div>
              <div className="flex-1 flex flex-col justify-between py-1">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-headline font-black text-xl leading-tight text-white tracking-tighter uppercase truncate">{selectedSpot.name}</h3>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-white/5 hover:bg-white/10 active:scale-90" onClick={() => setSelectedSpot(null)}><X className="w-4 h-4" /></Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground font-bold mt-2 leading-none uppercase tracking-tight flex items-center gap-1.5"><MapPin className="w-3 h-3 text-primary opacity-60" />{selectedSpot.address}</p>
                </div>
                <div className="flex items-center justify-between pt-4">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">Pricing Model</span>
                    <span className="text-primary font-black text-2xl tracking-tighter">₹{selectedSpot.carPricePerHour}<span className="text-[10px] opacity-70 ml-1">/HR</span></span>
                  </div>
                  <Link href={`/spot/${selectedSpot.id}`}>
                    <Button className="bg-primary text-primary-foreground font-black px-8 h-12 rounded-xl shadow-2xl shadow-primary/30 active:scale-95 transition-all uppercase tracking-widest text-[10px] gap-2">
                      Access Portal
                      <ArrowRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
