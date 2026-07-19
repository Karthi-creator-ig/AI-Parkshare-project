"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Camera, 
  CheckCircle2, 
  Loader2, 
  Sparkles, 
  Plus, 
  Clock, 
  LogOut, 
  IndianRupee,
  LocateFixed,
  X,
  Car,
  Bike,
  Trash2,
  MapPin,
  Ban,
  ShieldCheck,
  TrendingUp,
  Lock,
  Smartphone,
  AlertCircle,
  KeyRound
} from "lucide-react";
import { verifyParkingSpot } from '@/ai/flows/parking-spot-verification';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import Image from 'next/image';
import { useFirestore, useUser, useAuth, useCollection } from '@/firebase';
import { collection, addDoc, serverTimestamp, query, where, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Booking, ParkingSpot } from '@/lib/types';
import { isAfter, differenceInMinutes } from 'date-fns';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const FIXED_BIKE_RATE = 20;
const FIXED_CAR_RATE = 40;
const FIXED_BIKE_MONTHLY = 2500;
const FIXED_CAR_MONTHLY = 5000;
const PLATFORM_FEE = 15;

export default function HostDashboard() {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(1);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [spotData, setSpotData] = useState({
    name: '',
    address: 'Tambaram, Chennai',
    phone: '',
    description: ''
  });
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [aiResult, setAiResult] = useState<{ isValid: boolean, description: string, reason?: string } | null>(null);
  const [now, setNow] = useState(new Date());
  
  const isUpdatingExpiration = useRef<Set<string>>(new Set());

  const { toast } = useToast();
  const db = useFirestore();
  const auth = useAuth();
  const { user } = useUser();

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => setNow(new Date()), 10000); 
    return () => clearInterval(interval);
  }, []);

  const bookingsQuery = useMemo(() => {
    if (!user) return null;
    return query(collection(db, 'bookings'), where('hostId', '==', user.uid));
  }, [db, user]);

  const spotsQuery = useMemo(() => {
    if (!user) return null;
    return query(collection(db, 'spots'), where('ownerId', '==', user.uid));
  }, [db, user]);

  const { data: hostBookings, loading: bookingsLoading } = useCollection<Booking>(bookingsQuery);
  const { data: mySpots, loading: spotsLoading } = useCollection<ParkingSpot>(spotsQuery);

  // Background sync for expired OTPs on Host side
  useEffect(() => {
    if (hostBookings) {
      hostBookings.forEach(booking => {
        if (booking.status === 'pending' && booking.otpExpiresAt && isAfter(now, new Date(booking.otpExpiresAt))) {
          if (!isUpdatingExpiration.current.has(booking.id)) {
            isUpdatingExpiration.current.add(booking.id);
            const bookingRef = doc(db, 'bookings', booking.id);
            updateDoc(bookingRef, { status: 'cancelled' })
              .catch(async () => {
                isUpdatingExpiration.current.delete(booking.id);
                errorEmitter.emit('permission-error', new FirestorePermissionError({
                  path: bookingRef.path,
                  operation: 'update',
                  requestResourceData: { status: 'cancelled' }
                }));
              });
          }
        }
      });
    }
  }, [hostBookings, now, db]);

  const totalEarnings = useMemo(() => {
    return hostBookings?.filter(b => b.status === 'completed').reduce((acc, curr) => acc + (curr.totalAmount || 0), 0) || 0;
  }, [hostBookings]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleGetLocation = () => {
    setIsLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCoordinates({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setIsLocating(false);
          toast({
            title: "Location Captured",
            description: "Asset coordinates verified for Tambaram district.",
          });
        },
        () => {
          setIsLocating(false);
          toast({
            title: "Location Error",
            description: "Please enable GPS to pin your asset.",
            variant: "destructive"
          });
        }
      );
    } else {
      setIsLocating(false);
    }
  };

  const handleCancelRequest = async (bookingId: string) => {
    const bookingRef = doc(db, 'bookings', bookingId);
    updateDoc(bookingRef, { status: 'cancelled' });
    toast({
      title: "Request Declined",
      description: "Renter has been notified.",
    });
  };

  const handleEndSession = async (booking: Booking) => {
    const bookingRef = doc(db, 'bookings', booking.id);
    const endTime = new Date();
    
    const start = new Date(booking.startTime);
    const diffMin = Math.max(60, differenceInMinutes(endTime, start));
    const hours = diffMin / 60;
    
    const baseRate = (booking.bikeCount * FIXED_BIKE_RATE) + (booking.carCount * FIXED_CAR_RATE);
    const finalAmount = booking.isSubscription ? (booking.totalAmount || 0) : (baseRate * hours) + PLATFORM_FEE;

    updateDoc(bookingRef, { 
      status: 'awaiting-payment', 
      endTime: endTime.toISOString(),
      totalAmount: finalAmount
    }).catch(async () => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: bookingRef.path,
        operation: 'update',
        requestResourceData: { status: 'awaiting-payment', endTime: endTime.toISOString(), totalAmount: finalAmount }
      }));
    });

    toast({
      title: "Session Halted",
      description: "Payment portal activated for renter.",
    });
  };

  const handleDeleteSpot = async (spotId: string) => {
    try {
      await deleteDoc(doc(db, 'spots', spotId));
      toast({
        title: "Asset Removed",
        description: "Spot listing successfully deleted.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not remove listing.",
      });
    }
  };

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); 
      };
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const remainingSlots = 4 - imagePreviews.length;
      const filesToProcess = Array.from(files).slice(0, remainingSlots);
      for (const file of filesToProcess) {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const compressed = await compressImage(reader.result as string);
          setImagePreviews(prev => [...prev, compressed].slice(0, 4));
          setAiResult(null);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const removeImage = (index: number) => {
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
    setAiResult(null);
  };

  const handleVerify = async () => {
    if (imagePreviews.length < 4) {
      toast({ title: "Insufficient Data", description: "4 verification photos required.", variant: "destructive" });
      return;
    }
    setIsVerifying(true);
    setAiResult(null);
    try {
      const result = await verifyParkingSpot({ photoDataUris: imagePreviews, location: spotData.address });
      setAiResult({ isValid: result.isValidParking, description: result.description, reason: result.reason });
    } catch (e: any) {
      toast({ title: "AI Scan Failure", description: "Cloud verification failed.", variant: "destructive" });
    } finally { setIsVerifying(false); }
  };

  const handlePublish = () => {
    if (!user) return;
    if (!coordinates) {
      toast({ title: "Geospatial Error", description: "Pin location required.", variant: "destructive" });
      return;
    }
    if (!spotData.phone) {
      toast({ title: "Phone Missing", description: "Contact number required.", variant: "destructive" });
      return;
    }
    setIsPublishing(true);
    const newSpot = {
      ownerId: user.uid,
      ownerName: user.displayName || 'Host',
      name: spotData.name,
      address: spotData.address,
      phone: spotData.phone,
      pricePerHour: FIXED_CAR_RATE,
      bikePricePerHour: FIXED_BIKE_RATE,
      carPricePerHour: FIXED_CAR_RATE,
      bikeMonthlyRate: FIXED_BIKE_MONTHLY,
      carMonthlyRate: FIXED_CAR_MONTHLY,
      imageUrls: imagePreviews,
      status: 'available',
      description: spotData.description || (aiResult?.description || "A secure, verified parking space."),
      lat: coordinates.lat,
      lng: coordinates.lng,
      verified: aiResult?.isValid || false,
      createdAt: serverTimestamp()
    };

    addDoc(collection(db, 'spots'), newSpot)
      .then(() => {
        toast({ title: "Asset Live!", description: "Listing published to marketplace." });
        setStep(1); 
        setImagePreviews([]);
        setCoordinates(null);
        setSpotData({ name: '', address: 'Tambaram, Chennai', phone: '', description: '' });
      })
      .finally(() => setIsPublishing(false));
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-background pt-24 pb-12 px-6">
      <nav className="fixed top-0 w-full z-50 glass-morphism h-16 flex items-center justify-between px-6 md:px-12 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-primary-foreground">
              <Car className="w-5 h-5" />
            </div>
            <span className="font-headline text-xl font-bold tracking-tight text-white">ParkShare Host</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="text-white hover:bg-white/5 hidden sm:flex" asChild><Link href="/explore">Switch to Renter</Link></Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 border border-white/10">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user.photoURL || ''} />
                    <AvatarFallback className="bg-primary/20 text-primary">{user.displayName?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="glass-morphism border-white/10 text-white w-56">
                <DropdownMenuItem asChild className="sm:hidden"><Link href="/explore">Renter Mode</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/dashboard">Dashboard</Link></DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive hover:bg-destructive/10"><LogOut className="mr-2 h-4 w-4" /> Sign Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild className="rounded-xl"><Link href="/login">Sign In</Link></Button>
          )}
        </div>
      </nav>

      {user ? (
        <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in duration-1000">
          <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
            <div>
              <h1 className="text-4xl sm:text-6xl font-headline font-black text-white tracking-tighter mb-2">Host Hub</h1>
              <p className="text-muted-foreground font-medium text-lg">Managing verified assets in Tambaram District.</p>
            </div>
            <div className="flex gap-4 w-full sm:w-auto">
              <div className="flex-1 sm:flex-initial px-8 py-6 rounded-[2rem] bg-primary/10 border border-primary/20 text-primary flex flex-col items-center shadow-2xl">
                <span className="text-[10px] uppercase font-black tracking-[0.2em] opacity-60 mb-2">Total Earnings</span>
                <span className="text-3xl font-black flex items-center gap-2"><IndianRupee className="w-6 h-6" /> {totalEarnings.toFixed(2)}</span>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-12">
              <Tabs defaultValue="create" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-white/5 p-1 rounded-2xl border border-white/5">
                  <TabsTrigger value="create" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-black text-[10px] tracking-widest uppercase py-3">Asset Setup</TabsTrigger>
                  <TabsTrigger value="listings" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-black text-[10px] tracking-widest uppercase py-3">Portfolio ({mySpots?.length || 0})</TabsTrigger>
                </TabsList>
                
                <TabsContent value="create" className="mt-8">
                  <Card className="glass-morphism border-primary/20 bg-primary/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
                    <CardHeader className="border-b border-white/5 bg-white/5 py-10 px-8">
                       <CardTitle className="text-white font-headline text-2xl font-black flex items-center gap-4 uppercase tracking-tight">
                          <Plus className="w-8 h-8 text-primary" strokeWidth={3} /> Listing Forge
                       </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-10 px-8 pb-10 space-y-10">
                      {step === 1 ? (
                        <div className="space-y-10">
                          <div className="space-y-6">
                            <div className="flex justify-between items-end">
                              <Label className="text-white font-black text-xs uppercase tracking-widest opacity-80">Visual Data (4 Required)</Label>
                              <Badge className="bg-primary/20 text-primary border-primary/20 font-black text-[10px]">{imagePreviews.length}/4</Badge>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {imagePreviews.map((src, idx) => (
                                <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border border-white/10 group shadow-lg">
                                  <Image src={src} alt={`Asset Frame ${idx + 1}`} fill className="object-cover group-hover:scale-110 transition-transform duration-500" />
                                  <button onClick={() => removeImage(idx)} className="absolute top-2 right-2 p-2 bg-destructive/90 backdrop-blur-md rounded-xl opacity-0 group-hover:opacity-100 transition-opacity active:scale-90"><X className="w-3.5 h-3.5 text-white" /></button>
                                </div>
                              ))}
                              {imagePreviews.length < 4 && (
                                <div className="aspect-square border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center cursor-pointer bg-white/5 hover:border-primary/40 hover:bg-primary/5 transition-all group" onClick={() => document.getElementById('photo-upload')?.click()}>
                                  <Camera className="w-8 h-8 text-muted-foreground mb-3 group-hover:text-primary transition-colors" />
                                  <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest group-hover:text-primary transition-colors">Capture Frame</span>
                                </div>
                              )}
                            </div>
                            <input id="photo-upload" type="file" className="hidden" accept="image/*" multiple onChange={handleImageChange} />
                          </div>

                          <div className="space-y-4">
                            <Label className="text-white font-black text-xs uppercase tracking-widest opacity-80">Geospatial Pinning</Label>
                            <Button variant="outline" className={`w-full h-16 border-white/10 rounded-[1.25rem] transition-all text-base font-black active:scale-[0.98] ${coordinates ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'text-white hover:bg-white/5'}`} onClick={handleGetLocation} disabled={isLocating}>
                              {isLocating ? <Loader2 className="w-5 h-5 animate-spin mr-3" /> : <LocateFixed className="w-5 h-5 mr-3" />}
                              {coordinates ? "Coordinates Verified ✓" : "Pin Asset Location"}
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-3">
                              <Label className="text-white text-[10px] font-black uppercase tracking-widest opacity-60">Asset Title</Label>
                              <Input className="glass-morphism h-14 text-white border-white/10 rounded-xl px-5 text-base" placeholder="e.g. Tambaram Hub Secure Driveway" value={spotData.name} onChange={e => setSpotData({...spotData, name: e.target.value})} />
                            </div>
                            <div className="space-y-3">
                              <Label className="text-white text-[10px] font-black uppercase tracking-widest opacity-60">Verified Contact</Label>
                              <Input className="glass-morphism h-14 text-white border-white/10 rounded-xl px-5 text-base" placeholder="e.g. +91 9876543210" value={spotData.phone} onChange={e => setSpotData({...spotData, phone: e.target.value})} />
                            </div>
                            <div className="space-y-3">
                              <Label className="text-white text-[10px] font-black uppercase tracking-widest opacity-60">Bike Market Rate</Label>
                              <div className="relative">
                                <Input className="glass-morphism h-14 text-white/40 border-white/10 bg-white/5 rounded-xl px-5 cursor-not-allowed font-bold" type="text" value={`₹${FIXED_BIKE_RATE}/hr | ₹${FIXED_BIKE_MONTHLY}/mo`} readOnly />
                                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-30" />
                              </div>
                            </div>
                            <div className="space-y-3">
                              <Label className="text-white text-[10px] font-black uppercase tracking-widest opacity-60">Car Market Rate</Label>
                              <div className="relative">
                                <Input className="glass-morphism h-14 text-white/40 border-white/10 bg-white/5 rounded-xl px-5 cursor-not-allowed font-bold" type="text" value={`₹${FIXED_CAR_RATE}/hr | ₹${FIXED_CAR_MONTHLY}/mo`} readOnly />
                                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-30" />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            <Label className="text-white text-[10px] font-black uppercase tracking-widest opacity-60">Entry Protocol</Label>
                            <Textarea className="glass-morphism min-h-[140px] text-white border-white/10 rounded-xl p-5 text-base resize-none" placeholder="Gate access codes or specific parking instructions for renters..." value={spotData.description} onChange={e => setSpotData({...spotData, description: e.target.value})} />
                          </div>

                          <Button className="w-full h-16 rounded-[1.25rem] text-xl font-black bg-primary text-primary-foreground shadow-2xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={() => setStep(2)} disabled={imagePreviews.length < 4 || !spotData.name || !spotData.phone || !coordinates}>Forge Listing</Button>
                        </div>
                      ) : (
                        <div className="space-y-12 animate-in fade-in zoom-in duration-500 py-10">
                          <div className="p-10 rounded-[2.5rem] border border-primary/30 bg-primary/5 relative overflow-hidden group shadow-2xl">
                            <div className="absolute -top-16 -right-16 opacity-[0.03] group-hover:scale-110 transition-transform duration-1000">
                               <Sparkles className="w-64 h-64 text-primary" />
                            </div>
                            <div className="flex items-center gap-5 mb-8 relative z-10">
                               <div className="w-16 h-16 rounded-[1.25rem] bg-primary/20 flex items-center justify-center text-primary shadow-xl">
                                  <Sparkles className="w-8 h-8" strokeWidth={2.5} />
                                </div>
                               <h3 className="font-black text-white text-3xl tracking-tight">SpotInsight Scan</h3>
                            </div>
                            
                            {!aiResult && !isVerifying && <Button className="w-full h-16 bg-primary text-primary-foreground font-black text-lg rounded-[1.25rem] shadow-2xl shadow-primary/30" onClick={handleVerify}>Initiate AI Diagnostic</Button>}
                            
                            {isVerifying && (
                              <div className="flex flex-col items-center justify-center gap-6 py-12 text-primary">
                                <Loader2 className="animate-spin w-12 h-12" strokeWidth={3} />
                                <p className="font-black uppercase tracking-[0.3em] text-xs">Deep Photo Analysis...</p>
                              </div>
                            )}

                            {aiResult && aiResult.isValid && (
                              <div className="p-10 rounded-[2rem] bg-green-500/10 text-green-500 border border-green-500/30 animate-in slide-in-from-top-4">
                                <div className="flex items-center gap-4 mb-5">
                                  <CheckCircle2 className="w-8 h-8 shadow-xl" strokeWidth={3} />
                                  <p className="font-black text-2xl tracking-tight uppercase">PASSED: Certified Asset</p>
                                </div>
                                <p className="text-base leading-relaxed font-medium italic opacity-90">"{aiResult.description}"</p>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-6">
                            <Button variant="ghost" className="h-16 px-10 text-white font-black uppercase tracking-widest text-[10px] rounded-[1.25rem] hover:bg-white/5 transition-all" onClick={() => setStep(1)} disabled={isPublishing}>Return</Button>
                            <Button className="flex-1 h-16 rounded-[1.25rem] text-xl font-black bg-primary text-primary-foreground shadow-2xl shadow-primary/30 active:scale-95 transition-all" disabled={isPublishing} onClick={handlePublish}>
                              {isPublishing ? <Loader2 className="animate-spin w-7 h-7" /> : 'Deploy Asset'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="listings" className="mt-8">
                  <div className="space-y-6">
                    {spotsLoading ? (
                      <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-primary w-16 h-16" strokeWidth={3} /></div>
                    ) : mySpots?.length ? (
                      <div className="grid gap-6">
                        {mySpots.map(spot => (
                          <Card key={spot.id} className="glass-morphism border-white/10 p-6 sm:p-8 rounded-[2rem] group hover:border-primary/40 transition-all shadow-xl">
                            <div className="flex flex-col sm:flex-row gap-8">
                              <div className="w-full sm:w-40 h-40 rounded-[1.5rem] overflow-hidden relative border border-white/10 shrink-0 shadow-2xl">
                                <Image src={spot.imageUrls?.[0]} alt={spot.name} fill className="object-cover group-hover:scale-110 transition-transform duration-700" />
                                {spot.verified && <div className="absolute top-3 right-3 bg-primary p-2 rounded-xl shadow-2xl"><ShieldCheck className="w-4 h-4 text-white" strokeWidth={3} /></div>}
                              </div>
                              <div className="flex-1 flex flex-col justify-between py-1 gap-6">
                                <div className="space-y-4">
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <h4 className="text-white font-black text-2xl tracking-tight">{spot.name}</h4>
                                      <p className="text-sm text-muted-foreground font-bold flex items-center gap-2 mt-1.5 uppercase tracking-tight">
                                        <MapPin className="w-4 h-4 text-primary" /> {spot.address}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-6 pt-2">
                                     <div className="flex flex-col gap-2">
                                        <div className="flex items-center gap-2.5 text-white/90 font-black text-[11px] uppercase tracking-tighter">
                                          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center"><Bike className="w-3.5 h-3.5 text-primary"/></div> 
                                          ₹{FIXED_BIKE_RATE}/hr • ₹{FIXED_BIKE_MONTHLY}/mo
                                        </div>
                                        <div className="flex items-center gap-2.5 text-white/90 font-black text-[11px] uppercase tracking-tighter">
                                          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center"><Car className="w-3.5 h-3.5 text-primary"/></div>
                                          ₹{FIXED_CAR_RATE}/hr • ₹{FIXED_CAR_MONTHLY}/mo
                                        </div>
                                     </div>
                                  </div>
                                </div>
                                <div className="flex justify-end border-t border-white/5 pt-6">
                                  <Button 
                                    variant="destructive" 
                                    className="rounded-[1.25rem] px-8 h-12 gap-2 font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
                                    onClick={() => handleDeleteSpot(spot.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Purge Asset
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <Card className="glass-morphism border-dashed border-white/10 p-32 text-center rounded-[3rem] text-muted-foreground bg-white/5 shadow-inner">
                        <div className="w-20 h-20 bg-white/5 rounded-[2rem] mx-auto flex items-center justify-center mb-8 border border-white/10 shadow-2xl">
                           <Car className="w-10 h-10 opacity-20" />
                        </div>
                        <p className="font-black text-2xl text-white mb-3 tracking-tight">No Active Portfolio</p>
                        <p className="text-sm font-medium max-w-xs mx-auto">Deploy your driveway to the Tambaram grid and start monetizing unused space.</p>
                      </Card>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              <div className="space-y-8 pt-6">
                 <h2 className="text-3xl font-headline font-black text-white flex items-center gap-4 tracking-tighter uppercase">
                    <Clock className="w-10 h-10 text-primary" strokeWidth={2.5} /> Active Handshakes
                 </h2>
                 {bookingsLoading ? (
                   <div className="p-24 flex justify-center"><Loader2 className="animate-spin text-primary w-16 h-16" strokeWidth={3} /></div>
                 ) : hostBookings?.filter(b => b.status === 'pending' || b.status === 'active' || b.status === 'awaiting-payment').length ? (
                   <div className="grid gap-8">
                     {hostBookings.filter(b => b.status === 'pending' || b.status === 'active' || b.status === 'awaiting-payment').map(booking => {
                       return (
                         <Card key={booking.id} className="glass-morphism border-white/10 p-8 sm:p-10 rounded-[2.5rem] transition-all relative overflow-hidden group hover:border-primary/40 shadow-2xl">
                           {(booking.status === 'active' || booking.status === 'awaiting-payment') && <div className="absolute -top-10 -right-10 p-10 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-1000"><Car className="w-48 h-48" /></div>}
                           <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 relative z-10">
                              <div className="flex gap-8">
                                 <div className="w-20 h-20 rounded-[1.5rem] bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shadow-2xl group-hover:bg-primary/20 transition-all"><Car className="w-10 h-10" /></div>
                                 <div className="space-y-2">
                                    <h4 className="text-white font-black text-2xl tracking-tighter uppercase">Handshake #{booking.id.slice(-4)}</h4>
                                    <div className="flex flex-wrap gap-2.5 mb-2">
                                       {booking.bikeCount > 0 && <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/20 gap-2 px-3 py-1 font-black text-[10px] uppercase"><Bike className="w-3 h-3"/> {booking.bikeCount} Bike(s)</Badge>}
                                       {booking.carCount > 0 && <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/20 gap-2 px-3 py-1 font-black text-[10px] uppercase"><Car className="w-3 h-3"/> {booking.carCount} Car(s)</Badge>}
                                       {booking.isSubscription && <Badge className="bg-blue-600 px-3 py-1 font-black text-[10px] uppercase rounded-lg">MONTHLY</Badge>}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <Badge className={`px-4 py-1 font-black text-[9px] tracking-widest uppercase rounded-xl ${booking.status === 'active' ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : booking.status === 'awaiting-payment' ? 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.3)]' : 'bg-orange-500 animate-pulse shadow-[0_0_15px_rgba(249,115,22,0.3)]'}`}>{booking.status.replace('-', ' ')}</Badge>
                                    </div>
                                 </div>
                              </div>
                              <div className="text-right flex flex-col items-end gap-1 w-full md:w-auto">
                                 <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.2em] opacity-60">Settlement Amount</p>
                                 <p className="text-4xl font-black text-primary tracking-tighter">₹{booking.totalAmount?.toFixed(2)}</p>
                              </div>
                           </div>
                           <div className="mt-10 pt-10 border-t border-white/5 space-y-8 relative z-10">
                              {booking.status === 'pending' ? (
                                <div className="space-y-8">
                                  <div className="p-8 rounded-[1.5rem] bg-primary/10 border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-8 group/otp hover:border-primary/50 transition-all">
                                    <div className="flex items-center gap-6">
                                      <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center text-primary shadow-xl group-hover/otp:scale-110 transition-transform">
                                        <KeyRound className="w-7 h-7" strokeWidth={3} />
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-muted-foreground uppercase font-black tracking-[0.2em] mb-1">Handshake Protocol</p>
                                        <p className="text-4xl font-black text-white tracking-[16px] ml-1">{booking.otp}</p>
                                      </div>
                                    </div>
                                    <div className="text-center sm:text-right">
                                      <p className="text-[10px] text-primary font-black uppercase tracking-widest italic mb-2">Timed 10m Verification</p>
                                      <p className="text-xs text-muted-foreground font-medium max-w-[180px]">Provide this code to the renter over the phone or upon arrival.</p>
                                    </div>
                                  </div>

                                  <Button 
                                    variant="ghost" 
                                    className="w-full text-destructive hover:bg-destructive/10 h-16 rounded-[1.25rem] flex items-center justify-center gap-3 font-black text-xs uppercase tracking-widest active:scale-[0.98] transition-all"
                                    onClick={() => handleCancelRequest(booking.id)}
                                  >
                                    <Ban className="w-5 h-5" strokeWidth={2.5} />
                                    Reject Request (Spot Full)
                                  </Button>
                                </div>
                              ) : booking.status === 'active' ? (
                                <div className="space-y-6">
                                   <div className="p-6 rounded-2xl bg-green-500/5 border border-green-500/10 flex items-center justify-between gap-4">
                                      <div className="flex items-center gap-4">
                                         <ShieldCheck className="w-6 h-6 text-green-500" strokeWidth={3} />
                                         <span className="text-xs font-black text-green-500 uppercase tracking-widest">Handshake Verified & Running</span>
                                      </div>
                                      <span className="text-[10px] text-muted-foreground font-black italic tracking-widest uppercase opacity-60">Session Live</span>
                                   </div>
                                   <Button className="w-full h-16 rounded-[1.25rem] font-black text-xl bg-primary text-primary-foreground shadow-2xl shadow-primary/30 active:scale-[0.98] transition-all group" onClick={() => handleEndSession(booking)}>
                                      <LogOut className="w-6 h-6 mr-3 group-hover:translate-x-1 transition-transform" />
                                      End Session & Settle
                                   </Button>
                                </div>
                              ) : (
                                <div className="p-8 rounded-[1.5rem] bg-blue-600/10 border border-blue-600/20 flex items-center gap-5 text-blue-400 group hover:bg-blue-600/20 transition-all">
                                   <AlertCircle className="w-8 h-8 group-hover:scale-110 transition-transform" strokeWidth={3} />
                                   <div className="space-y-1">
                                      <p className="text-lg font-black uppercase tracking-tight">Escrow Processing</p>
                                      <p className="text-xs font-medium text-white/60">Awaiting renter to complete secure payment through the portal.</p>
                                   </div>
                                </div>
                              )}
                           </div>
                         </Card>
                       );
                     })}
                   </div>
                 ) : (
                   <Card className="glass-morphism border-dashed border-white/10 p-32 text-center rounded-[3rem] text-muted-foreground bg-white/5 shadow-inner">
                      <div className="w-16 h-16 bg-white/5 rounded-3xl mx-auto flex items-center justify-center mb-6 border border-white/10">
                        <Clock className="w-8 h-8 opacity-20" />
                      </div>
                      <p className="font-black uppercase tracking-widest text-[10px] opacity-60">Zero active handshakes in the grid.</p>
                   </Card>
                 )}
              </div>
            </div>

            <div className="space-y-10">
               <Card className="glass-morphism border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
                  <CardHeader className="bg-white/5 border-b border-white/5 py-8 px-8">
                    <CardTitle className="text-xl text-white font-headline font-black flex items-center gap-3 uppercase tracking-tighter">
                      <TrendingUp className="w-6 h-6 text-primary" strokeWidth={3} /> Market Alpha
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-8 pt-10 px-8 pb-10">
                     <div className="p-8 rounded-[2rem] bg-white/5 border border-white/5 flex flex-col gap-5 hover:border-primary/40 transition-all cursor-default">
                        <div className="flex justify-between items-center">
                           <span className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">Tambaram Velocity</span>
                           <Badge className="bg-green-500 px-4 py-1 font-black shadow-lg rounded-xl text-[10px]">HIGH DEMAND</Badge>
                        </div>
                        <div className="w-full bg-white/10 h-3 rounded-full overflow-hidden shadow-inner">
                           <div className="bg-gradient-to-r from-primary to-green-500 h-full w-[88%] rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                        </div>
                        <p className="text-[9px] text-muted-foreground font-bold italic text-center uppercase tracking-widest opacity-60">Aggregated from local parking patterns</p>
                     </div>
                     <div className="grid grid-cols-2 gap-5">
                        <div className="p-6 rounded-[1.5rem] bg-white/5 border border-white/5 shadow-lg group hover:border-primary/40 transition-all">
                           <p className="text-[10px] text-muted-foreground uppercase font-black mb-2 tracking-widest opacity-60">Bike Avg.</p>
                           <p className="text-2xl font-black text-white tracking-tighter">₹{FIXED_BIKE_RATE}<span className="text-[10px] text-muted-foreground ml-1">/HR</span></p>
                        </div>
                        <div className="p-6 rounded-[1.5rem] bg-white/5 border border-white/5 shadow-lg group hover:border-primary/40 transition-all">
                           <p className="text-[10px] text-muted-foreground uppercase font-black mb-2 tracking-widest opacity-60">Car Avg.</p>
                           <p className="text-2xl font-black text-primary tracking-tighter">₹{FIXED_CAR_RATE}<span className="text-[10px] text-muted-foreground ml-1">/HR</span></p>
                        </div>
                     </div>
                  </CardContent>
               </Card>

               <Card className="glass-morphism border-primary/20 bg-primary/5 rounded-[2.5rem] p-10 overflow-hidden relative shadow-2xl group">
                  <div className="absolute top-0 right-0 p-6 opacity-[0.05] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
                     <ShieldCheck className="w-32 h-32 text-primary" strokeWidth={3} />
                  </div>
                  <h3 className="font-headline font-black text-white text-2xl mb-5 tracking-tight">Identity Assurance</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed font-medium mb-10">
                    Host protection is our priority. Every handshake is secured via timed OTP, and all renters are identity-verified by AI before they can request access to your asset.
                  </p>
                  <Button variant="outline" className="w-full h-14 rounded-2xl border-primary/20 text-primary hover:bg-primary/10 font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all">Full Policy Disclosure</Button>
               </Card>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto py-48 text-center space-y-12 animate-in fade-in duration-1000">
          <div className="w-28 h-28 bg-primary/10 rounded-[2.5rem] flex items-center justify-center mx-auto border border-primary/20 shadow-2xl relative group overflow-hidden">
             <div className="absolute inset-0 bg-primary/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
             <Car className="w-14 h-14 text-primary relative z-10" />
          </div>
          <div className="space-y-6">
            <h2 className="text-6xl sm:text-7xl font-headline font-black text-white tracking-tighter leading-none">Monetize Your Grid</h2>
            <p className="text-muted-foreground text-2xl max-w-xl mx-auto leading-relaxed font-medium">Join the network of Tambaram homeowners earning through smart, verified parking.</p>
          </div>
          <Button size="lg" className="rounded-[1.5rem] px-20 h-20 text-2xl font-black shadow-2xl shadow-primary/30 active:scale-95 transition-all" asChild><Link href="/login">Initialize Hosting</Link></Button>
        </div>
      )}
    </div>
  );
}
